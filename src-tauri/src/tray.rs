use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Runtime};

pub const TRAY_ID: &str = "main";

const ICON_TEMPLATE: &[u8] = include_bytes!("../icons/tray/tray-template@2x.png");
const ICON_GRAY: &[u8] = include_bytes!("../icons/tray/tray-gray@2x.png");
const ICON_GREEN: &[u8] = include_bytes!("../icons/tray/tray-green@2x.png");
const ICON_YELLOW: &[u8] = include_bytes!("../icons/tray/tray-yellow@2x.png");
const ICON_RED: &[u8] = include_bytes!("../icons/tray/tray-red@2x.png");
const ICON_SYNCING: &[u8] = include_bytes!("../icons/tray/tray-syncing@2x.png");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HealthLevel {
    Setup,
    Syncing,
    Gray,
    Green,
    Yellow,
    Red,
}

impl HealthLevel {
    fn icon_bytes(self) -> &'static [u8] {
        match self {
            HealthLevel::Setup => ICON_SYNCING,
            HealthLevel::Syncing => ICON_SYNCING,
            HealthLevel::Gray => ICON_GRAY,
            HealthLevel::Green => ICON_GREEN,
            HealthLevel::Yellow => ICON_YELLOW,
            HealthLevel::Red => ICON_RED,
        }
    }

    fn is_template(self) -> bool {
        matches!(self, HealthLevel::Setup | HealthLevel::Syncing | HealthLevel::Gray)
    }
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(());
    }

    let open = MenuItem::with_id(app, "open", "Open Tiny Bell", true, Some("Cmd+O"))?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh Now", true, Some("Cmd+R"))?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Tiny Bell", true, Some("Cmd+Q"))?;
    let menu = Menu::with_items(app, &[&open, &refresh, &settings, &sep, &quit])?;

    let template_icon = Image::from_bytes(ICON_TEMPLATE)?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(template_icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => route_primary_action(app),
            "refresh" => {
                crate::poller::force_refresh(app);
            }
            "settings" => {
                crate::window::show_desktop(app, "settings");
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                route_primary_action(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn route_primary_action<R: Runtime>(app: &AppHandle<R>) {
    let accounts = crate::store::list_accounts(app).unwrap_or_default();
    if accounts.is_empty() {
        crate::window::show_desktop(app, "onboarding");
    } else {
        crate::window::toggle_popover(app);
    }
}

pub fn set_health<R: Runtime>(app: &AppHandle<R>, level: HealthLevel) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let bytes = level.icon_bytes();
    if let Ok(img) = Image::from_bytes(bytes) {
        let _ = tray.set_icon(Some(img));
        let _ = tray.set_icon_as_template(level.is_template());
    }
}
