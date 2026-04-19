use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use crate::adapters::Platform;

const STORE_FILE: &str = "tiny-bell.store.json";
const ACCOUNTS_KEY: &str = "accounts";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AccountHealth {
    Ok,
    NeedsReauth,
    Revoked,
}

impl Default for AccountHealth {
    fn default() -> Self {
        AccountHealth::Ok
    }
}

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
    pub monitored_repos: Option<Vec<String>>,
}

fn load<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<StoredAccount>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    match store.get(ACCOUNTS_KEY) {
        Some(value) => {
            serde_json::from_value::<Vec<StoredAccount>>(value).map_err(|e| e.to_string())
        }
        None => Ok(Vec::new()),
    }
}

fn write<R: Runtime>(app: &AppHandle<R>, accounts: &[StoredAccount]) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = serde_json::to_value(accounts).map_err(|e| e.to_string())?;
    store.set(ACCOUNTS_KEY, value);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_accounts<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<StoredAccount>, String> {
    load(app)
}

pub fn save_account<R: Runtime>(
    app: &AppHandle<R>,
    account: &StoredAccount,
) -> Result<(), String> {
    let mut accounts = load(app)?;
    if let Some(existing) = accounts.iter_mut().find(|a| a.id == account.id) {
        *existing = account.clone();
    } else {
        accounts.push(account.clone());
    }
    write(app, &accounts)
}

pub fn delete_account<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<(), String> {
    let mut accounts = load(app)?;
    let before = accounts.len();
    accounts.retain(|a| a.id != id);
    if accounts.len() == before {
        return Ok(());
    }
    write(app, &accounts)?;
    for key in ["vercel", "railway", "github"] {
        let _ = crate::keychain::delete_token(key, id);
    }
    Ok(())
}

pub fn update_account<R: Runtime, F>(
    app: &AppHandle<R>,
    id: &str,
    mutate: F,
) -> Result<Option<StoredAccount>, String>
where
    F: FnOnce(&mut StoredAccount),
{
    let mut accounts = load(app)?;
    let Some(existing) = accounts.iter_mut().find(|a| a.id == id) else {
        return Ok(None);
    };
    mutate(existing);
    let updated = existing.clone();
    write(app, &accounts)?;
    Ok(Some(updated))
}
