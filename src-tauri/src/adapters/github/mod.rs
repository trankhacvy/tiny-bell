pub mod cache;
pub mod mapper;
pub mod types;

use std::sync::Arc;

use async_trait::async_trait;

use crate::adapters::r#trait::{AdapterError, DeploymentMonitor};
use crate::adapters::{Deployment, Platform, Project};

pub use self::cache::GitHubEtagCache;
use self::types::WorkflowRunsResponse;

pub const DEFAULT_API_BASE: &str = "https://api.github.com";

#[derive(Debug)]
pub struct GitHubAdapter {
    account_id: String,
    token: String,
    monitored_repos: Vec<String>,
    http: reqwest::Client,
    base: String,
    /// Per-account cache of `{etag, deployments}` per monitored repo. Lives in
    /// the `AdapterRegistry` and is injected here so it survives the registry
    /// rebuilding the adapter on every poll cycle.
    etag_cache: Arc<GitHubEtagCache>,
}

impl GitHubAdapter {
    pub fn new(
        account_id: String,
        token: String,
        monitored_repos: Option<Vec<String>>,
        etag_cache: Arc<GitHubEtagCache>,
    ) -> Self {
        Self::with_base(
            account_id,
            token,
            monitored_repos,
            DEFAULT_API_BASE.to_string(),
            etag_cache,
        )
    }

    pub fn with_base(
        account_id: String,
        token: String,
        monitored_repos: Option<Vec<String>>,
        base: String,
        etag_cache: Arc<GitHubEtagCache>,
    ) -> Self {
        Self {
            account_id,
            token,
            monitored_repos: monitored_repos.unwrap_or_default(),
            http: reqwest::Client::new(),
            base,
            etag_cache,
        }
    }

    /// Conditional per-repo fetch that returns cached deployments on 304.
    async fn fetch_runs_for_repo(
        &self,
        repo: &str,
        per_page: usize,
    ) -> Result<Vec<Deployment>, AdapterError> {
        let path = format!("/repos/{repo}/actions/runs?per_page={per_page}");
        let url = format!("{}{}", self.base, path);

        let mut req = self
            .http
            .get(&url)
            .bearer_auth(&self.token)
            .header("User-Agent", "tiny-bell")
            .header("Accept", "application/vnd.github+json");

        let known_etag = self.etag_cache.etag(repo);
        if let Some(etag) = &known_etag {
            req = req.header("If-None-Match", etag);
        }

        let res = req.send().await.map_err(AdapterError::from)?;
        let status = res.status();

        // A 304 means "nothing changed"; the body is empty and the request
        // does NOT count against the GitHub rate limit.
        if status == reqwest::StatusCode::NOT_MODIFIED {
            log::debug!(
                "github: 304 Not Modified for {repo} — reusing cached deployments"
            );
            return Ok(self.etag_cache.deployments(repo).unwrap_or_default());
        }

        if status == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AdapterError::Unauthorized);
        }
        if status == reqwest::StatusCode::FORBIDDEN {
            let remaining = res
                .headers()
                .get("x-ratelimit-remaining")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok());
            if remaining == Some(0) {
                let reset = res
                    .headers()
                    .get("x-ratelimit-reset")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<i64>().ok())
                    .map(|epoch| {
                        let now = chrono::Utc::now().timestamp();
                        (epoch - now).max(1) as u64
                    })
                    .unwrap_or(60);
                return Err(AdapterError::RateLimited(reset));
            }
            return Err(AdapterError::Unauthorized);
        }
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AdapterError::RateLimited(60));
        }

        // 200 OK: capture the new ETag before consuming the body.
        let new_etag = res
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(String::from);

        let body: WorkflowRunsResponse = res
            .error_for_status()
            .map_err(|e| AdapterError::Platform(e.to_string()))?
            .json()
            .await
            .map_err(AdapterError::from)?;

        let deployments: Vec<Deployment> = body
            .workflow_runs
            .into_iter()
            .map(|run| mapper::deployment_from_run(run, repo))
            .collect();

        if let Some(etag) = new_etag {
            self.etag_cache.set(repo, etag, deployments.clone());
        }

        Ok(deployments)
    }
}

#[async_trait]
impl DeploymentMonitor for GitHubAdapter {
    fn platform(&self) -> Platform {
        Platform::GitHub
    }

    fn account_id(&self) -> &str {
        &self.account_id
    }

    async fn list_projects(&self) -> Result<Vec<Project>, AdapterError> {
        Ok(self
            .monitored_repos
            .iter()
            .map(|full_name| {
                let name = full_name.split('/').last().unwrap_or(full_name);
                Project {
                    id: full_name.clone(),
                    account_id: self.account_id.clone(),
                    platform: Platform::GitHub,
                    name: name.to_string(),
                    url: Some(format!("https://github.com/{full_name}")),
                    framework: None,
                    latest_deployment: None,
                }
            })
            .collect())
    }

