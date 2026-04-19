use keyring::Entry;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "dev-radio.store.json";
const CLOSE_HINT_KEY: &str = "ui.close_hint_seen";
const KEYCHAIN_SERVICE: &str = "dev-radio";
const KEYCHAIN_VAULT_ACCOUNT: &str = "vault";

#[tauri::command]
pub async fn has_seen_close_hint<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    Ok(store
        .get(CLOSE_HINT_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}

#[tauri::command]
pub async fn mark_close_hint_seen<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(CLOSE_HINT_KEY, serde_json::Value::Bool(true));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn dev_reset<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.clear();
    store.save().map_err(|e| e.to_string())?;

    if let Ok(entry) = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_VAULT_ACCOUNT) {
        let _ = entry.delete_credential();
    }

    Ok(())
}
