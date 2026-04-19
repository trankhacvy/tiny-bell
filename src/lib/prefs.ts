import { trackedInvoke } from "./tauri"

export type ThemePreference = "system" | "light" | "dark"

export type Prefs = {
  theme: ThemePreference
  refresh_interval_ms: number
  hide_to_menubar_shown: boolean
  start_at_login: boolean
  global_shortcut: string
  show_in_dock: boolean
}

export const DEFAULT_PREFS: Prefs = {
  theme: "system",
  refresh_interval_ms: 30_000,
  hide_to_menubar_shown: false,
  start_at_login: false,
  global_shortcut: "Alt+Command+D",
  show_in_dock: true,
}

type PrefKey = keyof Prefs
type PrefValue<K extends PrefKey> = Prefs[K]

export const prefsApi = {
  get() {
    return trackedInvoke<Prefs>("get_prefs")
  },
  set<K extends PrefKey>(key: K, value: PrefValue<K>) {
    return trackedInvoke<Prefs>("set_pref", { key, value })
  },
}
