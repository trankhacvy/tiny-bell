use tauri::AppHandle;

use crate::adapters::{AccountProfile, Platform};
use crate::auth::vercel::fetch_vercel_profile;
use crate::auth::AuthError;
use crate::store::{self, AccountHealth, StoredAccount};

pub const DEFAULT_RAILWAY_GRAPHQL_URL: &str = "https://backboard.railway.com/graphql/v2";

pub async fn connect_via_pat(
    app: &AppHandle,
    platform: Platform,
    token: String,
    scope_id: Option<String>,
) -> Result<AccountProfile, AuthError> {
    let profile = match platform {
        Platform::Vercel => fetch_vercel_profile(&token, scope_id.as_deref()).await?,
        Platform::Railway => fetch_railway_profile(&token).await?,
        Platform::GitHub => crate::auth::github::fetch_github_profile(&token).await?,
    };

    let account_id = uuid::Uuid::new_v4().to_string();
    crate::keychain::store_token(platform.key(), &account_id, &token)?;
    let stored = StoredAccount {
        id: account_id.clone(),
        platform,
        display_name: profile.display_name.clone(),
        scope_id: profile.scope_id.clone().or(scope_id),
        enabled: true,
        created_at: chrono::Utc::now().timestamp_millis(),
        health: AccountHealth::Ok,
        monitored_repos: None,
    };
    store::save_account(app, &stored).map_err(|e| AuthError::Store(e))?;

    Ok(AccountProfile {
        id: account_id,
        ..profile
    })
}

pub async fn fetch_railway_profile(token: &str) -> Result<AccountProfile, AuthError> {
    fetch_railway_profile_with_url(token, DEFAULT_RAILWAY_GRAPHQL_URL).await
}

pub async fn fetch_railway_profile_with_url(
    token: &str,
    graphql_url: &str,
) -> Result<AccountProfile, AuthError> {
    log::info!(target: "dev_radio::railway_pat", "fetch_railway_profile → {graphql_url}");
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "query": "query { me { id email name avatar } }"
    });
    let res = client
        .post(graphql_url)
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            log::warn!(target: "dev_radio::railway_pat", "network error: {e}");
            AuthError::from(e)
        })?;

    let status = res.status();
    log::info!(target: "dev_radio::railway_pat", "railway response status={status}");

    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        log::warn!(target: "dev_radio::railway_pat", "railway returned {status}");
        return Err(AuthError::Provider("Invalid token".into()));
    }

    let value: serde_json::Value = res
        .error_for_status()
        .map_err(|e| {
            log::warn!(target: "dev_radio::railway_pat", "http error: {e}");
            AuthError::from(e)
        })?
        .json()
        .await
        .map_err(|e| {
            log::warn!(target: "dev_radio::railway_pat", "json parse error: {e}");
            AuthError::from(e)
        })?;

    if let Some(errors) = value.get("errors").and_then(|v| v.as_array()) {
        if let Some(first) = errors.first() {
            let msg = first
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("GraphQL error")
                .to_string();
            log::warn!(target: "dev_radio::railway_pat", "graphql error: {msg}");
            return Err(AuthError::Provider(msg));
        }
    }

    let me = value.get("data").and_then(|d| d.get("me"));
    let me = match me {
        Some(v) if !v.is_null() => v,
        _ => {
            log::warn!(target: "dev_radio::railway_pat", "me is null — likely workspace/project token");
            return Err(AuthError::Provider("Invalid token".into()));
        }
    };

    let id = me
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AuthError::Provider("Missing user id".into()))?
        .to_string();
    let email = me.get("email").and_then(|v| v.as_str()).map(str::to_string);
    let name = me.get("name").and_then(|v| v.as_str()).map(str::to_string);
    let avatar = me
        .get("avatar")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    let display = name
        .clone()
        .or_else(|| email.clone())
        .unwrap_or_else(|| "Railway".to_string());

    Ok(AccountProfile {
        id,
        platform: Platform::Railway,
        display_name: display,
        email,
        avatar_url: avatar,
        scope_id: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn fetches_railway_profile() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/graphql/v2"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": {
                    "me": {
                        "id": "u_railway",
                        "email": "daniel@example.com",
                        "name": "Daniel",
                        "avatar": "https://example.com/a.png"
                    }
                }
            })))
            .mount(&server)
            .await;
        let url = format!("{}/graphql/v2", server.uri());
        let profile = fetch_railway_profile_with_url("tok", &url).await.expect("profile");
        assert_eq!(profile.id, "u_railway");
        assert_eq!(profile.display_name, "Daniel");
        assert_eq!(profile.email.as_deref(), Some("daniel@example.com"));
    }

    #[tokio::test]
    async fn null_me_surfaces_invalid_token() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/graphql/v2"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": { "me": null }
            })))
            .mount(&server)
            .await;
        let url = format!("{}/graphql/v2", server.uri());
        let err = fetch_railway_profile_with_url("tok", &url).await.unwrap_err();
        assert!(matches!(err, AuthError::Provider(ref m) if m.contains("Invalid token")));
    }

    #[tokio::test]
    async fn graphql_errors_surface_provider_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/graphql/v2"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "errors": [ { "message": "Problem processing request" } ]
            })))
            .mount(&server)
            .await;
        let url = format!("{}/graphql/v2", server.uri());
        let err = fetch_railway_profile_with_url("tok", &url).await.unwrap_err();
        assert!(matches!(err, AuthError::Provider(ref m) if m.contains("Problem processing request")));
    }

    #[tokio::test]
    async fn unauthorized_surfaces_invalid_token() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/graphql/v2"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;
        let url = format!("{}/graphql/v2", server.uri());
        let err = fetch_railway_profile_with_url("tok", &url).await.unwrap_err();
        assert!(matches!(err, AuthError::Provider(ref m) if m.contains("Invalid token")));
    }
}
