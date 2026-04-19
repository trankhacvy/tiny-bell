# Plan — GitHub Actions Monitoring

Add GitHub Actions workflow run monitoring as a third platform alongside Vercel and Railway. Users connect via **OAuth or PAT** (same dual-mode UI), optionally select repositories to monitor, and see workflow runs in the existing deployment feed. This plan is written against the actual code — all file paths, line numbers, and code snippets reference the current codebase.

---

## 1. GitHub Actions API summary

- **Base URL**: `https://api.github.com`
- **Auth**: `Authorization: Bearer {token}` + **required** `User-Agent: dev-radio` header (GitHub rejects requests without User-Agent)
- **Key endpoints**:
  - `GET /user` — validate token, get profile (login, name, email, avatar_url)
  - `GET /user/repos?sort=pushed&per_page=30` — list repos user has push access to, most recently pushed first
  - `GET /repos/{owner}/{repo}/actions/runs?per_page=10` — list recent workflow runs for a repo
- **Rate limit**: 5,000 req/hour for authenticated users. Returns `x-ratelimit-remaining` and `x-ratelimit-reset` headers. Rate-limited requests return **403** (not 429) with `x-ratelimit-remaining: 0`.
- **OAuth flow**: Standard authorization code grant (same as Railway):
  - Authorize: `https://github.com/login/oauth/authorize`
  - Token: `https://github.com/login/oauth/access_token`
  - GitHub OAuth tokens **do not expire** — no refresh token, same treatment as Vercel.
  - Register an OAuth App at `https://github.com/settings/developers`
  - Scopes: `repo read:user`

---

## 2. Current state of the codebase

| Concern | File | Current behavior |
|---|---|---|
| Platform enum | `src-tauri/src/adapters/mod.rs:10-15` | `Vercel` and `Railway` variants. `key()` and `from_key()` match on those two. |
| DeploymentMonitor trait | `src-tauri/src/adapters/trait.rs:30-38` | `platform()`, `account_id()`, `list_projects()`, `list_recent_deployments()`. Generic — ready for a third impl. |
| Adapter registry | `src-tauri/src/adapters/registry.rs:37-49` | Match on `Platform::Vercel` and `Platform::Railway` in `hydrate()`. Passes `account_id`, `token`, `scope_id`. |
| OAuth helpers | `src-tauri/src/auth/oauth.rs` | Generic PKCE, state generation, loopback server on ports 53123-53125. Fully reusable. |
| PAT connect | `src-tauri/src/auth/pat.rs:16-19` | Matches `Platform::Vercel` and `Platform::Railway`. Needs a third arm. |
| Token provider | `src-tauri/src/auth/token_provider.rs:23-38` | Handles Railway refresh, Vercel pass-through. Needs a GitHub pass-through arm. |
| start_oauth command | `src-tauri/src/commands/accounts.rs:57-65` | Matches `"vercel"` and `"railway"`. Needs `"github"`. |
| validate_token command | `src-tauri/src/commands/accounts.rs:170-173` | Matches `Platform::Vercel` and `Platform::Railway`. Needs `Platform::GitHub`. |
| Build env injection | `src-tauri/build.rs:22-48` | Injects Vercel + Railway env vars. Needs `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. |
| StoredAccount | `src-tauri/src/store.rs:24-34` | Has `scope_id: Option<String>` but no `monitored_repos` field. |
| delete_account | `src-tauri/src/store.rs:71-84` | Hard-codes `[Platform::Vercel, Platform::Railway]` for keychain cleanup. |
| Keychain vault | `src-tauri/src/keychain.rs` | Uses `StoredSecret::Pat` or `StoredSecret::Oauth`. GitHub will use `Pat` (tokens don't expire). |
| CSP | `src-tauri/tauri.conf.json:48` | `connect-src` has Vercel + Railway APIs. Needs `https://api.github.com https://github.com`. |
| Capabilities | `src-tauri/capabilities/default.json:17-21` | `opener:allow-open-url` has Vercel + Railway. Needs `https://github.com/*`. |
| Frontend Platform type | `src/lib/accounts.ts:1` | `type Platform = "vercel" \| "railway"`. Needs `"github"`. |
| PLATFORM_LABEL | `src/lib/accounts.ts:106-109` | Two entries. Needs `github: "GitHub"`. |
| TOKEN_LINKS | `src/components/account/add-account-form.tsx:27-42` | Config for Vercel + Railway token URLs. Needs GitHub entry. |
| OAUTH_BUTTON_LABEL | `src/components/account/add-account-form.tsx:44-47` | Two entries. Needs `github`. |
| Provider mark | `src/components/dr/provider-mark.tsx:1-19` | Imports vercel.svg and railway.svg. Needs github.svg. |
| Provider chip | `src/components/dr/provider-chip.tsx:19-22` | `ACCENT_VAR` for vercel and railway. Needs github accent. |
| Add-account dialog | `src/components/account/add-account-dialog.tsx:24,58` | `PLATFORMS` array is `["vercel", "railway"]`. Needs `"github"`. |
| Onboarding welcome | `src/app/desktop/views/onboarding-view.tsx:138` | Grid renders `["vercel", "railway"]`. Needs `"github"`. |
| Onboarding connect text | `src/app/desktop/views/onboarding-view.tsx:188-189` | Per-platform copy. Only covers vercel/railway. |
| Settings accounts | `src/app/desktop/views/settings/accounts-tab.tsx` | Shows accounts list. GitHub accounts need a "Manage repos" action. |
| CSS accent vars | `src/index.css:43-45` | Has `--accent-vercel-*` and `--accent-railway-*`. Needs `--accent-github-*`. |
| Provider SVG assets | `src/assets/providers/` | `vercel.svg` and `railway.svg`. Needs `github.svg`. |
| .env.example | `.env.example` | Vercel vars only. Needs GitHub vars. |

