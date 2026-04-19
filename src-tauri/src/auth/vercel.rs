use serde::Deserialize;
use tauri::{AppHandle, Emitter};

use crate::adapters::{AccountProfile, Platform};
use crate::auth::oauth::{
    self, generate_pkce, generate_state, redirect_uri_for, CallbackResult, OAUTH_TIMEOUT_SECS,
};
use crate::auth::AuthError;
use crate::store::{self, AccountHealth, StoredAccount};

const CLIENT_ID: &str = env!("VERCEL_CLIENT_ID");
const CLIENT_SECRET: &str = env!("VERCEL_CLIENT_SECRET");
const INTEGRATION_SLUG: &str = env!("VERCEL_INTEGRATION_SLUG");
const TOKEN_URL: &str = "https://api.vercel.com/v2/oauth/access_token";
pub const DEFAULT_API_BASE: &str = "https://api.vercel.com";

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    team_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VercelUserWrapper {
    user: VercelUser,
}

#[derive(Debug, Deserialize)]
struct VercelUser {
    #[serde(alias = "uid")]
    id: String,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    avatar: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VercelTeam {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    slug: Option<String>,
    #[serde(default)]
    avatar: Option<String>,
}

pub async fn fetch_vercel_profile(
    token: &str,
    team_id: Option<&str>,
) -> Result<AccountProfile, AuthError> {
    fetch_vercel_profile_with_base(token, team_id, DEFAULT_API_BASE).await
}

pub async fn fetch_vercel_profile_with_base(
    token: &str,
    team_id: Option<&str>,
    api_base: &str,
) -> Result<AccountProfile, AuthError> {
    let client = reqwest::Client::new();

    if let Some(tid) = team_id {
        let url = format!("{api_base}/v2/teams/{tid}");
        let res = client
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(AuthError::from)?;
        if res.status() == reqwest::StatusCode::UNAUTHORIZED
            || res.status() == reqwest::StatusCode::FORBIDDEN
        {
            return Err(AuthError::Provider("Invalid token".into()));
        }
        let team: VercelTeam = res
            .error_for_status()
            .map_err(AuthError::from)?
            .json()
            .await
            .map_err(AuthError::from)?;
        let display = team
            .name
            .clone()
            .or_else(|| team.slug.clone())
            .unwrap_or_else(|| "Vercel Team".to_string());
        return Ok(AccountProfile {
            id: team.id.clone(),
            platform: Platform::Vercel,
            display_name: format!("{display} (Team)"),
            email: None,
            avatar_url: team.avatar.map(avatar_url),
            scope_id: Some(team.id),
        });
    }

    let url = format!("{api_base}/v2/user");
    let res = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(AuthError::from)?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED
        || res.status() == reqwest::StatusCode::FORBIDDEN
    {
        return Err(AuthError::Provider("Invalid token".into()));
    }
    let wrapper: VercelUserWrapper = res
        .error_for_status()
        .map_err(AuthError::from)?
        .json()
        .await
        .map_err(AuthError::from)?;
    let user = wrapper.user;
    let display = user
        .name
        .clone()
        .or_else(|| user.username.clone())
        .or_else(|| user.email.clone())
        .unwrap_or_else(|| "Vercel User".to_string());

    Ok(AccountProfile {
        id: user.id,
        platform: Platform::Vercel,
        display_name: display,
        email: user.email,
        avatar_url: user.avatar.map(avatar_url),
        scope_id: None,
    })
}

fn avatar_url(hash: String) -> String {
    if hash.starts_with("http://") || hash.starts_with("https://") {
        hash
    } else {
        format!("https://vercel.com/api/www/avatar/{hash}?s=64")
    }
}

pub async fn start_vercel_oauth(app: AppHandle) -> Result<AccountProfile, AuthError> {
    if CLIENT_ID.is_empty() || CLIENT_SECRET.is_empty() {
        return Err(AuthError::Config(
            "Vercel OAuth not configured — set VERCEL_CLIENT_ID and VERCEL_CLIENT_SECRET at build time"
                .into(),
        ));
    }
    if INTEGRATION_SLUG.is_empty() {
        return Err(AuthError::Config(
            "Vercel OAuth not configured — set VERCEL_INTEGRATION_SLUG at build time"
                .into(),
        ));
    }

    let pkce = generate_pkce();
    let state = generate_state();

    let binding = oauth::spawn_loopback_server(state.clone())?;
    let redirect = redirect_uri_for(binding.port);

    let authorize_url = format!(
        "https://vercel.com/integrations/{slug}/new?redirect_uri={ruri}&state={state}",
        slug = INTEGRATION_SLUG,
        ruri = urlencoding::encode(&redirect),
        state = urlencoding::encode(&state),
    );
    log::info!(
        target: "tiny_bell::oauth",
        "OAuth authorize → slug={} redirect_uri={}",
        INTEGRATION_SLUG, redirect
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

    let _ = pkce;
    let client = reqwest::Client::new();
    let res = client
        .post(TOKEN_URL)
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
    let profile = fetch_vercel_profile(&token.access_token, token.team_id.as_deref()).await?;

    let account_id = uuid::Uuid::new_v4().to_string();
    crate::keychain::store_token(Platform::Vercel.key(), &account_id, &token.access_token)?;
    let stored = StoredAccount {
        id: account_id.clone(),
        platform: Platform::Vercel,
        display_name: profile.display_name.clone(),
        scope_id: token.team_id.clone(),
        enabled: true,
        created_at: chrono::Utc::now().timestamp_millis(),
        health: AccountHealth::Ok,
        monitored_repos: None,
    };
    store::save_account(&app, &stored).map_err(|e| AuthError::Store(e))?;

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
    async fn fetches_personal_profile() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v2/user"))
            .and(bearer_token("token-123"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "user": {
                    "id": "user_abc",
                    "email": "maya@example.com",
                    "name": "Maya",
                    "username": "maya",
                    "avatar": "abc123"
                }
            })))
            .mount(&server)
            .await;

        let profile = fetch_vercel_profile_with_base("token-123", None, &server.uri())
            .await
            .expect("profile");
        assert_eq!(profile.id, "user_abc");
        assert_eq!(profile.display_name, "Maya");
        assert_eq!(profile.email.as_deref(), Some("maya@example.com"));
        assert!(profile.scope_id.is_none());
    }

    #[tokio::test]
    async fn fetches_team_profile() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v2/teams/team_xyz"))
            .and(bearer_token("token-123"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "id": "team_xyz",
                "name": "Acme",
                "slug": "acme",
                "avatar": "teamhash"
            })))
            .mount(&server)
            .await;

        let profile = fetch_vercel_profile_with_base("token-123", Some("team_xyz"), &server.uri())
            .await
            .expect("profile");
        assert_eq!(profile.id, "team_xyz");
        assert_eq!(profile.display_name, "Acme (Team)");
        assert_eq!(profile.scope_id.as_deref(), Some("team_xyz"));
    }

    #[tokio::test]
    async fn unauthorized_token_surfaces_provider_error() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v2/user"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;

        let err = fetch_vercel_profile_with_base("bad", None, &server.uri())
            .await
            .unwrap_err();
        assert!(matches!(err, AuthError::Provider(ref m) if m.contains("Invalid token")));
    }

    #[tokio::test]
    async fn non_json_body_surfaces_network_error() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v2/user"))
            .respond_with(ResponseTemplate::new(200).set_body_string("not json"))
            .mount(&server)
            .await;

        let err = fetch_vercel_profile_with_base("token", None, &server.uri())
            .await
            .unwrap_err();
        assert!(matches!(err, AuthError::Network(_)));
    }
}
