/**
 * Sandbox-only Tauri IPC mocks.
 *
 * When the app runs in a plain browser (`pnpm dev`, no Tauri shell), the real
 * `invoke()` calls would throw because `window.__TAURI_INTERNALS__` is absent.
 * This module installs `mockIPC` from `@tauri-apps/api/mocks` with a handler
 * for every command the UI touches, plus a tiny in-memory store so flows like
 * "add account", "delete account", "rename", and "manage repos" feel real.
 *
 * Only imported by `src/app/dev/sandbox.tsx`; stripped from production bundles.
 */

import { mockIPC, mockWindows } from "@tauri-apps/api/mocks"
import { emit } from "@tauri-apps/api/event"

import type {
  AccountProfile,
  AccountRecord,
  GitHubRepoInfo,
  Platform,
} from "@/lib/accounts"
import type { DashboardState, Deployment, Project } from "@/lib/deployments"
import type { Prefs } from "@/lib/prefs"
import { DEFAULT_PREFS } from "@/lib/prefs"

const NOW = Date.now()
const ago = (ms: number) => NOW - ms

// ── seed data ────────────────────────────────────────────────────────────────

const SEED_PROJECTS: Project[] = [
  {
    id: "proj-acme",
    account_id: "acc-vercel-personal",
    platform: "vercel",
    name: "acme-web",
    url: "acme-web.vercel.app",
    framework: "nextjs",
    latest_deployment: null,
  },
  {
    id: "proj-docs",
    account_id: "acc-vercel-personal",
    platform: "vercel",
    name: "docs-site",
    url: "docs.acme.com",
    framework: "astro",
    latest_deployment: null,
  },
  {
    id: "proj-api",
    account_id: "acc-vercel-personal",
    platform: "vercel",
    name: "api-gateway",
    url: "api.acme.com",
    framework: null,
    latest_deployment: null,
  },
  {
    id: "proj-marketing",
    account_id: "acc-vercel-team",
    platform: "vercel",
    name: "marketing",
    url: "acme.com",
    framework: "nextjs",
    latest_deployment: null,
  },
  {
    id: "proj-backend",
    account_id: "acc-railway",
    platform: "railway",
    name: "backend",
    url: null,
    framework: null,
    latest_deployment: null,
  },
  {
    id: "proj-landing",
    account_id: "acc-railway",
    platform: "railway",
    name: "landing",
    url: "landing.acme.com",
    framework: null,
    latest_deployment: null,
  },
  {
    id: "maya/acme-web",
    account_id: "acc-github",
    platform: "github",
    name: "acme-web",
    url: "https://github.com/maya/acme-web",
    framework: null,
    latest_deployment: null,
  },
  {
    id: "maya/api",
    account_id: "acc-github",
    platform: "github",
    name: "api",
    url: "https://github.com/maya/api",
    framework: null,
    latest_deployment: null,
  },
]

