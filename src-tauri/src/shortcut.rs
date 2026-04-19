use std::str::FromStr;

use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub fn register<R: Runtime>(app: &AppHandle<R>, accelerator: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    if accelerator.trim().is_empty() {
        return Ok(());
    }
    let parsed = Shortcut::from_str(accelerator)
        .map_err(|e| format!("invalid shortcut '{accelerator}': {e}"))?;
    let label = accelerator.to_string();
    gs.on_shortcut(parsed, move |app, _sc, event| {
        if event.state() == ShortcutState::Pressed {
            log::info!("global shortcut fired: {label}");
            crate::window::toggle_popover(app);
        }
    })
    .map_err(|e| format!("failed to register shortcut '{accelerator}': {e}"))
}
