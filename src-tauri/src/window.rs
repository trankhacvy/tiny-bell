use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, EventTarget, LogicalPosition, LogicalSize, Manager, Runtime};

pub const DESKTOP: &str = "desktop";
pub const POPOVER: &str = "popover";

pub const POPOVER_W: f64 = 380.0;
pub const POPOVER_H: f64 = 600.0;

static CLOSE_HINT_FIRED: AtomicBool = AtomicBool::new(false);

pub fn show_desktop<R: Runtime>(app: &AppHandle<R>, route: &str) {
    crate::platform::set_visible_dock(app, true);
    if let Some(w) = app.get_webview_window(DESKTOP) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    let _ = app.emit("desktop:route", route.to_string());
}

pub fn hide_desktop<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(DESKTOP) {
        let _ = w.hide();
    }
    if !is_popover_visible(app) {
        crate::platform::set_visible_dock(app, false);
    }
}

pub fn show_popover<R: Runtime>(app: &AppHandle<R>) {
    let Some(w) = app.get_webview_window(POPOVER) else {
        return;
    };
    let _ = w.set_size(LogicalSize::new(POPOVER_W, POPOVER_H));

    if let Some(tray) = app.tray_by_id(crate::tray::TRAY_ID) {
        if let Ok(Some(rect)) = tray.rect() {
            let scale = w.scale_factor().unwrap_or(1.0);
            let logical_pos = rect.position.to_logical::<f64>(scale);
            let logical_size = rect.size.to_logical::<f64>(scale);
            let tray_center_x = logical_pos.x + logical_size.width / 2.0;
            let mut x = tray_center_x - POPOVER_W / 2.0;
            if x < 8.0 {
                x = 8.0;
            }
            let y = 28.0;
            let _ = w.set_position(LogicalPosition::new(x, y));
        }
    }

    let _ = w.show();
    let _ = w.set_focus();
    let _ = app.emit_to(EventTarget::webview_window(POPOVER), "popover:show", ());
    crate::poller::force_refresh(app);
}

pub fn hide_popover<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(POPOVER) {
        let _ = w.hide();
    }
}

pub fn toggle_popover<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(POPOVER) {
        let visible = w.is_visible().unwrap_or(false);
        if visible {
            let _ = w.hide();
        } else {
            show_popover(app);
        }
    }
}

pub fn is_popover_visible<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.get_webview_window(POPOVER)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

pub fn mark_close_hint_fired() -> bool {
    !CLOSE_HINT_FIRED.swap(true, Ordering::Relaxed)
}
