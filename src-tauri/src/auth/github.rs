use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;

use crate::adapters::{AccountProfile, Platform};
use crate::auth::AuthError;
use crate::store::{self, AccountHealth, StoredAccount};

const CLIENT_ID: &str = env!("GITHUB_CLIENT_ID");
const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const SCOPES: &str = "repo read:user";
pub const API_BASE: &str = "https://api.github.com";

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

#[derive(Debug, Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeviceCodePayload {
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum TokenPollResponse {
    Ok {
        access_token: String,
    },
    Err {
        error: String,
        #[serde(default)]
        error_description: Option<String>,
    },
}

pub fn is_configured() -> bool {
    !CLIENT_ID.is_empty()
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

static CANCEL: OnceCell<Notify> = OnceCell::new();

fn cancel_notify() -> &'static Notify {
    CANCEL.get_or_init(Notify::new)
}

pub fn cancel_in_flight() {
    cancel_notify().notify_waiters();
}

pub async fn start_github_oauth(app: AppHandle) -> Result<AccountProfile, AuthError> {
    if !is_configured() {
        return Err(AuthError::Config(
            "GitHub OAuth not configured — set GITHUB_CLIENT_ID at build time".into(),
        ));
    }

    let client = reqwest::Client::new();
    let device = request_device_code(&client, DEVICE_CODE_URL).await?;

    let payload = DeviceCodePayload {
        user_code: device.user_code.clone(),
        verification_uri: device.verification_uri.clone(),
        expires_in: device.expires_in,
    };
    let _ = app.emit("oauth:device_code", &payload);
    let _ = tauri_plugin_opener::open_url(&device.verification_uri, None::<&str>);

    let access_token = poll_for_token(&client, TOKEN_URL, &device).await?;
    let profile = fetch_github_profile(&access_token).await?;

    let account_id = uuid::Uuid::new_v4().to_string();
    crate::keychain::store_token(Platform::GitHub.key(), &account_id, &access_token)?;
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

async fn request_device_code(
    client: &reqwest::Client,
    url: &str,
) -> Result<DeviceCodeResponse, AuthError> {
    let res = client
        .post(url)
        .header("Accept", "application/json")
        .header("User-Agent", "tiny-bell")
        .form(&[("client_id", CLIENT_ID), ("scope", SCOPES)])
        .send()
        .await
        .map_err(AuthError::from)?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(AuthError::Provider(format!(
            "device code request failed ({status}): {body}"
        )));
    }

    res.json::<DeviceCodeResponse>().await.map_err(AuthError::from)
}

async fn poll_for_token(
    client: &reqwest::Client,
    token_url: &str,
    device: &DeviceCodeResponse,
) -> Result<String, AuthError> {
    let start = std::time::Instant::now();
    let budget = std::time::Duration::from_secs(device.expires_in);
    let mut interval_secs = device.interval.max(5);

    loop {
        let sleep = tokio::time::sleep(std::time::Duration::from_secs(interval_secs));
        tokio::select! {
            _ = sleep => {}
            _ = cancel_notify().notified() => {
                return Err(AuthError::ServerClosed);
            }
        }

        if start.elapsed() >= budget {
            return Err(AuthError::Timeout);
        }

        let res = client
            .post(token_url)
            .header("Accept", "application/json")
            .header("User-Agent", "tiny-bell")
            .form(&[
                ("client_id", CLIENT_ID),
                ("device_code", device.device_code.as_str()),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await
            .map_err(AuthError::from)?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(AuthError::Provider(format!(
                "token poll failed ({status}): {body}"
            )));
        }

        let parsed: TokenPollResponse = res.json().await.map_err(AuthError::from)?;
        match parsed {
            TokenPollResponse::Ok { access_token } => return Ok(access_token),
            TokenPollResponse::Err {
                error,
                error_description,
            } => match error.as_str() {
                "authorization_pending" => continue,
                "slow_down" => {
                    interval_secs += 5;
                    continue;
                }
                "expired_token" => return Err(AuthError::Timeout),
                "access_denied" => {
                    return Err(AuthError::Provider(
                        "User cancelled the authorization".into(),
                    ))
                }
                other => {
                    let msg = error_description.unwrap_or_else(|| other.to_string());
                    return Err(AuthError::Provider(msg));
                }
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{bearer_token, body_string_contains, method, path};
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

    #[tokio::test]
    async fn device_flow_polls_until_token_issued() {
        let server = MockServer::start().await;
        let device = DeviceCodeResponse {
            device_code: "dev-abc".into(),
            user_code: "WDJB-MJHT".into(),
            verification_uri: "https://github.com/login/device".into(),
            expires_in: 30,
            interval: 0,
        };
        let token_path = "/login/oauth/access_token";

        Mock::given(method("POST"))
            .and(path(token_path))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "error": "authorization_pending"
            })))
            .up_to_n_times(1)
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path(token_path))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "access_token": "gho_success"
            })))
            .mount(&server)
            .await;

        let url = format!("{}{}", server.uri(), token_path);
        let client = reqwest::Client::new();
        let token = poll_for_token(&client, &url, &device).await.expect("token");
        assert_eq!(token, "gho_success");
    }

    #[tokio::test]
    async fn device_flow_surfaces_access_denied() {
        let server = MockServer::start().await;
        let device = DeviceCodeResponse {
            device_code: "dev-abc".into(),
            user_code: "XXXX-XXXX".into(),
            verification_uri: "https://github.com/login/device".into(),
            expires_in: 30,
            interval: 0,
        };
        Mock::given(method("POST"))
            .and(path("/login/oauth/access_token"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "error": "access_denied"
            })))
            .mount(&server)
            .await;
        let url = format!("{}/login/oauth/access_token", server.uri());
        let client = reqwest::Client::new();
        let err = poll_for_token(&client, &url, &device).await.unwrap_err();
        assert!(matches!(err, AuthError::Provider(ref m) if m.contains("cancelled")));
    }

    #[tokio::test]
    async fn device_flow_respects_slow_down() {
        let server = MockServer::start().await;
        let device = DeviceCodeResponse {
            device_code: "dev-abc".into(),
            user_code: "XXXX-XXXX".into(),
            verification_uri: "https://github.com/login/device".into(),
            expires_in: 30,
            interval: 0,
        };
        Mock::given(method("POST"))
            .and(path("/login/oauth/access_token"))
            .and(body_string_contains("grant_type="))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "error": "slow_down"
            })))
            .up_to_n_times(1)
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/login/oauth/access_token"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "access_token": "gho_after_slow_down"
            })))
            .mount(&server)
            .await;
        let url = format!("{}/login/oauth/access_token", server.uri());
        let client = reqwest::Client::new();
        let token = poll_for_token(&client, &url, &device).await.expect("token");
        assert_eq!(token, "gho_after_slow_down");
    }

    #[tokio::test]
    async fn request_device_code_parses_response() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/login/device/code"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "device_code": "dev-xyz",
                "user_code": "ABCD-EFGH",
                "verification_uri": "https://github.com/login/device",
                "expires_in": 900,
                "interval": 5
            })))
            .mount(&server)
            .await;
        let url = format!("{}/login/device/code", server.uri());
        let client = reqwest::Client::new();
        let device = request_device_code(&client, &url).await.expect("device");
        assert_eq!(device.user_code, "ABCD-EFGH");
        assert_eq!(device.expires_in, 900);
    }
}