---

## 3. Design decisions

### 3.1 OAuth + PAT (matching Vercel & Railway)

We implement both auth paths, consistent with the other two platforms. The infrastructure is already built:

- **OAuth**: GitHub OAuth App uses a standard authorization code flow. We reuse `oauth::spawn_loopback_server`, `generate_pkce`, `generate_state`. GitHub doesn't require PKCE but we can include `state` for CSRF protection. Tokens don't expire — store as `StoredSecret::Pat` (same as Vercel).
- **PAT**: User pastes `ghp_...` (classic) or `github_pat_...` (fine-grained). We validate via `GET /user`.

### 3.2 Repository selection

**The problem**: Vercel/Railway auto-discover all projects (~10-50). GitHub users can access hundreds of repos, most without relevant Actions workflows.

**Solution**: Add an optional `monitored_repos: Option<Vec<String>>` field to `StoredAccount`. For GitHub, the adapter's `list_projects()` returns only repos in this list. For Vercel/Railway, this field stays `None` and behavior is unchanged.

- On first connect, auto-populate with repos that have recent pushes (top 30 by `pushed_at`).
- Provide a "Manage repos" UI in Settings to add/remove repos.
- Cap at 30 repos per account to bound API calls.

### 3.3 Rate limit handling

At 30 repos, each poll = ~31 requests. At 30s interval = 120 polls/hour = ~3,720 req/hour (under 5k limit).

GitHub returns `403` (not `429`) when rate-limited. We detect via `x-ratelimit-remaining: 0` on 403 responses and convert to `AdapterError::RateLimited(retry_after)` using the `x-ratelimit-reset` header. The existing per-account cooldown in `poller.rs:162-185` handles the rest.

### 3.4 Domain model mapping

```
GitHub Repository  →  Project { id: "owner/repo", name: "repo" }
GitHub Workflow Run  →  Deployment {
    service_id: workflow_id,
    service_name: workflow_name,
    environment: event_type (push, pull_request, etc.),
}
```

---

## 4. Changes — file by file

### 4.1 New Rust files

#### `src-tauri/src/auth/github.rs`

OAuth flow + profile fetch. Follows `vercel.rs` structure exactly.

```rust
use serde::Deserialize;
use tauri::{AppHandle, Emitter};

use crate::adapters::{AccountProfile, Platform};
use crate::auth::oauth::{
    self, generate_state, redirect_uri_for, CallbackResult, OAUTH_TIMEOUT_SECS,
};
use crate::auth::AuthError;
use crate::store::{self, AccountHealth, StoredAccount};

const CLIENT_ID: &str = env!("GITHUB_CLIENT_ID");
const CLIENT_SECRET: &str = env!("GITHUB_CLIENT_SECRET");
const AUTHORIZE_URL: &str = "https://github.com/login/oauth/authorize";
const TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const SCOPES: &str = "repo read:user";
pub const API_BASE: &str = "https://api.github.com";

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Debug, Deserialize)]
struct GitHubUser {
    #[serde(alias = "node_id")]
    id: i64,
    login: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    avatar_url: Option<String>,
}

pub fn is_configured() -> bool {
    !CLIENT_ID.is_empty() && !CLIENT_SECRET.is_empty()
}

pub async fn fetch_github_profile(token: &str) -> Result<AccountProfile, AuthError> {
    fetch_github_profile_with_base(token, API_BASE).await
}

pub async fn fetch_github_profile_with_base(
    token: &str,
    api_base: &str,
) -> Result<AccountProfile, AuthError> {
    let client = reqwest::Client::new();
    let res = client
        .get(format!("{api_base}/user"))
        .bearer_auth(token)
        .header("User-Agent", "dev-radio")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(AuthError::from)?;

    let status = res.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(AuthError::Provider("Invalid token".into()));
    }

    let user: GitHubUser = res
        .error_for_status()
        .map_err(AuthError::from)?
        .json()
        .await
        .map_err(AuthError::from)?;

    let display = user.name.clone()
        .unwrap_or_else(|| user.login.clone());

    Ok(AccountProfile {
        id: user.id.to_string(),
        platform: Platform::GitHub,
        display_name: display,
        email: user.email,
        avatar_url: user.avatar_url,
        scope_id: None,
    })
}

pub async fn start_github_oauth(app: AppHandle) -> Result<AccountProfile, AuthError> {
    if !is_configured() {
        return Err(AuthError::Config(
            "GitHub OAuth not configured — set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET at build time"
                .into(),
        ));
    }

    let state = generate_state();
    let binding = oauth::spawn_loopback_server(state.clone())?;
    let redirect = redirect_uri_for(binding.port);

    let authorize_url = format!(
        "{AUTHORIZE_URL}?client_id={cid}&redirect_uri={ruri}&scope={scope}&state={state}",
        cid = urlencoding::encode(CLIENT_ID),
        ruri = urlencoding::encode(&redirect),
        scope = urlencoding::encode(SCOPES),
        state = urlencoding::encode(&state),
    );

    if let Err(e) = open_browser(&authorize_url) {
        oauth::abort_current();
        return Err(e);
    }

    let callback = tokio::time::timeout(
        std::time::Duration::from_secs(OAUTH_TIMEOUT_SECS),
        binding.code_rx,
    )
    .await;

    let code = match callback {
        Err(_) => { oauth::abort_current(); return Err(AuthError::Timeout); }
        Ok(Err(_)) => { oauth::abort_current(); return Err(AuthError::ServerClosed); }
        Ok(Ok(Err(e))) => { oauth::abort_current(); return Err(e); }
        Ok(Ok(Ok(CallbackResult::ProviderError(msg)))) => {
            oauth::abort_current();
            return Err(AuthError::Provider(msg));
        }
        Ok(Ok(Ok(CallbackResult::Code(code)))) => code,
    };

    oauth::abort_current();

    // Exchange code for token
    let client = reqwest::Client::new();
    let res = client
        .post(TOKEN_URL)
        .header("Accept", "application/json")
        .form(&[
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("code", code.as_str()),
            ("redirect_uri", redirect.as_str()),
        ])
        .send()
        .await
        .map_err(AuthError::from)?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(AuthError::Provider(format!(
            "token exchange failed ({status}): {body}"
        )));
    }

    let token: TokenResponse = res.json().await.map_err(AuthError::from)?;
    let profile = fetch_github_profile(&token.access_token).await?;

    let account_id = uuid::Uuid::new_v4().to_string();
    crate::keychain::store_token(Platform::GitHub.key(), &account_id, &token.access_token)?;
    let stored = StoredAccount {
        id: account_id.clone(),
        platform: Platform::GitHub,
        display_name: profile.display_name.clone(),
        scope_id: None,
        enabled: true,
        created_at: chrono::Utc::now().timestamp_millis(),
        health: AccountHealth::Ok,
        monitored_repos: None,
    };
    store::save_account(&app, &stored).map_err(AuthError::Store)?;

    let emitted = AccountProfile {
        id: account_id,
        ..profile
    };
    let _ = app.emit("oauth:complete", &emitted);

    Ok(emitted)
}

fn open_browser(url: &str) -> Result<(), AuthError> {
    tauri_plugin_opener::open_url(url, None::<&str>)
        .map_err(|e| AuthError::Server(format!("failed to open browser: {e}")))
}
```