const SEED_DEPLOYMENTS: Deployment[] = [
  {
    id: "d-acme-1",
    project_id: "proj-acme",
    service_id: null,
    service_name: null,
    state: "error",
    environment: "production",
    url: "acme-web.vercel.app",
    inspector_url: "https://vercel.com/logs/d-acme-1",
    branch: "main",
    commit_sha: "a1b2c3d",
    commit_message: "feat: redesign homepage hero section",
    author_name: "Alex Kim",
    author_avatar: null,
    created_at: ago(8 * 60 * 1000),
    finished_at: ago(6 * 60 * 1000),
    duration_ms: 120_000,
    progress: null,
  },
  {
    id: "d-docs-1",
    project_id: "proj-docs",
    service_id: null,
    service_name: null,
    state: "building",
    environment: "production",
    url: "docs.acme.com",
    inspector_url: "https://vercel.com/logs/d-docs-1",
    branch: "main",
    commit_sha: "e4f5a6b",
    commit_message: "docs: update API reference for v2 endpoints",
    author_name: "Sam Lee",
    author_avatar: null,
    created_at: ago(2 * 60 * 1000),
    finished_at: null,
    duration_ms: null,
    progress: 0.6,
  },
  {
    id: "d-api-1",
    project_id: "proj-api",
    service_id: null,
    service_name: null,
    state: "ready",
    environment: "production",
    url: "api.acme.com",
    inspector_url: null,
    branch: "main",
    commit_sha: "c7d8e9f",
    commit_message: "fix: rate limiting on /auth endpoint",
    author_name: "Jordan Park",
    author_avatar: null,
    created_at: ago(45 * 60 * 1000),
    finished_at: ago(43 * 60 * 1000),
    duration_ms: 89_000,
    progress: null,
  },
  {
    id: "d-marketing-1",
    project_id: "proj-marketing",
    service_id: null,
    service_name: null,
    state: "ready",
    environment: "production",
    url: "acme.com",
    inspector_url: null,
    branch: "main",
    commit_sha: "deadbee",
    commit_message: "chore: lighthouse tweaks",
    author_name: "Riley Chen",
    author_avatar: null,
    created_at: ago(6 * 60 * 60 * 1000),
    finished_at: ago(6 * 60 * 60 * 1000 - 70_000),
    duration_ms: 70_000,
    progress: null,
  },
  {
    id: "d-backend-api",
    project_id: "proj-backend",
    service_id: "svc-api",
    service_name: "api",
    state: "ready",
    environment: "production",
    url: null,
    inspector_url: "https://railway.com/logs/d-backend-api",
    branch: "main",
    commit_sha: "f0a1b2c",
    commit_message: "chore: bump dependencies",
    author_name: "Riley Chen",
    author_avatar: null,
    created_at: ago(3 * 60 * 60 * 1000),
    finished_at: ago(3 * 60 * 60 * 1000 - 95_000),
    duration_ms: 95_000,
    progress: null,
  },
  {
    id: "d-backend-worker",
    project_id: "proj-backend",
    service_id: "svc-worker",
    service_name: "worker",
    state: "ready",
    environment: "production",
    url: null,
    inspector_url: "https://railway.com/logs/d-backend-worker",
    branch: "main",
    commit_sha: "f0a1b2c",
    commit_message: "chore: bump dependencies",
    author_name: "Riley Chen",
    author_avatar: null,
    created_at: ago(3 * 60 * 60 * 1000),
    finished_at: ago(3 * 60 * 60 * 1000 - 110_000),
    duration_ms: 110_000,
    progress: null,
  },
  {
    id: "d-landing-1",
    project_id: "proj-landing",
    service_id: null,
    service_name: "web",
    state: "queued",
    environment: "production",
    url: "landing.acme.com",
    inspector_url: null,
    branch: "feat/new-pricing",
    commit_sha: "3e4f5a6",
    commit_message: "feat: new pricing page layout",
    author_name: "Alex Kim",
    author_avatar: null,
    created_at: ago(30 * 1000),
    finished_at: null,
    duration_ms: null,
    progress: null,
  },
  {
    id: "gh-run-42",
    project_id: "maya/acme-web",
    service_id: "workflow-ci",
    service_name: "CI",
    state: "ready",
    environment: "push",
    url: "https://github.com/maya/acme-web/actions/runs/42",
    inspector_url: "https://github.com/maya/acme-web/actions/runs/42",
    branch: "main",
    commit_sha: "ab12cd3",
    commit_message: "test: add regression for #221",
    author_name: "maya",
    author_avatar: null,
    created_at: ago(11 * 60 * 1000),
    finished_at: ago(9 * 60 * 1000),
    duration_ms: 120_000,
    progress: null,
  },
  {
    id: "gh-run-43",
    project_id: "maya/api",
    service_id: "workflow-deploy",
    service_name: "Deploy",
    state: "building",
    environment: "workflow_dispatch",
    url: "https://github.com/maya/api/actions/runs/43",
    inspector_url: "https://github.com/maya/api/actions/runs/43",
    branch: "main",
    commit_sha: "beefcafe",
    commit_message: "chore: release v1.4.0",
    author_name: "maya",
    author_avatar: null,
    created_at: ago(40 * 1000),
    finished_at: null,
    duration_ms: null,
    progress: 0.35,
  },
]

const SEED_ACCOUNTS: AccountRecord[] = [
  {
    id: "acc-vercel-personal",
    platform: "vercel",
    display_name: "Personal",
    scope_id: null,
    enabled: true,
    created_at: ago(30 * 24 * 60 * 60 * 1000),
    health: "ok",
    monitored_repos: null,
  },
  {
    id: "acc-vercel-team",
    platform: "vercel",
    display_name: "Acme (Team)",
    scope_id: "team_abc",
    enabled: true,
    created_at: ago(10 * 24 * 60 * 60 * 1000),
    health: "ok",
    monitored_repos: null,
  },
  {
    id: "acc-railway",
    platform: "railway",
    display_name: "Maya",
    scope_id: null,
    enabled: true,
    created_at: ago(14 * 24 * 60 * 60 * 1000),
    health: "ok",
    monitored_repos: null,
  },
  {
    id: "acc-github",
    platform: "github",
    display_name: "maya",
    scope_id: null,
    enabled: true,
    created_at: ago(5 * 24 * 60 * 60 * 1000),
    health: "ok",
    monitored_repos: ["maya/acme-web", "maya/api"],
  },
]

