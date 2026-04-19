use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::adapters::registry::AdapterRegistry;
use crate::adapters::{AccountProfile, Platform};
use crate::auth::github::{fetch_github_profile, start_github_oauth};
use crate::auth::pat::fetch_railway_profile;
use crate::auth::railway::start_railway_oauth;
use crate::auth::vercel::{fetch_vercel_profile, start_vercel_oauth};
use crate::auth::{oauth, pat, token_provider, AuthError};
use crate::store::{self, AccountHealth, StoredAccount};

#[derive(Debug, Serialize)]
pub struct AccountRecord {
    pub id: String,
    pub platform: Platform,
    pub display_name: String,
    pub scope_id: Option<String>,
    pub enabled: bool,
    pub created_at: i64,
    pub health: AccountHealth,
    pub monitored_repos: Option<Vec<String>>,
}

impl From<StoredAccount> for AccountRecord {
    fn from(s: StoredAccount) -> Self {
        Self {
            id: s.id,
            platform: s.platform,
            display_name: s.display_name,
            scope_id: s.scope_id,
            enabled: s.enabled,
            created_at: s.created_at,
            health: s.health,
            monitored_repos: s.monitored_repos,
        }
    }
}

async fn rehydrate_after_change(app: &AppHandle) {
    if let Ok(accounts) = store::list_accounts(app) {
        if let Some(registry) = app.try_state::<Arc<AdapterRegistry>>() {
            registry.inner().hydrate(&accounts).await;
        }
        if !accounts.is_empty() {
            crate::poller::ensure_started(app);
            crate::poller::force_refresh(app);
        }
    }
    let _ = app.emit("accounts:changed", ());
}

#[tauri::command]
pub async fn start_oauth(
    app: AppHandle,
    platform: String,
) -> Result<AccountProfile, String> {
    let profile = match platform.as_str() {
        "vercel" => start_vercel_oauth(app.clone())
            .await
            .map_err(|e| e.to_string())?,
        "railway" => start_railway_oauth(app.clone())
            .await
            .map_err(|e| e.to_string())?,
        "github" => start_github_oauth(app.clone())
            .await
            .map_err(|e| e.to_string())?,
        other => return Err(format!("OAuth not supported for '{other}'")),
    };
    rehydrate_after_change(&app).await;
    Ok(profile)
}

#[tauri::command]
pub async fn connect_with_token(
    app: AppHandle,
    platform: String,
    token: String,
    scope_id: Option<String>,
) -> Result<AccountProfile, String> {
    let platform_enum = Platform::from_key(&platform)
        .ok_or_else(|| format!("Unknown platform '{platform}'"))?;
    let trimmed = token.trim().to_string();
    if trimmed.is_empty() {
        return Err("Token is required".into());
    }
    let profile = pat::connect_via_pat(
        &app,
        platform_enum,
        trimmed,
        scope_id.filter(|s| !s.is_empty()),
    )
    .await
    .map_err(|e| e.to_string())?;
    rehydrate_after_change(&app).await;
    Ok(profile)
}

#[tauri::command]
pub async fn cancel_oauth() -> Result<(), String> {
    oauth::abort_current();
    Ok(())
}

#[tauri::command]
pub async fn list_accounts(app: AppHandle) -> Result<Vec<AccountRecord>, String> {
    let accounts = store::list_accounts(&app)?;
    Ok(accounts.into_iter().map(AccountRecord::from).collect())
}