**Tests** (wiremock, same pattern as `vercel.rs` tests):
- `fetches_github_profile` — mock `GET /user`, verify fields
- `unauthorized_surfaces_error` — mock 401, verify `AuthError::Provider`
- `non_json_body_surfaces_network_error`

---

#### `src-tauri/src/adapters/github/mod.rs`

Adapter struct + `DeploymentMonitor` impl. Follows `vercel/mod.rs` structure.

```rust
pub mod mapper;
pub mod types;

use async_trait::async_trait;

use crate::adapters::r#trait::{AdapterError, DeploymentMonitor};
use crate::adapters::{Deployment, Platform, Project};

use self::types::WorkflowRunsResponse;

pub const DEFAULT_API_BASE: &str = "https://api.github.com";

#[derive(Debug)]
pub struct GitHubAdapter {
    account_id: String,
    token: String,
    monitored_repos: Vec<String>,   // e.g. ["owner/repo1", "owner/repo2"]
    http: reqwest::Client,
    base: String,
}

impl GitHubAdapter {
    pub fn new(
        account_id: String,
        token: String,
        monitored_repos: Option<Vec<String>>,
    ) -> Self {
        Self::with_base(account_id, token, monitored_repos, DEFAULT_API_BASE.to_string())
    }

    pub fn with_base(
        account_id: String,
        token: String,
        monitored_repos: Option<Vec<String>>,
        base: String,
    ) -> Self {
        Self {
            account_id,
            token,
            monitored_repos: monitored_repos.unwrap_or_default(),
            http: reqwest::Client::new(),
            base,
        }
    }

    async fn get<T: for<'de> serde::Deserialize<'de>>(
        &self,
        path: &str,
    ) -> Result<T, AdapterError> {
        let url = format!("{}{}", self.base, path);
        let res = self.http
            .get(&url)
            .bearer_auth(&self.token)
            .header("User-Agent", "dev-radio")
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(AdapterError::from)?;

        let status = res.status();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AdapterError::Unauthorized);
        }
        if status == reqwest::StatusCode::FORBIDDEN {
            // GitHub returns 403 for rate limits
            let remaining = res.headers()
                .get("x-ratelimit-remaining")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok());
            if remaining == Some(0) {
                let reset = res.headers()
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

        res.error_for_status()
            .map_err(|e| AdapterError::Platform(e.to_string()))?
            .json()
            .await
            .map_err(AdapterError::from)
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
        // Return one Project per monitored repo
        Ok(self.monitored_repos.iter().map(|full_name| {
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
        }).collect())
    }

    async fn list_recent_deployments(
        &self,
        project_ids: Option<&[String]>,
        limit: usize,
    ) -> Result<Vec<Deployment>, AdapterError> {
        let repos: Vec<&String> = match project_ids {
            Some(ids) if !ids.is_empty() => {
                ids.iter().filter(|id| self.monitored_repos.contains(id)).collect()
            }
            _ => self.monitored_repos.iter().collect(),
        };

        let per_repo = (limit / repos.len().max(1)).max(5).min(10);
        let mut all_deployments = Vec::new();

        for repo in &repos {
            let path = format!("/repos/{}/actions/runs?per_page={per_repo}", repo);
            match self.get::<WorkflowRunsResponse>(&path).await {
                Ok(response) => {
                    for run in response.workflow_runs {
                        all_deployments.push(mapper::deployment_from_run(run, repo));
                    }
                }
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
```