const REPO_MOCKS: GitHubRepoInfo[] = [
  { full_name: "maya/acme-web", name: "acme-web", is_private: false, default_branch: "main" },
  { full_name: "maya/api", name: "api", is_private: true, default_branch: "main" },
  { full_name: "maya/landing", name: "landing", is_private: false, default_branch: "main" },
  { full_name: "acme/docs", name: "docs", is_private: false, default_branch: "main" },
  { full_name: "acme/checkout", name: "checkout", is_private: true, default_branch: "main" },
  { full_name: "acme/billing", name: "billing", is_private: true, default_branch: "main" },
  { full_name: "maya/dotfiles", name: "dotfiles", is_private: false, default_branch: "main" },
  { full_name: "maya/scratch", name: "scratch", is_private: true, default_branch: "dev" },
]

// ── state ────────────────────────────────────────────────────────────────────

type SandboxState = {
  accounts: AccountRecord[]
  prefs: Prefs
  dashboard: DashboardState
  pollIntervalSecs: number
  autostart: boolean
  closeHintSeen: boolean
}

function freshState(): SandboxState {
  return {
    accounts: SEED_ACCOUNTS.map((a) => ({ ...a })),
    prefs: { ...DEFAULT_PREFS },
    dashboard: {
      projects: SEED_PROJECTS.map((p) => ({ ...p })),
      deployments: SEED_DEPLOYMENTS.map((d) => ({ ...d })),
      last_refreshed_at: ago(30 * 1000),
      last_error: null,
      offline: false,
      rate_limited: false,
      polling: true,
    },
    pollIntervalSecs: 30,
    autostart: false,
    closeHintSeen: false,
  }
}

let state: SandboxState = freshState()

// ── public API for the sandbox UI ────────────────────────────────────────────

export type AccountPreset = "seed" | "empty" | "reauth" | "single-github"

export const sandboxStore = {
  applyAccountPreset(preset: AccountPreset) {
    switch (preset) {
      case "seed":
        state.accounts = SEED_ACCOUNTS.map((a) => ({ ...a }))
        break
      case "empty":
        state.accounts = []
        break
      case "reauth":
        state.accounts = SEED_ACCOUNTS.map((a) => ({
          ...a,
          health:
            a.id === "acc-railway"
              ? "needs_reauth"
              : a.id === "acc-vercel-team"
                ? "revoked"
                : "ok",
        }))
        break
      case "single-github":
        state.accounts = [
          {
            ...SEED_ACCOUNTS.find((a) => a.id === "acc-github")!,
            monitored_repos: [],
          },
        ]
        break
    }
    void emit("accounts:changed")
  },

  setOffline(offline: boolean) {
    state.dashboard = { ...state.dashboard, offline }
    void emit("dashboard:update", state.dashboard)
  },

  setRateLimited(rate_limited: boolean) {
    state.dashboard = { ...state.dashboard, rate_limited }
    void emit("dashboard:update", state.dashboard)
  },

  setDashboardEmpty(empty: boolean) {
    if (empty) {
      state.dashboard = {
        ...state.dashboard,
        projects: [],
        deployments: [],
      }
    } else {
      state.dashboard = {
        ...state.dashboard,
        projects: SEED_PROJECTS.map((p) => ({ ...p })),
        deployments: SEED_DEPLOYMENTS.map((d) => ({ ...d })),
      }
    }
    void emit("dashboard:update", state.dashboard)
  },

  resetAll() {
    state = freshState()
    void emit("accounts:changed")
    void emit("dashboard:update", state.dashboard)
    void emit("prefs:changed", state.prefs)
  },
}

// ── IPC installation ─────────────────────────────────────────────────────────

let installed = false

export function installSandboxMocks() {
  if (installed) return
  installed = true
  // Either window label works; components don't read the value.
  mockWindows("desktop", "popover")
  mockIPC(handleCommand, { shouldMockEvents: true })
}

// ── command handler ──────────────────────────────────────────────────────────

