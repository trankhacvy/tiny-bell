use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::prefs::{self, Prefs};

#[tauri::command]
pub async fn get_prefs<R: Runtime>(app: AppHandle<R>) -> Result<Prefs, String> {
    prefs::load(&app)
}

#[tauri::command]
pub async fn set_pref<R: Runtime>(
    app: AppHandle<R>,
    key: String,
    value: Value,
) -> Result<Prefs, String> {
    let previous = prefs::load(&app)?;
    let updated = match key.as_str() {
        "theme" | "global_shortcut" => {
            let s = value
                .as_str()
                .ok_or_else(|| format!("'{key}' expects a string"))?
                .to_string();
            prefs::apply_string(&app, &key, &s)?
        }
        "refresh_interval_ms" => {
            let n = value
                .as_u64()
                .ok_or_else(|| format!("'{key}' expects a positive integer"))?;
            prefs::apply_u64(&app, &key, n)?
        }
        "hide_to_menubar_shown"
        | "start_at_login"
        | "show_in_dock"
        | "notify_on_failure"
        | "notify_on_recovery" => {
            let b = value
                .as_bool()
                .ok_or_else(|| format!("'{key}' expects a boolean"))?;
            prefs::apply_bool(&app, &key, b)?
        }
        other => return Err(format!("unknown pref: {other}")),
    };

    if let Err(e) = apply_side_effects(&app, &key, &updated) {
        // Roll back: restore the previous pref value on disk, and best-effort
        // re-apply the previous side effect (e.g. re-register the old shortcut).
        let _ = prefs::save(&app, &previous);
        let _ = apply_side_effects(&app, &key, &previous);
        return Err(e);
    }

    let _ = app.emit("prefs:changed", &updated);
    Ok(updated)
}

#[tauri::command]
pub async fn set_window_theme<R: Runtime>(
    app: AppHandle<R>,
    theme: String,
) -> Result<(), String> {
    let parsed = match theme.as_str() {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        "system" => None,
        other => return Err(format!("invalid theme: {other}")),
    };
    for window in app.webview_windows().values() {
        if let Err(e) = window.set_theme(parsed) {
            log::warn!("set_theme({theme}) failed on {}: {e}", window.label());
        }
    }
    Ok(())
}

fn apply_side_effects<R: Runtime>(
    app: &AppHandle<R>,
    key: &str,
    prefs: &Prefs,
) -> Result<(), String> {
    match key {
        "refresh_interval_ms" => {
            let secs = (prefs.refresh_interval_ms / 1000).max(5);
            crate::poller::set_interval_secs(app, secs);
        }
        "show_in_dock" => {
            crate::platform::set_visible_dock(app, prefs.show_in_dock);
        }
        "theme" => {
            let parsed = match prefs.theme.as_str() {
                "light" => Some(tauri::Theme::Light),
                "dark" => Some(tauri::Theme::Dark),
                _ => None,
            };
            for window in app.webview_windows().values() {
                let _ = window.set_theme(parsed);
            }
        }
        "global_shortcut" => {
            // Shortcut registration can fail (invalid accelerator, OS-level
            // conflict with another app). Surface the error so the UI can
            // show an inline message and revert.
            crate::shortcut::register(app, &prefs.global_shortcut)?;
        }
        "start_at_login" => {
            use tauri_plugin_autostart::ManagerExt;
            let manager = app.autolaunch();
            let result = if prefs.start_at_login {
                manager.enable()
            } else {
                manager.disable()
            };
            if let Err(e) = result {
                log::warn!("autostart toggle failed: {e}");
            }
        }
        _ => {}
    }
    Ok(())
}