**Tests** (wiremock):
- `list_projects_returns_monitored_repos`
- `list_recent_deployments_fetches_runs_per_repo`
- `rate_limit_403_surfaces_correctly`
- `unauthorized_surfaces`

---

#### `src-tauri/src/adapters/github/types.rs`

GitHub Actions API response DTOs.

```rust
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct WorkflowRunsResponse {
    #[serde(default)]
    pub total_count: u64,
    #[serde(default)]
    pub workflow_runs: Vec<WorkflowRunDto>,
}

#[derive(Debug, Deserialize)]
pub struct WorkflowRunDto {
    pub id: i64,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub conclusion: Option<String>,
    #[serde(default)]
    pub html_url: Option<String>,
    #[serde(default)]
    pub head_branch: Option<String>,
    #[serde(default)]
    pub head_sha: Option<String>,
    #[serde(default)]
    pub head_commit: Option<HeadCommitDto>,
    #[serde(default)]
    pub actor: Option<ActorDto>,
    #[serde(default)]
    pub workflow_id: Option<i64>,
    #[serde(default)]
    pub event: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub run_started_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct HeadCommitDto {
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ActorDto {
    #[serde(default)]
    pub login: Option<String>,
    #[serde(default)]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RepoDto {
    pub id: i64,
    pub full_name: String,
    pub name: String,
    #[serde(default)]
    pub html_url: Option<String>,
    #[serde(rename = "private")]
    #[serde(default)]
    pub is_private: bool,
    #[serde(default)]
    pub default_branch: Option<String>,
}
```

---

#### `src-tauri/src/adapters/github/mapper.rs`

DTO → domain model mapping. Follows `railway/mapper.rs` pattern.

```rust
use chrono::DateTime;

use crate::adapters::github::types::WorkflowRunDto;
use crate::adapters::{Deployment, DeploymentState};

pub fn map_run_state(status: Option<&str>, conclusion: Option<&str>) -> DeploymentState {
    match (status.unwrap_or(""), conclusion.unwrap_or("")) {
        ("queued", _) | ("waiting", _) => DeploymentState::Queued,
        ("in_progress", _) => DeploymentState::Building,
        ("completed", "success") => DeploymentState::Ready,
        ("completed", "failure") | ("completed", "timed_out") => DeploymentState::Error,
        ("completed", "cancelled") | ("completed", "skipped") | ("completed", "stale") => {
            DeploymentState::Canceled
        }
        ("completed", "action_required") => DeploymentState::Queued,
        ("completed", _) => DeploymentState::Unknown,
        _ => DeploymentState::Unknown,
    }
}

fn parse_ts(s: Option<&str>) -> i64 {
    s.and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        .map(|d| d.timestamp_millis())
        .unwrap_or(0)
}

pub fn deployment_from_run(run: WorkflowRunDto, project_id: &str) -> Deployment {
    let state = map_run_state(run.status.as_deref(), run.conclusion.as_deref());
    let created_at = parse_ts(run.created_at.as_deref());
    let updated_at = parse_ts(run.updated_at.as_deref());
    let run_started = parse_ts(run.run_started_at.as_deref());

    let finished_at = if matches!(state, DeploymentState::Ready | DeploymentState::Error | DeploymentState::Canceled) {
        Some(updated_at)
    } else {
        None
    };

    let duration_ms = finished_at.and_then(|f| {
        let start = if run_started > 0 { run_started } else { created_at };
        if f >= start { Some((f - start) as u64) } else { None }
    });

    Deployment {
        id: run.id.to_string(),
        project_id: project_id.to_string(),
        service_id: run.workflow_id.map(|id| id.to_string()),
        service_name: run.name,
        state,
        environment: run.event.unwrap_or_else(|| "push".to_string()),
        url: run.html_url.clone(),
        inspector_url: run.html_url,
        branch: run.head_branch,
        commit_sha: run.head_sha,
        commit_message: run.head_commit.and_then(|c| c.message),
        author_name: run.actor.as_ref().and_then(|a| a.login.clone()),
        author_avatar: run.actor.and_then(|a| a.avatar_url),
        created_at,
        finished_at,
        duration_ms,
        progress: None,
    }
}
```

**Tests**:
- `map_run_state` covers all status/conclusion combos
- `deployment_from_run` maps fields correctly
- `duration_uses_run_started_at` verifies correct start time selection

---

### 4.2 Modified Rust files

#### `src-tauri/src/adapters/mod.rs` — Add `GitHub` variant

```rust
// Add to the enum (line 14):
pub mod github;  // add after `pub mod railway;`

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Vercel,
    Railway,
    GitHub,  // new
}

impl Platform {
    pub fn key(&self) -> &'static str {
        match self {
            Platform::Vercel => "vercel",
            Platform::Railway => "railway",
            Platform::GitHub => "github",  // new
        }
    }

    pub fn from_key(s: &str) -> Option<Self> {
        match s {
            "vercel" => Some(Platform::Vercel),
            "railway" => Some(Platform::Railway),
            "github" => Some(Platform::GitHub),  // new
            _ => None,
        }
    }
}
```

---

#### `src-tauri/src/adapters/registry.rs` — Add GitHub arm (line 37-49)

```rust
// In hydrate(), add to the match after Railway:
Platform::GitHub => Arc::new(crate::adapters::github::GitHubAdapter::new(
    account.id.clone(),
    token,
    account.monitored_repos.clone(),
)),
```

