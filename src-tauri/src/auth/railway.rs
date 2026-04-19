use serde::Deserialize;
use tauri::{AppHandle, Emitter};

use crate::adapters::{AccountProfile, Platform};
use crate::auth::oauth::{
    self, generate_pkce, generate_state, redirect_uri_for, CallbackResult, OAUTH_TIMEOUT_SECS,
};
use crate::auth::pat::fetch_railway_profile;
use crate::auth::AuthError;
use crate::keychain::StoredSecret;
use crate::store::{self, AccountHealth, StoredAccount};

const CLIENT_ID: &str = env!("RAILWAY_CLIENT_ID");

pub const AUTHORIZE_URL: &str = "https://backboard.railway.com/oauth/auth";
pub const TOKEN_URL: &str = "https://backboard.railway.com/oauth/token";
pub const SCOPES: &str =
    "openid email profile offline_access workspace:viewer project:viewer";

#[derive(Debug, Clone)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in_secs: u64,
}

#[derive(Debug, Deserialize)]
struct TokenWire {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<u64>,
}

pub fn is_configured() -> bool {
    !CLIENT_ID.is_empty()
}

pub async fn start_railway_oauth(app: AppHandle) -> Result<AccountProfile, AuthError> {
    if !is_configured() {
        return Err(AuthError::Config(
            "Railway OAuth not configured — set RAILWAY_CLIENT_ID at build time".into(),
        ));
    }

    let pkce = generate_pkce();
    let state = generate_state();

    let binding = oauth::spawn_loopback_server(state.clone())?;
    let redirect = redirect_uri_for(binding.port);

    let authorize_url = format!(
        "{AUTHORIZE_URL}?response_type=code&client_id={cid}&redirect_uri={ruri}&scope={scope}&state={state}&code_challenge={cc}&code_challenge_method=S256&prompt=consent",
        cid = urlencoding::encode(CLIENT_ID),
        ruri = urlencoding::encode(&redirect),
        scope = urlencoding::encode(SCOPES),
        state = urlencoding::encode(&state),
        cc = urlencoding::encode(&pkce.challenge),
    );
    log::info!(
        target: "tiny_bell::oauth",
        "Railway OAuth authorize → redirect_uri={redirect}"
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

    let tokens = exchange_code(&code, &redirect, &pkce.verifier).await?;
    let refresh_token = tokens
        .refresh_token
        .clone()
        .ok_or_else(|| AuthError::Provider("Railway did not return a refresh_token".into()))?;

    let profile = fetch_railway_profile(&tokens.access_token).await?;

    let account_id = uuid::Uuid::new_v4().to_string();
    let now_ms = chrono::Utc::now().timestamp_millis();
    let expires_at_ms = now_ms + (tokens.expires_in_secs as i64) * 1000;
    crate::keychain::store_secret(
        &account_id,
        &StoredSecret::Oauth {
            access_token: tokens.access_token.clone(),
            refresh_token,
            expires_at_ms,
        },
    )?;

    let stored = StoredAccount {
        id: account_id.clone(),
        platform: Platform::Railway,
        display_name: profile.display_name.clone(),
        scope_id: profile.scope_id.clone(),
        enabled: true,
        created_at: now_ms,
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

pub async fn exchange_code(
    code: &str,
    redirect_uri: &str,
    code_verifier: &str,
) -> Result<TokenResponse, AuthError> {
    exchange_code_with_url(TOKEN_URL, code, redirect_uri, code_verifier).await
}

pub async fn refresh_tokens(refresh_token: &str) -> Result<TokenResponse, AuthError> {
    refresh_tokens_with_url(TOKEN_URL, refresh_token).await
}

pub async fn exchange_code_with_url(
    token_url: &str,
    code: &str,
    redirect_uri: &str,
    code_verifier: &str,
) -> Result<TokenResponse, AuthError> {
    let client = reqwest::Client::new();
    let res = client
        .post(token_url)
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", CLIENT_ID),
            ("code", code),
            ("redirect_uri", redirect_uri),
            ("code_verifier", code_verifier),
        ])
        .send()
        .await
        .map_err(AuthError::from)?;
    parse_token_response(res).await
}

pub async fn refresh_tokens_with_url(
    token_url: &str,
    refresh_token: &str,
) -> Result<TokenResponse, AuthError> {
    let client = reqwest::Client::new();
    let res = client
        .post(token_url)
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", CLIENT_ID),
            ("refresh_token", refresh_token),
        ])
        .send()
        .await
        .map_err(AuthError::from)?;
    parse_token_response(res).await
}

