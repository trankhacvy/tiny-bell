use tauri::{AppHandle, Runtime};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

/// Fire a test notification so the user can verify whether macOS is actually
/// delivering them. Returns Ok on successful *dispatch* — whether the system
/// shows a banner depends on macOS permission state, which the notification
/// plugin cannot query reliably on desktop.
#[tauri::command]
pub async fn test_notification<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    app.notification()
        .builder()
        .title("tiny-bell · Deployment ready")
        .body("feat(web): optimize image loading\nmain · Maya")
        .show()
        .map_err(|e| e.to_string())
}

/// Deep-link to the current app's row in macOS Notification settings. The
/// URL scheme is honored by System Settings on Ventura+ and System
/// Preferences on older versions. No-op on other platforms.
#[tauri::command]
pub async fn open_notification_settings<R: Runtime>(
    app: AppHandle<R>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let bundle_id = &app.config().identifier;
        let url = format!(
            "x-apple.systempreferences:com.apple.preference.notifications?id={bundle_id}"
        );
        app.opener()
            .open_url(&url, None::<&str>)
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
    }
    Ok(())
}