---

#### `src-tauri/src/store.rs` — Add `monitored_repos` field + fix `delete_account`

```rust
// StoredAccount (line 24-34):
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredAccount {
    pub id: String,
    pub platform: Platform,
    pub display_name: String,
    pub scope_id: Option<String>,
    pub enabled: bool,
    pub created_at: i64,
    #[serde(default)]
    pub health: AccountHealth,
    #[serde(default)]
    pub monitored_repos: Option<Vec<String>>,  // new — None for Vercel/Railway
}

// delete_account (line 79) — replace hard-coded array:
// Before:
let platforms = [Platform::Vercel, Platform::Railway];
for p in platforms {
    let _ = crate::keychain::delete_token(p.key(), id);
}
// After:
let _ = crate::keychain::delete_token("_unused", id);
// (delete_token already ignores the platform param — it removes by account_id from vault)
```

---

#### `src-tauri/src/auth/mod.rs` — Add `pub mod github;`

```rust
pub mod oauth;
pub mod pat;
pub mod railway;
pub mod token_provider;
pub mod vercel;
pub mod github;  // new
```

---

#### `src-tauri/src/auth/pat.rs` — Add GitHub arm (line 16-19)

```rust
pub async fn connect_via_pat(
    app: &AppHandle,
    platform: Platform,
    token: String,
    scope_id: Option<String>,
) -> Result<AccountProfile, AuthError> {
    let profile = match platform {
        Platform::Vercel => fetch_vercel_profile(&token, scope_id.as_deref()).await?,
        Platform::Railway => fetch_railway_profile(&token).await?,
        Platform::GitHub => crate::auth::github::fetch_github_profile(&token).await?,  // new
    };
    // ... rest unchanged
}
```

Also update `StoredAccount` construction at line 22-30 to include `monitored_repos: None`.

---

#### `src-tauri/src/auth/token_provider.rs` — Add GitHub pass-through (line 23-38)

```rust
// In the match on platform, add after Railway:
Platform::GitHub => Ok(access_token),  // GitHub tokens don't expire
```

---

#### `src-tauri/src/commands/accounts.rs` — Wire up GitHub

**`start_oauth` (line 57-65)**:
```rust
"github" => crate::auth::github::start_github_oauth(app.clone())
    .await
    .map_err(|e| e.to_string())?,
```

**`validate_token` (line 170-173)**:
```rust
Platform::GitHub => crate::auth::github::fetch_github_profile(&token).await,
```

**New commands — add to this file**:

```rust
#[derive(Debug, Serialize)]
pub struct GitHubRepoInfo {
    pub full_name: String,
    pub name: String,
    pub is_private: bool,
    pub default_branch: Option<String>,
}

#[tauri::command]
pub async fn list_github_repos(
    app: AppHandle,
    account_id: String,
) -> Result<Vec<GitHubRepoInfo>, String> {
    let accounts = store::list_accounts(&app)?;
    let account = accounts.into_iter()
        .find(|a| a.id == account_id && a.platform == Platform::GitHub)
        .ok_or_else(|| format!("no GitHub account: {account_id}"))?;

    let token = token_provider::get_fresh_access_token(&account_id, Platform::GitHub)
        .await
        .map_err(|e| e.to_string())?;

    let client = reqwest::Client::new();
    let res = client
        .get("https://api.github.com/user/repos?sort=pushed&per_page=100&type=all")
        .bearer_auth(&token)
        .header("User-Agent", "dev-radio")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("GitHub API error: {}", res.status()));
    }

    let repos: Vec<crate::adapters::github::types::RepoDto> =
        res.json().await.map_err(|e| e.to_string())?;

    Ok(repos.into_iter().map(|r| GitHubRepoInfo {
        full_name: r.full_name,
        name: r.name,
        is_private: r.is_private,
        default_branch: r.default_branch,
    }).collect())
}

#[tauri::command]
pub async fn set_monitored_repos(
    app: AppHandle,
    account_id: String,
    repos: Vec<String>,
) -> Result<(), String> {
    let capped = repos.into_iter().take(30).collect::<Vec<_>>();
    store::update_account(&app, &account_id, |a| {
        a.monitored_repos = Some(capped);
    })?;
    rehydrate_after_change(&app).await;
    Ok(())
}
```

---

#### `src-tauri/src/lib.rs` — Register new commands (line 97-125)

Add to `invoke_handler`:
```rust
account_cmds::list_github_repos,
account_cmds::set_monitored_repos,
```

---

#### `src-tauri/build.rs` — Add GitHub env vars (after line 25)

```rust
let github_client_id = std::env::var("GITHUB_CLIENT_ID").unwrap_or_default();
let github_client_secret = std::env::var("GITHUB_CLIENT_SECRET").unwrap_or_default();

// After line 36 (release warnings):
if profile == "release" && (github_client_id.is_empty() || github_client_secret.is_empty()) {
    println!(
        "cargo:warning=GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET not set — GitHub OAuth will be disabled in this build. Users can still connect by pasting a token."
    );
}

// After line 43:
println!("cargo:rustc-env=GITHUB_CLIENT_ID={}", github_client_id);
println!("cargo:rustc-env=GITHUB_CLIENT_SECRET={}", github_client_secret);
println!("cargo:rerun-if-env-changed=GITHUB_CLIENT_ID");
println!("cargo:rerun-if-env-changed=GITHUB_CLIENT_SECRET");
```

---

#### `src-tauri/tauri.conf.json` — Update CSP (line 48)