async fn parse_token_response(res: reqwest::Response) -> Result<TokenResponse, AuthError> {
    let status = res.status();
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        if status.is_server_error() || status.as_u16() == 429 {
            return Err(AuthError::Network(format!(
                "Railway token endpoint transient error ({status})"
            )));
        }
        return Err(AuthError::Provider(format!(
            "Railway token endpoint failed ({status}): {body}"
        )));
    }
    let wire: TokenWire = res.json().await.map_err(AuthError::from)?;
    Ok(TokenResponse {
        access_token: wire.access_token,
        refresh_token: wire.refresh_token,
        expires_in_secs: wire.expires_in.unwrap_or(3600),
    })
}

fn open_browser(url: &str) -> Result<(), AuthError> {
    tauri_plugin_opener::open_url(url, None::<&str>)
        .map_err(|e| AuthError::Server(format!("failed to open browser: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{body_string_contains, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn exchange_code_parses_token_response() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/oauth/token"))
            .and(body_string_contains("grant_type=authorization_code"))
            .and(body_string_contains("code=abc123"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "access_token": "at-1",
                "refresh_token": "rt-1",
                "expires_in": 3600,
                "token_type": "Bearer"
            })))
            .mount(&server)
            .await;

        let url = format!("{}/oauth/token", server.uri());
        let tokens = exchange_code_with_url(&url, "abc123", "http://127.0.0.1:53123/callback", "ver")
            .await
            .expect("tokens");
        assert_eq!(tokens.access_token, "at-1");
        assert_eq!(tokens.refresh_token.as_deref(), Some("rt-1"));
        assert_eq!(tokens.expires_in_secs, 3600);
    }

    #[tokio::test]
    async fn exchange_code_maps_failure_to_provider_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/oauth/token"))
            .respond_with(ResponseTemplate::new(400).set_body_string("invalid_grant"))
            .mount(&server)
            .await;

        let url = format!("{}/oauth/token", server.uri());
        let err = exchange_code_with_url(&url, "abc", "http://127.0.0.1:53123/callback", "ver")
            .await
            .unwrap_err();
        assert!(matches!(err, AuthError::Provider(ref m) if m.contains("invalid_grant")));
    }

    #[tokio::test]
    async fn refresh_tokens_returns_new_bundle() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/oauth/token"))
            .and(body_string_contains("grant_type=refresh_token"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "access_token": "at-2",
                "refresh_token": "rt-2",
                "expires_in": 3600
            })))
            .mount(&server)
            .await;

        let url = format!("{}/oauth/token", server.uri());
        let tokens = refresh_tokens_with_url(&url, "rt-1").await.expect("refresh");
        assert_eq!(tokens.access_token, "at-2");
        assert_eq!(tokens.refresh_token.as_deref(), Some("rt-2"));
    }

    #[tokio::test]
    async fn refresh_tokens_handles_missing_refresh_token() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/oauth/token"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "access_token": "at-3",
                "expires_in": 1800
            })))
            .mount(&server)
            .await;

        let url = format!("{}/oauth/token", server.uri());
        let tokens = refresh_tokens_with_url(&url, "rt-1").await.expect("refresh");
        assert_eq!(tokens.access_token, "at-3");
        assert!(tokens.refresh_token.is_none());
        assert_eq!(tokens.expires_in_secs, 1800);
    }

    #[tokio::test]
    async fn refresh_tokens_5xx_surfaces_network_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/oauth/token"))
            .respond_with(ResponseTemplate::new(503).set_body_string("upstream down"))
            .mount(&server)
            .await;

        let url = format!("{}/oauth/token", server.uri());
        let err = refresh_tokens_with_url(&url, "rt-x").await.unwrap_err();
        assert!(matches!(err, AuthError::Network(ref m) if m.contains("503")));
    }

    #[tokio::test]
    async fn refresh_tokens_429_surfaces_network_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/oauth/token"))
            .respond_with(ResponseTemplate::new(429).set_body_string("slow down"))
            .mount(&server)
            .await;

        let url = format!("{}/oauth/token", server.uri());
        let err = refresh_tokens_with_url(&url, "rt-x").await.unwrap_err();
        assert!(matches!(err, AuthError::Network(ref m) if m.contains("429")));
    }

    #[tokio::test]
    async fn refresh_tokens_invalid_grant_surfaces_provider_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/oauth/token"))
            .respond_with(ResponseTemplate::new(400).set_body_string(
                r#"{"error":"invalid_grant","error_description":"expired"}"#,
            ))
            .mount(&server)
            .await;

        let url = format!("{}/oauth/token", server.uri());
        let err = refresh_tokens_with_url(&url, "rt-old").await.unwrap_err();
        assert!(matches!(err, AuthError::Provider(ref m) if m.contains("invalid_grant")));
    }
}