async function handleCommand(cmd: string, args: any): Promise<unknown> {
  const a = args ?? {}
  switch (cmd) {
    // ── built-in plugins ────────────────────────────────────────────────────
    case "plugin:app|version":
      return "0.1.0-sandbox"
    case "plugin:app|name":
      return "Tiny Bell (sandbox)"
    case "plugin:app|tauri_version":
      return "2.0.0-sandbox"
    case "plugin:opener|open_url":
    case "plugin:opener|open_path":
      // eslint-disable-next-line no-console
      console.info("[sandbox] opener:", a.url ?? a.path)
      return

    // ── accounts ────────────────────────────────────────────────────────────
    case "list_accounts":
      return state.accounts.slice()

    case "delete_account": {
      const id = a.id as string
      state.accounts = state.accounts.filter((x) => x.id !== id)
      void emit("accounts:changed")
      return
    }

    case "rename_account": {
      const id = a.id as string
      const displayName = (a.displayName as string | undefined)?.trim()
      if (!displayName) throw "Display name is required"
      const acc = state.accounts.find((x) => x.id === id)
      if (!acc) return null
      acc.display_name = displayName
      void emit("accounts:changed")
      return { ...acc }
    }

    case "set_account_enabled": {
      const id = a.id as string
      const enabled = !!a.enabled
      const acc = state.accounts.find((x) => x.id === id)
      if (!acc) return null
      acc.enabled = enabled
      void emit("accounts:changed")
      return { ...acc }
    }

    case "validate_token": {
      const id = a.accountId as string
      const acc = state.accounts.find((x) => x.id === id)
      if (!acc) throw `no such account: ${id}`
      acc.health = "ok"
      void emit("accounts:changed")
      return "ok"
    }

    case "hydrate_adapters":
      return

    case "cancel_oauth":
      return

    case "start_oauth": {
      const platform = a.platform as Platform
      // Simulate browser round-trip
      await delay(1200)
      const profile = buildProfile(platform, null)
      insertAccount(profile, platform)
      void emit("oauth:complete", profile)
      void emit("accounts:changed")
      return profile
    }

    case "connect_with_token": {
      const platform = a.platform as Platform
      const token = String(a.token ?? "").trim()
      const scopeId = (a.scopeId as string | null | undefined) ?? null
      if (!token) throw "Token is required"
      if (token.toLowerCase() === "bad") {
        await delay(300)
        throw "provider: Invalid token"
      }
      await delay(450)
      const profile = buildProfile(platform, scopeId || null)
      insertAccount(profile, platform)
      void emit("accounts:changed")
      return profile
    }

    case "list_github_repos":
      await delay(350)
      return REPO_MOCKS

    case "set_monitored_repos": {
      const id = a.accountId as string
      const repos = (a.repos as string[]).slice(0, 30)
      const acc = state.accounts.find((x) => x.id === id)
      if (acc) {
        acc.monitored_repos = repos
        void emit("accounts:changed")
      }
      return
    }

    // ── deployments ─────────────────────────────────────────────────────────
    case "get_dashboard":
      return state.dashboard

    case "refresh_now":
      state.dashboard = {
        ...state.dashboard,
        last_refreshed_at: Date.now(),
      }
      void emit("dashboard:update", state.dashboard)
      return

    case "set_poll_interval":
      state.pollIntervalSecs = Number(a.secs) || state.pollIntervalSecs
      return

    case "get_poll_interval":
      return state.pollIntervalSecs

    case "open_external":
      // eslint-disable-next-line no-console
      console.info("[sandbox] open_external:", a.url)
      return

    // ── window ──────────────────────────────────────────────────────────────
    case "open_desktop":
    case "close_desktop":
    case "show_popover":
    case "hide_popover":
    case "toggle_popover":
      return

    case "quit_app":
      // eslint-disable-next-line no-console
      console.info("[sandbox] quit_app (no-op)")
      return

    case "get_autostart":
      return state.autostart

    case "set_autostart":
      state.autostart = !!a.enabled
      return

    case "has_seen_close_hint":
      return state.closeHintSeen

    case "mark_close_hint_seen":
      state.closeHintSeen = true
      return

    case "dev_reset":
      sandboxStore.resetAll()
      return

    // ── prefs ───────────────────────────────────────────────────────────────
    case "get_prefs":
      return state.prefs

    case "set_pref": {
      const key = a.key as keyof Prefs
      const value = a.value as Prefs[typeof key]
      state.prefs = { ...state.prefs, [key]: value } as Prefs
      void emit("prefs:changed", state.prefs)
      return state.prefs
    }

    case "set_window_theme":
      return
  }

  // eslint-disable-next-line no-console
  console.warn("[sandbox] unhandled command:", cmd, a)
  return
}

// ── helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function buildProfile(platform: Platform, scopeId: string | null): AccountProfile {
  const suffix = Math.random().toString(36).slice(2, 6)
  const id = `mock-${platform}-${suffix}`
  const displayName =
    platform === "vercel"
      ? scopeId
        ? "Acme Team"
        : `Vercel (${suffix})`
      : platform === "railway"
        ? `Railway Maya ${suffix}`
        : `octocat-${suffix}`
  return {
    id,
    platform,
    display_name: displayName,
    email: platform === "github" ? "octo@github.com" : "maya@example.com",
    avatar_url: null,
    scope_id: scopeId,
  }
}

function insertAccount(profile: AccountProfile, platform: Platform) {
  const record: AccountRecord = {
    id: profile.id,
    platform,
    display_name: profile.display_name,
    scope_id: profile.scope_id,
    enabled: true,
    created_at: Date.now(),
    health: "ok",
    monitored_repos: platform === "github" ? [] : null,
  }
  state.accounts = [...state.accounts, record]
}
