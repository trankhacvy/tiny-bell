use std::sync::Arc;

use tauri::webview::PageLoadEvent;
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_opener::OpenerExt;

pub mod adapters;
pub mod auth;
pub mod cache;
pub mod keychain;
pub mod notifications;
pub mod platform;
pub mod poller;
pub mod prefs;
pub mod redact;
pub mod shortcut;
pub mod store;
pub mod tray;
pub mod window;
pub mod commands;

use adapters::registry::AdapterRegistry;
use cache::Cache;
use commands::accounts as account_cmds;
use commands::deployments as deployment_cmds;
use commands::prefs as prefs_cmds;
use commands::ux as ux_cmds;
use commands::window as window_cmds;

fn external_navigation_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::<R>::new("external-navigation")
        .on_navigation(|webview, url| {
            let is_internal_host = matches!(
                url.host_str(),
                Some("localhost") | Some("127.0.0.1") | Some("tauri.localhost") | Some("::1")
            );

            let is_internal = url.scheme() == "tauri" || is_internal_host;

            if is_internal {
                return true;
            }

            let is_external_link = matches!(url.scheme(), "http" | "https" | "mailto" | "tel");

            if is_external_link {
                log::info!("opening external link in system browser: {}", url);
                let _ = webview.opener().open_url(url.as_str(), None::<&str>);
                return false;
            }

            true
        })
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .level(log::LevelFilter::Info)
                .level_for("reqwest", log::LevelFilter::Warn)
                .level_for("hyper", log::LevelFilter::Warn)
                .level_for("hyper_util", log::LevelFilter::Warn)
                .level_for("rustls", log::LevelFilter::Warn)
                .level_for("tao", log::LevelFilter::Warn)
                .level_for("wry", log::LevelFilter::Warn)
                .level_for("tracing", log::LevelFilter::Warn)
                .format(|out, message, record| {
                    let raw = format!("{}", message);
                    let redacted = redact::redact(&raw);
                    out.finish(format_args!(
                        "[{} {}] {}",
                        record.level(),
                        record.target(),
                        redacted
                    ))
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(external_navigation_plugin())
        .invoke_handler(tauri::generate_handler![
            account_cmds::start_oauth,
            account_cmds::connect_with_token,
            account_cmds::cancel_oauth,
            account_cmds::list_accounts,
            account_cmds::delete_account,
            account_cmds::set_account_enabled,
            account_cmds::rename_account,
            account_cmds::validate_token,
            account_cmds::hydrate_adapters,
            deployment_cmds::get_dashboard,
            deployment_cmds::refresh_now,
            deployment_cmds::set_poll_interval,
            deployment_cmds::get_poll_interval,
            deployment_cmds::open_external,
            window_cmds::open_desktop,
            window_cmds::close_desktop,
            window_cmds::show_popover,
            window_cmds::hide_popover,
            window_cmds::toggle_popover,
            window_cmds::quit_app,
            window_cmds::get_autostart,
            window_cmds::set_autostart,
            ux_cmds::has_seen_close_hint,
            ux_cmds::mark_close_hint_seen,
            #[cfg(debug_assertions)]
            ux_cmds::dev_reset,
            prefs_cmds::get_prefs,
            prefs_cmds::set_pref,
            prefs_cmds::set_window_theme,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            app.manage(Arc::new(AdapterRegistry::new()));
            app.manage(Arc::new(Cache::new()));

            tray::build(&handle)?;
            tray::set_health(&handle, tray::HealthLevel::Setup);

            let prefs = prefs::load(&handle).unwrap_or_default();
            let interval_secs = (prefs.refresh_interval_ms / 1000).max(5);

            let accounts = store::list_accounts(&handle).unwrap_or_default();
            if accounts.is_empty() {
                window::show_desktop(&handle, "onboarding");
            } else {
                platform::set_visible_dock(&handle, prefs.show_in_dock);
                poller::ensure_started(&handle);
                poller::set_interval_secs(&handle, interval_secs);
            }

            let initial_theme = match prefs.theme.as_str() {
                "light" => Some(tauri::Theme::Light),
                "dark" => Some(tauri::Theme::Dark),
                _ => None,
            };
            for window in handle.webview_windows().values() {
                let _ = window.set_theme(initial_theme);
            }

            if let Err(e) = shortcut::register(&handle, &prefs.global_shortcut) {
                log::warn!("register global shortcut failed: {e}");
            }

            {
                use tauri_plugin_autostart::ManagerExt;
                let manager = handle.autolaunch();
                let desired = prefs.start_at_login;
                let current = manager.is_enabled().unwrap_or(false);
                if desired != current {
                    let result = if desired {
                        manager.enable()
                    } else {
                        manager.disable()
                    };
                    if let Err(e) = result {
                        log::warn!("autostart sync failed: {e}");
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            let label = window.label().to_string();
            match label.as_str() {
                "popover" => {
                    if matches!(event, WindowEvent::Focused(false)) {
                        let _ = window.hide();
                    }
                }
                "desktop" => {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let app = window.app_handle().clone();
                        crate::window::hide_desktop(&app);
                        if crate::window::mark_close_hint_fired() {
                            let _ = app.emit("desktop:close-hint", ());
                        }
                    }
                }
                _ => {}
            }
        })
        .on_page_load(|webview, payload| {
            if matches!(payload.event(), PageLoadEvent::Finished) {
                log::info!("webview finished loading: {}", webview.label());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
