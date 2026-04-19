use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "tiny-bell.store.json";
const PREFS_KEY: &str = "prefs";

pub const DEFAULT_INTERVAL_MS: u64 = 30_000;
pub const DEFAULT_SHORTCUT: &str = "Alt+Command+D";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Prefs {
    pub theme: String,
    pub refresh_interval_ms: u64,
    pub hide_to_menubar_shown: bool,
    pub start_at_login: bool,
    pub global_shortcut: String,
    pub show_in_dock: bool,
    pub notify_on_failure: bool,
    pub notify_on_recovery: bool,
}

impl Default for Prefs {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            refresh_interval_ms: DEFAULT_INTERVAL_MS,
            hide_to_menubar_shown: false,
            start_at_login: false,
            global_shortcut: DEFAULT_SHORTCUT.into(),
            show_in_dock: true,
            notify_on_failure: true,
            notify_on_recovery: true,
        }
    }
}

pub fn load<R: Runtime>(app: &AppHandle<R>) -> Result<Prefs, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    match store.get(PREFS_KEY) {
        Some(value) => {
            let parsed: Prefs = serde_json::from_value(value).unwrap_or_default();
            Ok(parsed)
        }
        None => Ok(Prefs::default()),
    }
}

pub fn save<R: Runtime>(app: &AppHandle<R>, prefs: &Prefs) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = serde_json::to_value(prefs).map_err(|e| e.to_string())?;
    store.set(PREFS_KEY, value);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

fn mutate<R: Runtime, F>(app: &AppHandle<R>, f: F) -> Result<Prefs, String>
where
    F: FnOnce(&mut Prefs),
{
    let mut prefs = load(app)?;
    f(&mut prefs);
    save(app, &prefs)?;
    Ok(prefs)
}

pub fn update<R: Runtime, F>(app: &AppHandle<R>, f: F) -> Result<Prefs, String>
where
    F: FnOnce(&mut Prefs),
{
    mutate(app, f)
}

pub fn apply_string<R: Runtime>(
    app: &AppHandle<R>,
    key: &str,
    value: &str,
) -> Result<Prefs, String> {
    match key {
        "theme" => {
            if !matches!(value, "system" | "light" | "dark") {
                return Err(format!("invalid theme value: {value}"));
            }
            mutate(app, |p| p.theme = value.into())
        }
        "global_shortcut" => mutate(app, |p| p.global_shortcut = value.into()),
        other => Err(format!("unknown string pref: {other}")),
    }
}

pub fn apply_u64<R: Runtime>(app: &AppHandle<R>, key: &str, value: u64) -> Result<Prefs, String> {
    match key {
        "refresh_interval_ms" => {
            if value < 5_000 {
                return Err("interval must be at least 5 seconds".into());
            }
            mutate(app, |p| p.refresh_interval_ms = value)
        }
        other => Err(format!("unknown numeric pref: {other}")),
    }
}

pub fn apply_bool<R: Runtime>(app: &AppHandle<R>, key: &str, value: bool) -> Result<Prefs, String> {
    match key {
        "hide_to_menubar_shown" => mutate(app, |p| p.hide_to_menubar_shown = value),
        "start_at_login" => mutate(app, |p| p.start_at_login = value),
        "show_in_dock" => mutate(app, |p| p.show_in_dock = value),
        "notify_on_failure" => mutate(app, |p| p.notify_on_failure = value),
        "notify_on_recovery" => mutate(app, |p| p.notify_on_recovery = value),
        other => Err(format!("unknown boolean pref: {other}")),
    }
}