Add to `connect-src`:
```
https://api.github.com https://github.com
```

`img-src` already has `https://avatars.githubusercontent.com`. ✅

---

#### `src-tauri/capabilities/default.json` — Add GitHub URL (line 17-21)

```json
{ "url": "https://github.com/*" }
```

---

### 4.3 New frontend files

#### `src/assets/providers/github.svg`

GitHub Invertocat mark SVG (single path, monochrome — same pattern as vercel.svg and railway.svg). Source from GitHub's brand guidelines.

---

#### `src/components/account/repo-selector.tsx`

```tsx
import { useEffect, useState } from "react"
import { DRButton } from "@/components/dr/button"
import { DRInput } from "@/components/dr/input"
import { Icon } from "@/components/dr/icon"
import { trackedInvoke } from "@/lib/tauri"

type GitHubRepo = {
  full_name: string
  name: string
  is_private: boolean
  default_branch: string | null
}

type Props = {
  accountId: string
  initialRepos?: string[]
  onSave: (repos: string[]) => void | Promise<void>
}

export function RepoSelector({ accountId, initialRepos = [], onSave }: Props) {
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(initialRepos))
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    trackedInvoke<GitHubRepo[]>("list_github_repos", { accountId })
      .then((r) => {
        setRepos(r)
        if (initialRepos.length === 0) {
          // Auto-select first 10 repos on initial connect
          setSelected(new Set(r.slice(0, 10).map((repo) => repo.full_name)))
        }
      })
      .finally(() => setLoading(false))
  }, [accountId])

  function toggle(fullName: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(fullName)) next.delete(fullName)
      else if (next.size < 30) next.add(fullName)
      return next
    })
  }

  const filtered = repos.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase()),
  )

  async function handleSave() {
    await trackedInvoke("set_monitored_repos", {
      accountId,
      repos: Array.from(selected),
    })
    await onSave(Array.from(selected))
  }

  // Renders: search input, scrollable checkbox list, save button
  // Max 30 repos selected — show count "N/30 repos selected"
  // ...
}
```

---

### 4.4 Modified frontend files

#### `src/lib/accounts.ts`

```ts
// Line 1:
export type Platform = "vercel" | "railway" | "github"

// Line 106-109:
export const PLATFORM_LABEL: Record<Platform, string> = {
  vercel: "Vercel",
  railway: "Railway",
  github: "GitHub",  // new
}

// Add to accountsApi object:
listGithubRepos(accountId: string) {
  return trackedInvoke<GitHubRepoInfo[]>("list_github_repos", { accountId })
},
setMonitoredRepos(accountId: string, repos: string[]) {
  return trackedInvoke<void>("set_monitored_repos", { accountId, repos })
},
```

---

#### `src/components/dr/provider-mark.tsx`

```tsx
// Line 1-2:
import vercelSvg from "@/assets/providers/vercel.svg?raw"
import railwaySvg from "@/assets/providers/railway.svg?raw"
import githubSvg from "@/assets/providers/github.svg?raw"  // new

const RAW: Record<Platform, string> = {
  vercel: vercelSvg,
  railway: railwaySvg,
  github: githubSvg,  // new
}

const PROCESSED: Record<Platform, string> = {
  vercel: currentColorize(RAW.vercel),
  railway: currentColorize(RAW.railway),
  github: currentColorize(RAW.github),  // new
}
```

---

#### `src/components/dr/provider-chip.tsx`

```tsx
// Line 19-22:
const ACCENT_VAR: Record<Platform, string> = {
  vercel: "var(--accent-vercel)",
  railway: "var(--accent-railway)",
  github: "var(--accent-github)",  // new
}
```

---

#### `src/components/account/add-account-form.tsx`

```tsx
// Line 27-42 — add github to TOKEN_LINKS:
github: {
  href: "https://github.com/settings/tokens",
  label: "github.com/settings/tokens",
  scopeLabel: null,
  placeholder: "ghp_… or github_pat_…",
  hint: 'Classic: select "repo" and "read:user" scopes.',
},

// Line 44-47:
github: "Connect with GitHub",

// Line 196 — token label for GitHub:
: platform === "github"
  ? "GitHub Personal Access Token"
  : "Railway API token"
```

---

#### `src/components/account/add-account-dialog.tsx`

```tsx
// Line 24:
const PLATFORMS: Platform[] = ["vercel", "railway", "github"]

// Line 55 — update description:
Link a Vercel, Railway, or GitHub account to monitor deployments.
```

---

#### `src/app/desktop/views/onboarding-view.tsx`

```tsx
// Line 138 — add github to the grid:
{(["vercel", "railway", "github"] as const).map((p) => { ... })}

// Line 137 — change to 3-column grid for 3 platforms:
<div className="grid w-full max-w-[440px] grid-cols-3 gap-3">

// Line 188-189 — add GitHub connect text:
: platform === "github"
  ? "Approve Dev Radio in your browser or paste a personal access token."
  : "Paste a Railway API token. It's stored only in your system keychain."
```

---

#### `src/app/desktop/views/settings/accounts-tab.tsx`

Add "Manage repos" menu item for GitHub accounts (inside the `DRMenu` at line 107-128):

```tsx
{acc.platform === "github" ? (
  <DRMenuItem onSelect={() => void handleManageRepos(acc.id)}>
    Manage repositories…
  </DRMenuItem>
) : null}
```

Add state and handler for the repo selector dialog. Show repo count in subtitle:

