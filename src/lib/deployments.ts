import { trackedInvoke } from "./tauri"
import type { Platform } from "./accounts"

export type DeploymentState =
  | "queued"
  | "building"
  | "ready"
  | "error"
  | "canceled"
  | "unknown"

export type Deployment = {
  id: string
  project_id: string
  service_id: string | null
  service_name: string | null
  state: DeploymentState
  environment: string
  url: string | null
  inspector_url: string | null
  branch: string | null
  commit_sha: string | null
  commit_message: string | null
  author_name: string | null
  author_avatar: string | null
  created_at: number
  finished_at: number | null
  duration_ms: number | null
  progress: number | null
}

export type Project = {
  id: string
  account_id: string
  platform: Platform
  name: string
  url: string | null
  framework: string | null
  latest_deployment: Deployment | null
}

export type DashboardState = {
  projects: Project[]
  deployments: Deployment[]
  last_refreshed_at: number | null
  last_error: string | null
  offline: boolean
  polling: boolean
}

export const emptyDashboard: DashboardState = {
  projects: [],
  deployments: [],
  last_refreshed_at: null,
  last_error: null,
  offline: false,
  polling: false,
}

export const deploymentsApi = {
  getDashboard() {
    return trackedInvoke<DashboardState>("get_dashboard")
  },
  refreshNow() {
    return trackedInvoke<void>("refresh_now")
  },
  setPollInterval(secs: number) {
    return trackedInvoke<void>("set_poll_interval", { secs })
  },
  getPollInterval() {
    return trackedInvoke<number>("get_poll_interval")
  },
  openExternal(url: string) {
    return trackedInvoke<void>("open_external", { url })
  },
  hydrateAdapters() {
    return trackedInvoke<void>("hydrate_adapters")
  },
}

export const windowApi = {
  openDesktop(view: "onboarding" | "settings" | "about") {
    return trackedInvoke<void>("open_desktop", { view })
  },
  closeDesktop() {
    return trackedInvoke<void>("close_desktop")
  },
  togglePopover() {
    return trackedInvoke<void>("toggle_popover")
  },
  showPopover() {
    return trackedInvoke<void>("show_popover")
  },
  hidePopover() {
    return trackedInvoke<void>("hide_popover")
  },
  quit() {
    return trackedInvoke<void>("quit_app")
  },
  getAutostart() {
    return trackedInvoke<boolean>("get_autostart")
  },
  setAutostart(enabled: boolean) {
    return trackedInvoke<void>("set_autostart", { enabled })
  },
  hasSeenCloseHint() {
    return trackedInvoke<boolean>("has_seen_close_hint")
  },
  markCloseHintSeen() {
    return trackedInvoke<void>("mark_close_hint_seen")
  },
}

export function vercelInspectorUrl(d: Deployment): string | null {
  return d.inspector_url
}

export function deploymentUrl(d: Deployment): string | null {
  if (!d.url) return null
  if (d.url.startsWith("http")) return d.url
  return `https://${d.url}`
}
