use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "dev-radio.store.json";
const CLOSE_HINT_KEY: &str = "ui.close_hint_seen";

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
