use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::adapters::registry::AdapterRegistry;
use crate::adapters::{AccountProfile, Platform};
use crate::auth::{oauth, pat, vercel};
use crate::store::{self, StoredAccount};

#[derive(Debug, Serialize)]
pub struct AccountRecord {
    pub id: String,
    pub platform: Platform,
    pub display_name: String,
    pub scope_id: Option<String>,
    pub enabled: bool,
    pub created_at: i64,
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
        }
    }
}

fn rehydrate_after_change(app: &AppHandle) {
    if let Ok(accounts) = store::list_accounts(app) {
        if let Some(registry) = app.try_state::<Arc<AdapterRegistry>>() {
            registry.inner().hydrate(&accounts);
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
        "vercel" => vercel::start_vercel_oauth(app.clone())
            .await
            .map_err(|e| e.to_string())?,
        other => return Err(format!("OAuth not supported for '{other}'")),
    };
    rehydrate_after_change(&app);
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
    rehydrate_after_change(&app);
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
    rehydrate_after_change(&app);
    Ok(())
}

#[tauri::command]
pub async fn hydrate_adapters(app: AppHandle) -> Result<(), String> {
    rehydrate_after_change(&app);
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