#[tauri::command]
pub async fn delete_account(app: AppHandle, id: String) -> Result<(), String> {
    store::delete_account(&app, &id)?;
    if let Some(registry) = app.try_state::<Arc<AdapterRegistry>>() {
        registry.inner().remove(&id);
    }
    rehydrate_after_change(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn hydrate_adapters(app: AppHandle) -> Result<(), String> {
    rehydrate_after_change(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn set_account_enabled(
    app: AppHandle,
    id: String,
    enabled: bool,
) -> Result<Option<AccountRecord>, String> {
    let updated = store::update_account(&app, &id, |a| {
        a.enabled = enabled;
    })?;
    Ok(updated.map(AccountRecord::from))
}

#[tauri::command]
pub async fn validate_token(
    app: AppHandle,
    account_id: String,
) -> Result<AccountHealth, String> {
    let accounts = store::list_accounts(&app)?;
    let account = accounts
        .into_iter()
        .find(|a| a.id == account_id)
        .ok_or_else(|| format!("no such account: {account_id}"))?;

    let token = match token_provider::get_fresh_access_token(&account_id, account.platform).await {
        Ok(t) => t,
        Err(AuthError::Provider(msg)) => {
            log::warn!("validate_token: refresh rejected for {account_id}: {msg}");
            let _ = store::update_account(&app, &account_id, |a| {
                a.health = AccountHealth::NeedsReauth;
            });
            let _ = app.emit("accounts:changed", ());
            return Ok(AccountHealth::NeedsReauth);
        }
        Err(AuthError::Keychain(e)) => {
            log::warn!("validate_token: keychain miss for {account_id}: {e}");
            let _ = store::update_account(&app, &account_id, |a| {
                a.health = AccountHealth::Revoked;
            });
            let _ = app.emit("accounts:changed", ());
            return Ok(AccountHealth::Revoked);
        }
        Err(e) => {
            log::warn!("validate_token: transient token error for {account_id}: {e}");
            return Err("Could not verify account right now. Check your network and try again.".into());
        }
    };

    let result: Result<AccountProfile, AuthError> = match account.platform {
        Platform::Vercel => fetch_vercel_profile(&token, account.scope_id.as_deref()).await,
        Platform::Railway => fetch_railway_profile(&token).await,
        Platform::GitHub => fetch_github_profile(&token).await,
    };

    let health = match result {
        Ok(_) => Some(AccountHealth::Ok),
        Err(AuthError::Provider(msg)) => {
            log::warn!("validate_token: provider error for {account_id}: {msg}");
            let lower = msg.to_lowercase();
            if msg.contains("401") || lower.contains("unauthor") {
                Some(AccountHealth::NeedsReauth)
            } else if msg.contains("403") || lower.contains("revok") {
                Some(AccountHealth::Revoked)
            } else {
                None
            }
        }
        Err(e) => {
            log::warn!("validate_token: transient error for {account_id}: {e}");
            None
        }
    };

    match health {
        Some(h) => {
            let _ = store::update_account(&app, &account_id, |a| {
                a.health = h;
            });
            let _ = app.emit("accounts:changed", ());
            Ok(h)
        }
        None => Err("Could not verify account right now. Check your network and try again.".into()),
    }
}

#[tauri::command]
pub async fn rename_account(
    app: AppHandle,
    id: String,
    display_name: String,
) -> Result<Option<AccountRecord>, String> {
    let trimmed = display_name.trim().to_string();
    if trimmed.is_empty() {
        return Err("Display name is required".into());
    }
    let updated = store::update_account(&app, &id, |a| {
        a.display_name = trimmed;
    })?;
    Ok(updated.map(AccountRecord::from))
}

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
    let account = accounts
        .into_iter()
        .find(|a| a.id == account_id && a.platform == Platform::GitHub)
        .ok_or_else(|| format!("no GitHub account: {account_id}"))?;

    let token = token_provider::get_fresh_access_token(&account.id, account.platform)
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

    Ok(repos
        .into_iter()
        .map(|r| GitHubRepoInfo {
            full_name: r.full_name,
            name: r.name,
            is_private: r.is_private,
            default_branch: r.default_branch,
        })
        .collect())
}

#[tauri::command]
pub async fn set_monitored_repos(
    app: AppHandle,
    account_id: String,
    repos: Vec<String>,
) -> Result<(), String> {
    let capped: Vec<String> = repos.into_iter().take(30).collect();
    store::update_account(&app, &account_id, |a| {
        a.monitored_repos = Some(capped);
    })?;
    rehydrate_after_change(&app).await;
    Ok(())
}
