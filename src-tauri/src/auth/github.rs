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
        .header("User-Agent", "tiny-bell")
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

    let display = user.name.clone().unwrap_or_else(|| user.login.clone());

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
    log::info!(
        target: "tiny_bell::oauth",
        "GitHub OAuth authorize → redirect_uri={redirect}"
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
        Err(_) => {
            oauth::abort_current();
            return Err(AuthError::Timeout);
        }
        Ok(Err(_)) => {
            oauth::abort_current();
            return Err(AuthError::ServerClosed);
        }
        Ok(Ok(Err(e))) => {
            oauth::abort_current();
            return Err(e);
        }
        Ok(Ok(Ok(CallbackResult::ProviderError(msg)))) => {
            oauth::abort_current();
            return Err(AuthError::Provider(msg));
        }
        Ok(Ok(Ok(CallbackResult::Code(code)))) => code,
    };

    oauth::abort_current();

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

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{bearer_token, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn fetches_github_profile() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/user"))
            .and(bearer_token("ghp_test"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "id": 12345,
                "login": "octocat",
                "name": "The Octocat",
                "email": "octocat@github.com",
                "avatar_url": "https://avatars.githubusercontent.com/u/12345"
            })))
            .mount(&server)
            .await;

        let profile = fetch_github_profile_with_base("ghp_test", &server.uri())
            .await
            .expect("profile");
        assert_eq!(profile.id, "12345");
        assert_eq!(profile.display_name, "The Octocat");
        assert_eq!(profile.email.as_deref(), Some("octocat@github.com"));
        assert_eq!(profile.platform, Platform::GitHub);
    }

    #[tokio::test]
    async fn unauthorized_surfaces_provider_error() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/user"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;

        let err = fetch_github_profile_with_base("bad", &server.uri())
            .await
            .unwrap_err();
        assert!(matches!(err, AuthError::Provider(ref m) if m.contains("Invalid token")));
    }

    #[tokio::test]
    async fn fallback_to_login_when_name_is_missing() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/user"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "id": 99,
                "login": "ghost",
            })))
            .mount(&server)
            .await;

        let profile = fetch_github_profile_with_base("tok", &server.uri())
            .await
            .expect("profile");
        assert_eq!(profile.display_name, "ghost");
    }
}
