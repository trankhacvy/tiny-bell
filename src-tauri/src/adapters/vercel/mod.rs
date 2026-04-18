pub mod mapper;
pub mod types;

use async_trait::async_trait;

use crate::adapters::r#trait::{AdapterError, DeploymentMonitor};
use crate::adapters::{Deployment, Platform, Project};

use self::types::{DeploymentsResponse, ProjectsResponse};

pub const DEFAULT_API_BASE: &str = "https://api.vercel.com";

#[derive(Debug)]
pub struct VercelAdapter {
    account_id: String,
    token: String,
    team_id: Option<String>,
    http: reqwest::Client,
    base: String,
}

impl VercelAdapter {
    pub fn new(account_id: String, token: String, team_id: Option<String>) -> Self {
        Self::with_base(account_id, token, team_id, DEFAULT_API_BASE.to_string())
    }

    pub fn with_base(
        account_id: String,
        token: String,
        team_id: Option<String>,
        base: String,
    ) -> Self {
        Self {
            account_id,
            token,
            team_id,
            http: reqwest::Client::new(),
            base,
        }
    }

    fn team_query(&self) -> String {
        self.team_id
            .as_ref()
            .map(|t| format!("teamId={t}"))
            .unwrap_or_default()
    }

    async fn get<T: for<'de> serde::Deserialize<'de>>(
        &self,
        path: &str,
        extra_query: &str,
    ) -> Result<T, AdapterError> {
        let sep_first = if path.contains('?') { "&" } else { "?" };
        let tq = self.team_query();
        let mut query = String::new();
        if !extra_query.is_empty() {
            query.push_str(sep_first);
            query.push_str(extra_query);
        }
        if !tq.is_empty() {
            if query.is_empty() {
                query.push_str(sep_first);
            } else {
                query.push('&');
            }
            query.push_str(&tq);
        }
        let url = format!("{}{}{}", self.base, path, query);

        let res = self
            .http
            .get(&url)
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(AdapterError::from)?;

        let status = res.status();
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(AdapterError::Unauthorized);
        }
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            let retry = res
                .headers()
                .get("x-ratelimit-reset")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(60);
            return Err(AdapterError::RateLimited(retry));
        }
        let res = res
            .error_for_status()
            .map_err(|e| AdapterError::Platform(e.to_string()))?;
        res.json().await.map_err(AdapterError::from)
    }
}

#[async_trait]
impl DeploymentMonitor for VercelAdapter {
    fn platform(&self) -> Platform {
        Platform::Vercel
    }

    fn account_id(&self) -> &str {
        &self.account_id
    }

    async fn list_projects(&self) -> Result<Vec<Project>, AdapterError> {
        let res: ProjectsResponse = self.get("/v9/projects", "limit=100").await?;
        let account_id = self.account_id.clone();
        Ok(res
            .projects
            .into_iter()
            .map(|p| mapper::project_from_dto(p, &account_id))
            .collect())
    }

    async fn list_deployments(
        &self,
        project_id: &str,
        limit: usize,
    ) -> Result<Vec<Deployment>, AdapterError> {
        let q = format!("projectId={project_id}&limit={limit}");
        let res: DeploymentsResponse = self.get("/v6/deployments", &q).await?;
        let pid = project_id.to_string();
        Ok(res
            .deployments
            .into_iter()
            .map(|d| mapper::deployment_from_dto(d, &pid))
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::DeploymentState;
    use wiremock::matchers::{bearer_token, method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn adapter(base: String, team: Option<String>) -> VercelAdapter {
        VercelAdapter::with_base("acc_1".into(), "tok".into(), team, base)
    }

    #[tokio::test]
    async fn list_projects_personal() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v9/projects"))
            .and(bearer_token("tok"))
            .and(query_param("limit", "100"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "projects": [{
                    "id": "prj_1",
                    "name": "acme-web",
                    "framework": "nextjs",
                    "latestDeployments": [{
                        "id": "dpl_1",
                        "url": "acme-web.vercel.app",
                        "created": 1_700_000_000_000i64,
                        "readyState": "READY",
                        "target": "production",
                        "meta": {
                            "githubCommitMessage": "Initial commit",
                            "githubCommitSha": "abc1234",
                            "githubCommitAuthorName": "maya",
                            "githubCommitRef": "main"
                        }
                    }]
                }]
            })))
            .mount(&server)
            .await;

        let a = adapter(server.uri(), None);
        let projects = a.list_projects().await.expect("projects");
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].id, "prj_1");
        assert_eq!(projects[0].name, "acme-web");
        let latest = projects[0].latest_deployment.as_ref().expect("latest");
        assert_eq!(latest.state, DeploymentState::Ready);
        assert_eq!(latest.commit_message.as_deref(), Some("Initial commit"));
        assert_eq!(latest.branch.as_deref(), Some("main"));
        assert_eq!(latest.author_name.as_deref(), Some("maya"));
    }

    #[tokio::test]
    async fn list_projects_team_query_param() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v9/projects"))
            .and(query_param("teamId", "team_x"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "projects": []
            })))
            .mount(&server)
            .await;

        let a = adapter(server.uri(), Some("team_x".into()));
        let _ = a.list_projects().await.expect("projects");
    }

    #[tokio::test]
    async fn list_deployments_maps_dto() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v6/deployments"))
            .and(query_param("projectId", "prj_1"))
            .and(query_param("limit", "10"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "deployments": [
                    {
                        "uid": "dpl_1",
                        "url": "acme-web.vercel.app",
                        "inspectorUrl": "https://vercel.com/acme/acme-web/dpl_1",
                        "createdAt": 1_700_000_000_000i64,
                        "readyAt":   1_700_000_010_000i64,
                        "readyState": "READY",
                        "target": "production",
                        "meta": {
                            "githubCommitMessage": "Update README.md",
                            "githubCommitRef": "main",
                            "githubCommitAuthorName": "rajatkulkarni"
                        }
                    },
                    {
                        "uid": "dpl_2",
                        "readyState": "BUILDING",
                        "createdAt": 1_700_000_100_000i64,
                        "meta": {}
                    }
                ]
            })))
            .mount(&server)
            .await;

        let a = adapter(server.uri(), None);
        let deps = a.list_deployments("prj_1", 10).await.expect("deps");
        assert_eq!(deps.len(), 2);
        assert_eq!(deps[0].state, DeploymentState::Ready);
        assert_eq!(deps[0].environment, "production");
        assert_eq!(deps[0].url.as_deref(), Some("https://acme-web.vercel.app"));
        assert_eq!(
            deps[0].inspector_url.as_deref(),
            Some("https://vercel.com/acme/acme-web/dpl_1")
        );
        assert_eq!(deps[0].duration_ms, Some(10_000));
        assert_eq!(deps[0].commit_message.as_deref(), Some("Update README.md"));
        assert_eq!(deps[1].state, DeploymentState::Building);
    }

    #[tokio::test]
    async fn unauthorized_token_surfaces_error() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v9/projects"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;

        let a = adapter(server.uri(), None);
        let err = a.list_projects().await.unwrap_err();
        assert!(matches!(err, AdapterError::Unauthorized));
    }

    #[tokio::test]
    async fn rate_limit_surfaces_retry_after() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v9/projects"))
            .respond_with(
                ResponseTemplate::new(429).insert_header("x-ratelimit-reset", "42"),
            )
            .mount(&server)
            .await;

        let a = adapter(server.uri(), None);
        let err = a.list_projects().await.unwrap_err();
        assert!(matches!(err, AdapterError::RateLimited(42)));
    }
}
