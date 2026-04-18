use std::sync::Arc;

use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::cache::{Cache, DashboardState};

#[tauri::command]
pub async fn get_dashboard(cache: State<'_, Arc<Cache>>) -> Result<DashboardState, String> {
    Ok(cache.snapshot())
}

#[tauri::command]
pub async fn refresh_now(app: AppHandle) -> Result<(), String> {
    crate::poller::force_refresh(&app);
    Ok(())
}

#[tauri::command]
pub async fn set_poll_interval(app: AppHandle, secs: u64) -> Result<(), String> {
    crate::poller::set_interval_secs(&app, secs);
    Ok(())
}

#[tauri::command]
pub async fn get_poll_interval(app: AppHandle) -> Result<u64, String> {
    Ok(crate::poller::current_interval_secs(&app))
}

#[tauri::command]
pub async fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| e.to_string())
}
