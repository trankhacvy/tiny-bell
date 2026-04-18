use tauri::{AppHandle, Runtime};

#[cfg(target_os = "macos")]
pub fn set_visible_dock<R: Runtime>(app: &AppHandle<R>, visible: bool) {
    use tauri::ActivationPolicy;
    let policy = if visible {
        ActivationPolicy::Regular
    } else {
        ActivationPolicy::Accessory
    };
    if let Err(e) = app.set_activation_policy(policy) {
        log::warn!("set_activation_policy failed: {e}");
    }
}

#[cfg(not(target_os = "macos"))]
pub fn set_visible_dock<R: Runtime>(_app: &AppHandle<R>, _visible: bool) {}
