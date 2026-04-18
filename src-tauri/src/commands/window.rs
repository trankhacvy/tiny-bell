use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

#[tauri::command]
pub async fn open_desktop(app: AppHandle, view: String) -> Result<(), String> {
    crate::window::show_desktop(&app, &view);
    Ok(())
}

#[tauri::command]
pub async fn close_desktop(app: AppHandle) -> Result<(), String> {
    crate::window::hide_desktop(&app);
    Ok(())
}

#[tauri::command]
pub async fn toggle_popover(app: AppHandle) -> Result<(), String> {
    crate::window::toggle_popover(&app);
    Ok(())
}

#[tauri::command]
pub async fn show_popover(app: AppHandle) -> Result<(), String> {
    crate::window::show_popover(&app);
    Ok(())
}

#[tauri::command]
pub async fn hide_popover(app: AppHandle) -> Result<(), String> {
    crate::window::hide_popover(&app);
    Ok(())
}

#[tauri::command]
pub async fn quit_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub async fn get_autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}