```tsx
// In the account subtitle (line 96-104):
{acc.platform === "github" && acc.monitored_repos_count ? (
  <>
    <span aria-hidden>·</span>
    <span>{acc.monitored_repos_count} repos</span>
  </>
) : null}
```

---

#### `src/index.css` — Add GitHub accent variables

```css
/* In :root (after line 45): */
--accent-github-l: oklch(0.30 0.005 260);
--accent-github-d: oklch(0.92 0.005 260);

/* In [data-theme="light"] (after line 61): */
--accent-github: var(--accent-github-l);

/* In [data-theme="dark"] (after line 78): */
--accent-github: var(--accent-github-d);
```

---

#### `.env.example`

```env
# GitHub OAuth App credentials
# Register at: https://github.com/settings/developers
# Redirect URI must be: http://127.0.0.1:53123/callback
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

---

## 5. Data flow — end to end

```
                          ┌──────────────┐
                          │  User clicks  │
                          │ "Connect with │
                          │   GitHub"     │
                          └──────┬───────┘
                                 │
             ┌───────────────────▼──────────────────┐
             │   start_github_oauth()                │
             │   1. spawn_loopback_server(state)     │
             │   2. open browser → github.com/oauth  │
             │   3. wait for callback code           │
             │   4. POST /login/oauth/access_token   │
             │   5. GET /user → profile              │
             │   6. store_token() in keychain (Pat)  │
             │   7. save_account() in store           │
             │   8. emit("oauth:complete")           │
             └───────────────────┬──────────────────┘
                                 │
             ┌───────────────────▼──────────────────┐
             │   Repo selector appears               │
             │   1. list_github_repos(account_id)    │
             │      → GET /user/repos?sort=pushed    │
             │   2. User picks repos (max 30)        │
             │   3. set_monitored_repos(id, repos)   │
             │      → updates StoredAccount          │
             │   4. rehydrate_after_change()         │
             └───────────────────┬──────────────────┘
                                 │
             ┌───────────────────▼──────────────────┐
             │   Poller (every 30s)                  │
             │   1. registry.hydrate() creates       │
             │      GitHubAdapter with token +       │
             │      monitored_repos                  │
             │   2. list_projects() → monitored repos│
             │   3. list_recent_deployments()        │
             │      → GET /repos/{owner}/{repo}/     │
             │        actions/runs?per_page=10       │
             │      for each monitored repo          │
             │   4. Map runs → Deployment structs    │
             │   5. cache.replace_and_diff()         │
             │   6. emit("dashboard:update")         │
             │   7. fire_for_diff() notifications    │
             │   8. set_health() tray icon           │
             └──────────────────────────────────────┘
```

---

## 6. GitHub status → tray icon mapping

Existing `health_from_state()` in `poller.rs:398-431` works unchanged:

| Workflow Run State | `DeploymentState` | Tray contribution |
|---|---|---|
| in_progress / queued | Building / Queued | → Yellow |
| completed + success | Ready | → Green |
| completed + failure (< 30min) | Error | → Red |
| completed + cancelled | Canceled | → (ignored, no color contribution) |

Priority: Red > Yellow > Green > Gray. Same as today.

---

## 7. Todo list

### Phase 1: Backend — Platform enum + auth (`~1 day`)

- [x] **1.1** Add `GitHub` variant to `Platform` enum in `src-tauri/src/adapters/mod.rs`
- [x] **1.2** Update `key()` and `from_key()` for `"github"`
- [x] **1.3** Add `pub mod github;` to `src-tauri/src/adapters/mod.rs`
- [x] **1.4** Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to `build.rs`
- [x] **1.5** Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to `.env.example`
- [x] **1.6** Create `src-tauri/src/auth/github.rs` with `fetch_github_profile()` and `start_github_oauth()`
- [x] **1.7** Add `pub mod github;` to `src-tauri/src/auth/mod.rs`
- [x] **1.8** Add `Platform::GitHub` arm to `connect_via_pat()` in `src-tauri/src/auth/pat.rs`
- [x] **1.9** Add `Platform::GitHub => Ok(access_token)` to `token_provider.rs`
- [x] **1.10** Add `monitored_repos: Option<Vec<String>>` to `StoredAccount` in `store.rs`
- [x] **1.11** Fix `delete_account()` in `store.rs` — don't hard-code platform list for keychain cleanup
- [x] **1.12** Wire `"github"` arm in `start_oauth` command in `commands/accounts.rs`
- [x] **1.13** Wire `Platform::GitHub` arm in `validate_token` command
- [x] **1.14** Update `StoredAccount` construction in `pat.rs:connect_via_pat` to include `monitored_repos: None`
- [x] **1.15** Write wiremock tests for `fetch_github_profile` (success, 401, non-json body)
- [x] **1.16** Run `cargo test --lib` — verify all existing tests still pass

### Phase 2: Backend — Adapter + commands (`~1-2 days`)

- [x] **2.1** Create `src-tauri/src/adapters/github/types.rs` with DTOs
- [x] **2.2** Create `src-tauri/src/adapters/github/mapper.rs` with `map_run_state()` and `deployment_from_run()`
- [x] **2.3** Create `src-tauri/src/adapters/github/mod.rs` with `GitHubAdapter` + `DeploymentMonitor` impl
- [x] **2.4** Add `Platform::GitHub` arm to `AdapterRegistry::hydrate()` in `registry.rs`
- [x] **2.5** Add `list_github_repos` command to `commands/accounts.rs`
- [x] **2.6** Add `set_monitored_repos` command to `commands/accounts.rs`
- [x] **2.7** Register `list_github_repos` and `set_monitored_repos` in `lib.rs` invoke_handler
- [x] **2.8** Update CSP `connect-src` in `tauri.conf.json` — add `https://api.github.com https://github.com`
- [x] **2.9** Update `capabilities/default.json` — add `{ "url": "https://github.com/*" }` to opener allowlist
- [x] **2.10** Write wiremock tests for `GitHubAdapter` (list_projects, list_recent_deployments, rate limit 403, unauthorized)
- [x] **2.11** Write unit tests for `mapper::map_run_state` covering all status/conclusion combos
- [x] **2.12** Run `cargo test --lib` — verify all tests pass