    async fn list_recent_deployments(
        &self,
        project_ids: Option<&[String]>,
        limit: usize,
    ) -> Result<Vec<Deployment>, AdapterError> {
        let repos: Vec<&String> = match project_ids {
            Some(ids) if !ids.is_empty() => ids
                .iter()
                .filter(|id| self.monitored_repos.contains(id))
                .collect(),
            _ => self.monitored_repos.iter().collect(),
        };

        // Drop cache entries for repos the user no longer monitors.
        let monitored: std::collections::HashSet<&str> = self
            .monitored_repos
            .iter()
            .map(String::as_str)
            .collect();
        self.etag_cache.retain(|repo| monitored.contains(repo));

        if repos.is_empty() {
            return Ok(Vec::new());
        }

        let per_repo = (limit / repos.len()).max(5).min(10);
        let mut all_deployments = Vec::new();

        for repo in &repos {
            match self.fetch_runs_for_repo(repo, per_repo).await {
                Ok(deps) => all_deployments.extend(deps),
                Err(AdapterError::Unauthorized) => return Err(AdapterError::Unauthorized),
                Err(AdapterError::RateLimited(s)) => return Err(AdapterError::RateLimited(s)),
                Err(e) => {
                    log::warn!("github: failed to fetch runs for {repo}: {e}");
                    continue;
                }
            }
        }

        all_deployments.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        all_deployments.truncate(limit);
        Ok(all_deployments)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::DeploymentState;
    use wiremock::matchers::{bearer_token, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn adapter(base: String, repos: Vec<String>) -> GitHubAdapter {
        GitHubAdapter::with_base(
            "acc_gh".into(),
            "ghp_tok".into(),
            Some(repos),
            base,
            Arc::new(GitHubEtagCache::new()),
        )
    }

    fn adapter_with_cache(
        base: String,
        repos: Vec<String>,
        cache: Arc<GitHubEtagCache>,
    ) -> GitHubAdapter {
        GitHubAdapter::with_base(
            "acc_gh".into(),
            "ghp_tok".into(),
            Some(repos),
            base,
            cache,
        )
    }

    #[tokio::test]
    async fn list_projects_returns_monitored_repos() {
        let a = adapter(
            "https://unused".into(),
            vec!["octocat/hello".into(), "org/repo".into()],
        );
        let projects = a.list_projects().await.unwrap();
        assert_eq!(projects.len(), 2);
        assert_eq!(projects[0].id, "octocat/hello");
        assert_eq!(projects[0].name, "hello");
        assert_eq!(projects[0].platform, Platform::GitHub);
        assert_eq!(projects[1].id, "org/repo");
        assert_eq!(projects[1].name, "repo");
    }

    #[tokio::test]
    async fn list_recent_deployments_fetches_runs() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/repos/octocat/hello/actions/runs"))
            .and(bearer_token("ghp_tok"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "workflow_runs": [{
                    "id": 12345,
                    "name": "CI",
                    "status": "completed",
                    "conclusion": "success",
                    "html_url": "https://github.com/octocat/hello/actions/runs/12345",
                    "head_branch": "main",
                    "head_sha": "abc1234def",
                    "head_commit": { "message": "Fix tests" },
                    "actor": { "login": "octocat", "avatar_url": "https://avatars.githubusercontent.com/u/1" },
                    "workflow_id": 100,
                    "event": "push",
                    "created_at": "2026-04-18T10:00:00Z",
                    "updated_at": "2026-04-18T10:05:00Z",
                    "run_started_at": "2026-04-18T10:00:10Z"
                }]
            })))
            .mount(&server)
            .await;