### Phase 3: Frontend — Platform support (`~1 day`)

- [x] **3.1** Add `github.svg` to `src/assets/providers/`
- [x] **3.2** Update `Platform` type in `src/lib/accounts.ts` — add `"github"`
- [x] **3.3** Add `github: "GitHub"` to `PLATFORM_LABEL` in `src/lib/accounts.ts`
- [x] **3.4** Add `listGithubRepos` and `setMonitoredRepos` to `accountsApi` in `src/lib/accounts.ts`
- [x] **3.5** Update `provider-mark.tsx` — import github.svg, add to RAW and PROCESSED
- [x] **3.6** Update `provider-chip.tsx` — add `github` to `ACCENT_VAR`
- [x] **3.7** Add `--accent-github-l` and `--accent-github-d` CSS variables to `src/index.css`
- [x] **3.8** Map `--accent-github` in both light and dark theme blocks
- [x] **3.9** Add `github` entry to `TOKEN_LINKS` in `add-account-form.tsx`
- [x] **3.10** Add `github` to `OAUTH_BUTTON_LABEL` in `add-account-form.tsx`
- [x] **3.11** Update token label conditional for GitHub platform
- [x] **3.12** Add `"github"` to `PLATFORMS` array in `add-account-dialog.tsx`
- [x] **3.13** Update dialog description to include GitHub
- [x] **3.14** Run `pnpm typecheck` — verify no type errors

### Phase 4: Frontend — Onboarding + repo selector (`~1 day`)

- [x] **4.1** Add `"github"` to the platform grid in `onboarding-view.tsx`
- [x] **4.2** Change grid from 2-col to 3-col layout
- [x] **4.3** Add GitHub-specific connect step description text
- [x] **4.4** Create `src/components/account/repo-selector.tsx`
- [x] **4.5** Wire repo selector into post-OAuth-connect flow (show after GitHub account creation)
- [x] **4.6** Add "Manage repos" menu item for GitHub accounts in `accounts-tab.tsx`
- [x] **4.7** Add repo count display in account subtitle for GitHub accounts
- [x] **4.8** Add GitHub-specific error messages to `friendlyAuthError()` in `accounts.ts`
- [x] **4.9** Run `pnpm typecheck` — verify clean

### Phase 5: Integration + polish (`~0.5 day`)

- [x] **5.1** End-to-end test: connect GitHub via PAT, verify repos appear in popover feed
- [x] **5.2** End-to-end test: connect GitHub via OAuth (requires registered OAuth App)
- [x] **5.3** Verify tray icon color changes with GitHub workflow run states
- [x] **5.4** Verify desktop notifications fire for GitHub workflow run state changes
- [x] **5.5** Verify project filter in popover works with GitHub repos
- [x] **5.6** Verify account scope switching works (Cmd+0-9) with GitHub accounts
- [x] **5.7** Verify DeployRow renders correctly — workflow name in `service_name`, event type in environment
- [x] **5.8** Test rate limit handling — verify adapter enters cooldown correctly on 403
- [x] **5.9** Verify redact.rs patterns cover GitHub token formats (ghp_, github_pat_)
- [x] **5.10** Update `docs/connecting-accounts.md` with GitHub section
- [x] **5.11** Run full test suite: `pnpm typecheck && cargo test --lib`

---

## 8. Risk summary

| Risk | Severity | Mitigation |
|---|---|---|
| GitHub rate limits (5k/hr) | Medium | 30-repo cap, 30s poll interval, read `x-ratelimit-*` headers |
| GitHub 403 ≠ 429 for rate limits | Low | Check `x-ratelimit-remaining: 0` header on 403 in adapter `get()` |
| User-Agent header required | Low | Set on every request in adapter and auth module |
| OAuth App registration required | Low | Document in `.env.example` and README |
| Many repos = noisy feed | Low | `per_page=10` per repo, `monitored_repos` cap at 30, existing project filter handles rest |
| `monitored_repos` field breaks old store data | Low | `#[serde(default)]` → backward compatible, old data gets `None` |
| Fine-grained PATs limited repo access | Low | Use `GET /user/repos` (respects token scope), show what's visible |

---

## 9. What stays unchanged

- `DeploymentMonitor` trait — no changes
- `poller.rs` — works as-is with the new adapter (poll loop, cooldowns, health computation)
- `cache.rs` — diff detection works unchanged
- `notifications.rs` — `fire_for_diff` handles GitHub run state changes identically
- `tray.rs` — health level icon logic unchanged
- `keychain.rs` — vault storage works unchanged (`StoredSecret::Pat`)
- `popover-app.tsx` — scope filtering, project filter, keyboard nav all work
- `deploy-row.tsx` — renders `service_name` (workflow name), `commit_sha`, `branch` — all populated by mapper
- `debug-panel.tsx` — all `trackedInvoke` calls automatically logged