        let a = adapter(server.uri(), vec!["octocat/hello".into()]);
        let deps = a.list_recent_deployments(None, 100).await.unwrap();
        assert_eq!(deps.len(), 1);
        assert_eq!(deps[0].id, "12345");
        assert_eq!(deps[0].project_id, "octocat/hello");
        assert_eq!(deps[0].state, DeploymentState::Ready);
        assert_eq!(deps[0].service_name.as_deref(), Some("CI"));
        assert_eq!(deps[0].service_id.as_deref(), Some("100"));
        assert_eq!(deps[0].branch.as_deref(), Some("main"));
        assert_eq!(deps[0].commit_message.as_deref(), Some("Fix tests"));
        assert_eq!(deps[0].author_name.as_deref(), Some("octocat"));
        assert_eq!(deps[0].environment, "push");
    }

    #[tokio::test]
    async fn unauthorized_surfaces() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/repos/octocat/hello/actions/runs"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;

        let a = adapter(server.uri(), vec!["octocat/hello".into()]);
        let err = a.list_recent_deployments(None, 10).await.unwrap_err();
        assert!(matches!(err, AdapterError::Unauthorized));
    }

    #[tokio::test]
    async fn rate_limit_403_surfaces_correctly() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/repos/octocat/hello/actions/runs"))
            .respond_with(
                ResponseTemplate::new(403)
                    .insert_header("x-ratelimit-remaining", "0")
                    .insert_header(
                        "x-ratelimit-reset",
                        &(chrono::Utc::now().timestamp() + 120).to_string(),
                    ),
            )
            .mount(&server)
            .await;

        let a = adapter(server.uri(), vec!["octocat/hello".into()]);
        let err = a.list_recent_deployments(None, 10).await.unwrap_err();
        assert!(matches!(err, AdapterError::RateLimited(_)));
    }

    #[tokio::test]
    async fn empty_monitored_repos_returns_empty() {
        let a = adapter("https://unused".into(), vec![]);
        let deps = a.list_recent_deployments(None, 10).await.unwrap();
        assert!(deps.is_empty());
    }

    #[tokio::test]
    async fn first_200_stores_etag_and_deployments() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/repos/octocat/hello/actions/runs"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("etag", r#"W/"abc123""#)
                    .set_body_json(serde_json::json!({
                        "workflow_runs": [{
                            "id": 1,
                            "name": "CI",
                            "status": "completed",
                            "conclusion": "success",
                            "head_branch": "main",
                            "head_sha": "abc",
                            "created_at": "2026-04-20T10:00:00Z",
                            "updated_at": "2026-04-20T10:01:00Z",
                            "run_started_at": "2026-04-20T10:00:05Z"
                        }]
                    })),
            )
            .mount(&server)
            .await;

        let cache = Arc::new(GitHubEtagCache::new());
        let a = adapter_with_cache(
            server.uri(),
            vec!["octocat/hello".into()],
            cache.clone(),
        );
        let deps = a.list_recent_deployments(None, 10).await.unwrap();
        assert_eq!(deps.len(), 1);

        // ETag and deployments are now in the cache.
        assert_eq!(cache.etag("octocat/hello").as_deref(), Some(r#"W/"abc123""#));
        assert_eq!(cache.deployments("octocat/hello").unwrap().len(), 1);
    }

    #[tokio::test]
    async fn subsequent_304_returns_cached_deployments() {
        let server = MockServer::start().await;
        // Second request: client sends If-None-Match, server answers 304.
        Mock::given(method("GET"))
            .and(path("/repos/octocat/hello/actions/runs"))
            .and(wiremock::matchers::header(
                "if-none-match",
                r#"W/"abc123""#,
            ))
            .respond_with(ResponseTemplate::new(304))
            .mount(&server)
            .await;

        // Pre-seed the cache as if a previous cycle returned 200.
        let cache = Arc::new(GitHubEtagCache::new());
        let seeded = Deployment {
            id: "42".into(),
            project_id: "octocat/hello".into(),
            service_id: None,
            service_name: Some("CI".into()),
            state: crate::adapters::DeploymentState::Ready,
            environment: "push".into(),
            url: None,
            inspector_url: None,
            branch: Some("main".into()),
            commit_sha: Some("abc".into()),
            commit_message: None,
            author_name: None,
            author_avatar: None,
            created_at: 1_700_000_000_000,
            finished_at: None,
            duration_ms: None,
            progress: None,
        };
        cache.set(
            "octocat/hello",
            r#"W/"abc123""#.to_string(),
            vec![seeded.clone()],
        );

        let a = adapter_with_cache(
            server.uri(),
            vec!["octocat/hello".into()],
            cache.clone(),
        );
        let deps = a.list_recent_deployments(None, 10).await.unwrap();
        assert_eq!(deps.len(), 1);
        assert_eq!(deps[0].id, "42");
        // Cache is unchanged after a 304.
        assert_eq!(cache.etag("octocat/hello").as_deref(), Some(r#"W/"abc123""#));
    }

    #[tokio::test]
    async fn removing_repo_prunes_its_cache_entry() {
        let cache = Arc::new(GitHubEtagCache::new());
        cache.set(
            "octocat/hello",
            r#"W/"a""#.into(),
            vec![],
        );
        cache.set("other/repo", r#"W/"b""#.into(), vec![]);
        assert_eq!(cache.len(), 2);

        // Adapter is only monitoring one of the two cached repos.
        let a = adapter_with_cache(
            "https://unused".into(),
            vec!["other/repo".into()],
            cache.clone(),
        );
        // A project-id filter with nothing monitored makes `repos` empty,
        // which short-circuits before any HTTP call. `retain` still runs first.
        let _ = a
            .list_recent_deployments(Some(&["unmonitored/repo".into()]), 10)
            .await
            .unwrap();
        // The no-longer-monitored repo is evicted.
        assert_eq!(cache.len(), 1);
        assert!(cache.etag("octocat/hello").is_none());
        assert!(cache.etag("other/repo").is_some());
    }
}
