# Dev Radio — Codebase Research Report

## 1. Executive Summary

**Dev Radio** is a lightweight desktop menu-bar application that monitors real-time build and deployment status across Vercel and Railway. Built with **Tauri v2** (Rust backend) and **React 19** (TypeScript frontend), it lives in the system tray and provides a popover dashboard for glanceable deployment status, multi-account management, and desktop notifications.

The app follows an event-driven architecture where the Rust backend polls deployment APIs, caches results, and pushes updates to the React frontend via Tauri's event system. Secrets are stored in the OS keychain, and the UI uses a custom design system built on shadcn/ui with OKLch color space.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript ~5.9, Vite 7.3 |
| UI Components | shadcn/ui (Radix primitives), TailwindCSS v4 |
| Backend | Rust (2024 edition), Tauri v2 |
| HTTP | reqwest 0.12 (rustls-tls) |
| Secrets | OS Keychain via `keyring` crate |
| Persistence | tauri-plugin-store (JSON file) |
| Auth | OAuth 2.0 PKCE + PAT |
| Async Runtime | Tokio (full features) |
| CI/CD | GitHub Actions (macOS matrix builds) |

---

## 3. Directory Structure

```
tripoli/
├── src/                          # React frontend
│   ├── main.tsx                  # Entry: routes to Desktop or Popover app
│   ├── index.css                 # Global styles, Tailwind theme (OKLch)
│   ├── app/
│   │   ├── desktop/              # Settings & onboarding windows
│   │   │   ├── desktop-app.tsx
│   │   │   ├── views/
│   │   │   │   ├── onboarding-view.tsx
│   │   │   │   ├── settings-view.tsx
│   │   │   │   └── settings/
│   │   │   │       ├── accounts-tab.tsx
│   │   │   │       ├── general-tab.tsx
│   │   │   │       └── about-tab.tsx
│   │   │   └── components/
│   │   │       └── close-hint-dialog.tsx
│   │   └── popover/
│   │       └── popover-app.tsx   # Main menubar popover UI
│   ├── components/
│   │   ├── theme-provider.tsx
│   │   ├── external-link-guard.tsx
│   │   ├── debug-panel.tsx       # Dev-only diagnostic overlay
│   │   ├── account/              # Auth forms and dialogs
│   │   ├── popover/              # Deploy rows, filters, states
│   │   ├── dr/                   # Custom design system ("dr" prefix)
│   │   └── ui/                   # shadcn/ui base components
│   ├── hooks/
│   │   ├── use-dashboard.ts      # Polling + event-driven state
│   │   ├── use-theme.ts          # Theme sync with Tauri prefs
│   │   ├── use-scope.ts          # Account scope filtering
│   │   └── use-mobile.ts         # Responsive detection
│   └── lib/
│       ├── tauri.ts              # IPC wrapper with debug tracking
│       ├── accounts.ts           # Account CRUD operations
│       ├── deployments.ts        # Dashboard + window APIs
│       ├── prefs.ts              # Preferences API
│       ├── debug-events.ts       # Debug event system
│       ├── format.ts             # Date/time formatting
│       └── utils.ts              # cn() utility
├── src-tauri/                    # Rust backend
│   ├── tauri.conf.json           # App config, windows, CSP
│   ├── Cargo.toml                # Dependencies
│   ├── build.rs                  # Compile-time env vars (OAuth creds)
│   ├── capabilities/default.json # Tauri permissions
│   ├── icons/                    # Tray + app icons
│   └── src/
│       ├── lib.rs                # Plugin setup, command registration
│       ├── main.rs               # Windows subsystem entry
│       ├── cache.rs              # Dashboard state caching + diff
│       ├── keychain.rs           # OS keychain vault (bulk JSON)
│       ├── store.rs              # JSON file persistence
│       ├── poller.rs             # Background polling loop
│       ├── prefs.rs              # User preferences
│       ├── notifications.rs      # Desktop notification dispatch
│       ├── redact.rs             # Log redaction (tokens, secrets)
│       ├── shortcut.rs           # Global shortcut registration
│       ├── platform.rs           # macOS dock visibility
│       ├── tray.rs               # System tray menu + icon
│       ├── window.rs             # Window management
│       ├── auth/
│       │   ├── mod.rs            # AuthError types
│       │   ├── oauth.rs          # PKCE flow + loopback server
│       │   ├── pat.rs            # PAT validation
│       │   ├── token_provider.rs # Token refresh logic
│       │   ├── vercel.rs         # Vercel OAuth specifics
│       │   └── railway.rs        # Railway OAuth + refresh tokens
│       ├── adapters/
│       │   ├── mod.rs            # Domain types (Platform, Deployment, etc.)
│       │   ├── trait.rs          # DeploymentMonitor trait
│       │   ├── registry.rs       # Adapter lifecycle management
│       │   ├── vercel/           # Vercel REST API adapter
│       │   │   ├── mod.rs, types.rs, mapper.rs
│       │   └── railway/          # Railway GraphQL adapter
│       │       ├── mod.rs, client.rs, types.rs, mapper.rs
│       └── commands/
│           ├── accounts.rs       # Account CRUD commands
│           ├── deployments.rs    # Dashboard fetch/refresh
│           ├── window.rs         # Window open/close/toggle
│           ├── prefs.rs          # Preference get/set
│           └── ux.rs             # UX state (close hints)
├── docs/
│   ├── prd.md                    # Product requirements (755 lines)
│   ├── system-design.md          # Design system specification
│   └── connecting-accounts.md    # User-facing auth guide
├── .github/workflows/
│   ├── ci.yml                    # Test pipeline (typecheck + cargo test)
│   └── release.yml               # Cross-platform binary builds
└── plan.md                       # Railway OAuth implementation plan
```

---

## 4. Architecture Overview

### 4.1 Two-Window Model

The app runs two distinct Tauri windows:

1. **Popover Window** (380x600px) — The main UI. Appears near the tray icon, always-on-top, no window decorations. Shows the deployment feed with account filtering, project filtering, and keyboard navigation.

2. **Desktop Window** (560x680px) — Secondary window for onboarding and settings. Contains tabbed interface for Accounts, General preferences, and About.

The entry point (`main.tsx`) reads the Tauri window label at startup and dynamically loads either `PopoverApp` or `DesktopApp`.

### 4.2 Event-Driven Data Flow

```
[Polling Loop]  ──poll──>  [Provider APIs]
      │                          │
      │<────── responses ────────┘
      │
      ├──> Cache (diff detection)
      ├──> Tray icon update (health color)
      ├──> Desktop notifications (state changes)
      └──> Event: "dashboard:update" ──> [React Frontend]
```

The backend pushes state to the frontend rather than the frontend polling. Key Tauri events:

| Event | Direction | Purpose |
|-------|-----------|---------|
| `dashboard:update` | Backend → Frontend | New deployment data |
| `accounts:changed` | Backend → Frontend | Account list modified |
| `prefs:changed` | Backend → Frontend | Preferences updated |
| `oauth:complete` | Backend → Frontend | OAuth flow finished |
| `desktop:route` | Backend → Frontend | Navigate desktop window |
| `desktop:close-hint` | Backend → Frontend | Show close hint dialog |

### 4.3 State Management

There is **no external state management library** (no Redux, Zustand, etc.). The app uses:

- **React `useState`** for all local UI state
- **Tauri event listeners** for backend-driven state updates
- **`sessionStorage`** for scope persistence (survives window hide/show)
- **`useMemo`** for derived data (filtered deployments, project maps)
- **Custom hooks** encapsulating data+events: `useDashboard()`, `useTheme()`, `useScope()`

---

## 5. Backend Deep Dive

### 5.1 Adapter Pattern

The core abstraction is the `DeploymentMonitor` trait:

```rust
pub trait DeploymentMonitor: Send + Sync {
    fn platform(&self) -> Platform;
    fn account_id(&self) -> &str;
    async fn list_projects(&self) -> Result<Vec<Project>, AdapterError>;
    async fn list_recent_deployments(&self, project_ids: Option<&[String]>, limit: usize)
        -> Result<Vec<Deployment>, AdapterError>;
}
```

Two implementations exist:

- **Vercel Adapter** — REST API client hitting `/v9/projects` and `/v6/deployments`. Handles team accounts via `teamId` query parameter.
- **Railway Adapter** — GraphQL client querying `Projects` and `BatchDeployments`. Supports workspace filtering via `scope_id`.

The **AdapterRegistry** manages adapter lifecycle: creating adapters on hydration, fetching fresh tokens per poll, and cleaning up on account removal. It uses `Arc<RwLock<HashMap>>` for thread-safe concurrent access.

### 5.2 Polling Engine (`poller.rs`)

- Runs as a background Tokio task with configurable interval (default 15s, range 5-600s)
- Uses a `Semaphore(4)` to limit concurrent API calls
- Per-poll cycle:
  1. Load accounts, hydrate adapters with fresh tokens
  2. Concurrently fetch projects (cached 5 minutes) and deployments (100 limit) per adapter
  3. Handle rate-limiting with per-account cooldowns
  4. Diff against previous cached state
  5. Fire notifications for deployment state changes
  6. Update tray icon color based on aggregate health
  7. Emit `dashboard:update` event to frontend

### 5.3 Tray Icon Health Colors

The tray icon color reflects the worst aggregate status:

| Color | Meaning |
|-------|---------|
| Gray | No projects or initial setup |
| Green | All deployments ready |
| Yellow | Building or queued deployments |
| Red | Error deployment within last 30 minutes |

Priority: Red > Yellow > Green > Gray.

### 5.4 Keychain Vault (`keychain.rs`)

Uses a **unified vault** approach — a single OS keychain entry (`service: "dev-radio", account: "vault"`) stores a serialized JSON `HashMap<account_id, StoredSecret>`.

```rust
enum StoredSecret {
    Pat { value: String },
    Oauth {
        access_token: String,
        refresh_token: String,
        expires_at_ms: i64,
    },
}
```

Features:
- Lazy-loaded on first access via `once_cell`
- Persisted back to OS keychain on every mutation
- Legacy migration: old per-account entries (`"vercel:{id}"`, `"railway:{id}"`) automatically migrated to the bulk vault

### 5.5 Token Refresh (`token_provider.rs`)

- **Vercel**: Tokens don't expire (PAT-like), no refresh needed
- **Railway**: OAuth tokens expire (1 hour). The `token_provider` checks expiry (with 60s skew buffer) before each poll. If expired, it calls Railway's token endpoint with the refresh token, updates the keychain vault, and returns the fresh access token.

### 5.6 Persistence (`store.rs`)

Uses `tauri-plugin-store` writing to `dev-radio.store.json`:

```json
{
  "accounts": [{ "id", "platform", "display_name", "scope_id", "enabled", "created_at", "health" }],
  "prefs": { "theme", "refresh_interval_ms", "start_at_login", "global_shortcut", "show_in_dock" },
  "ui": { "close_hint_seen": false }
}
```

Secrets are never stored in this file — only in the OS keychain.

### 5.7 Log Redaction (`redact.rs`)

All log output passes through regex-based redaction that masks:
- `token`, `access_token`, `refresh_token`, `authorization`
- `code`, `client_secret`, `code_verifier`, `password`

Format: `key=REDACTED` or `"key":"REDACTED"`.

---

## 6. Authentication Flows

### 6.1 OAuth 2.0 with PKCE

Both Vercel and Railway use PKCE (Proof Key for Code Exchange):

1. Generate random 32-byte `verifier` + SHA-256 `challenge`
2. Generate random `state` parameter
3. Spawn loopback HTTP server on ports 53123-53125
4. Open system browser to provider's auth URL with `client_id`, `redirect_uri`, `state`, `code_challenge`
5. User authorizes in browser
6. Provider redirects to loopback with `code` + `state`
7. Server validates state (constant-time comparison), responds with HTML
8. Exchange code for tokens at provider's token endpoint
9. Fetch user profile, create account record, store tokens in keychain
10. Emit `oauth:complete` event to frontend

**Vercel-specific**: Uses integration slug in auth URL, supports team scope selection.
**Railway-specific**: Requests `offline_access` scope for refresh tokens, includes PKCE challenge.

### 6.2 Personal Access Token (PAT)

Simpler flow:
1. User pastes token (+ optional team/scope ID for Vercel)
2. Backend validates by calling provider's user/profile API
3. Creates account record, stores token in keychain
4. Returns profile to frontend

---

## 7. Frontend Deep Dive

### 7.1 Component Hierarchy

```
ThemeProvider
└── ExternalLinkGuard
    └── PopoverApp | DesktopApp
        ├── PopoverApp
        │   ├── PopoverHeader (account selector, project filter)
        │   ├── DeployRow[] (deployment list with keyboard nav)
        │   ├── PopoverFooter (refresh timestamp)
        │   └── States: Empty, NoAccounts, Loading, Offline, RateLimit
        └── DesktopApp
            ├── OnboardingView (Welcome → Connect → Success)
            └── SettingsView
                ├── AccountsTab
                ├── GeneralTab (theme, shortcuts, polling)
                └── AboutTab
```

### 7.2 Custom Design System ("dr" prefix)

A set of branded components under `components/dr/`:

| Component | Purpose |
|-----------|---------|
| `Window` | Chrome frame with title bar |
| `Button` | Multi-variant button (primary, ghost, destructive, etc.) |
| `Icon` | SVG icon system with size variants |
| `Input` | Form input with label/error states |
| `Menu` | Dropdown menu with items, separators |
| `Tabs` | Tab navigation component |
| `StatusGlyph` | Deployment status icons (animated for building) |
| `ProviderMark` | Vercel/Railway logos |
| `ProviderChip` | Provider badge with name |
| `InitialsAvatar` | User avatar fallback |
| `Badge` | Status badge component |
| `Kbd` | Keyboard shortcut display |

### 7.3 Theme System

- Colors defined in **OKLch** color space via CSS custom properties
- Supports `system`, `light`, `dark` modes via `data-theme` attribute on `<html>`
- Platform-specific accent colors (Vercel blue vs Railway purple)
- Synced with Tauri backend preferences

### 7.4 Keyboard Navigation

The popover is fully keyboard-navigable:

| Shortcut | Action |
|----------|--------|
| `↑/↓` | Navigate deployment list |
| `Enter` | Open selected deployment |
| `Escape` | Hide popover |
| `Cmd+R` | Force refresh |
| `Cmd+,` | Open settings |
| `Cmd+Q` | Quit app |
| `Cmd+N` | Open onboarding |
| `Cmd+0-9` | Switch account scope |

### 7.5 Filtering Pipeline

```
accounts → scopedAccountIds (by selected scope)
    → scopedProjects = projects.filter(p => scopedAccountIds.has(p.account_id))
        → filteredDeployments = deployments.filter(d =>
              isInScopedProjects(d.project_id) &&
              (selectedProjectIds.size === 0 || selectedProjectIds.has(d.project_id)))
```

### 7.6 Tauri IPC Layer (`lib/tauri.ts`)

All Tauri `invoke()` calls are wrapped with `trackedInvoke()` which:
- Logs the command name and arguments to the debug panel
- Records timing (duration in ms)
- Captures success/failure results
- Provides a consistent error handling pattern

Similarly, `trackedEmit()` wraps event emissions with debug tracking.

### 7.7 Debug Panel

A comprehensive dev-only diagnostic overlay (toggled with `Cmd+D`):

- **Overview tab**: App info, window state, theme, file paths
- **Runtime tab**: Recent `invoke()` calls with timing, runtime events, plugin logs, external links
- **System tab**: File paths, webview identity
- **Errors tab**: Uncaught exceptions and unhandled promise rejections

Features: dockable (left/right/bottom), session-persistent, console capture, snapshot export.

---

## 8. Tauri Commands (Full API Surface)

### Account Management
- `start_oauth(platform)` → `AccountProfile`
- `connect_with_token(platform, token, scope_id?)` → `AccountProfile`
- `cancel_oauth()` → void
- `list_accounts()` → `AccountRecord[]`
- `delete_account(id)` → void
- `set_account_enabled(id, enabled)` → `AccountRecord | null`
- `rename_account(id, display_name)` → `AccountRecord | null`
- `validate_token(account_id)` → `AccountHealth`
- `hydrate_adapters()` → void

### Dashboard
- `get_dashboard()` → `DashboardState`
- `refresh_now()` → void
- `set_poll_interval(secs)` → void
- `get_poll_interval()` → number
- `open_external(url)` → void

### Window Management
- `open_desktop(view)` → void
- `close_desktop()` → void
- `toggle_popover()` → void
- `show_popover()` / `hide_popover()` → void
- `quit_app()` → void
- `get_autostart()` / `set_autostart(enabled)` → boolean / void

### Preferences
- `get_prefs()` → `Prefs`
- `set_pref(key, value)` → void
- `set_window_theme(theme)` → void

### UX State
- `has_seen_close_hint()` → boolean
- `mark_close_hint_seen()` → void

---

## 9. Domain Types

### Core Deployment Model

```typescript
Deployment {
  id: string
  project_id: string
  service_id?: string        // Railway only
  service_name?: string      // Railway only
  state: DeploymentState     // queued | building | ready | error | canceled | unknown
  environment: string
  url?: string
  inspector_url?: string
  branch?: string
  commit_sha?: string
  commit_message?: string
  author_name?: string
  author_avatar?: string
  created_at: number         // epoch ms
  finished_at?: number
  duration_ms?: number
  progress?: number          // 0-100
}

Project {
  id: string
  account_id: string
  platform: Platform         // vercel | railway
  name: string
  url?: string
  framework?: string
  latest_deployment?: Deployment
}

DashboardState {
  projects: Project[]
  deployments: Deployment[]
  last_refreshed_at: number | null
  last_error: string | null
  offline: boolean
  polling: boolean
}
```

### Account Model

```typescript
AccountRecord {
  id: string                 // UUID
  platform: Platform
  display_name: string
  scope_id?: string          // Vercel team ID or Railway workspace
  enabled: boolean
  created_at: number
  health: AccountHealth      // ok | needs_reauth | revoked
}
```

---

## 10. Security Model

| Concern | Approach |
|---------|----------|
| Token storage | OS keychain only (macOS Keychain, Windows Credential Manager, Linux Secret Service) |
| OAuth | PKCE with SHA-256, constant-time state comparison |
| Log safety | Regex-based redaction of tokens, secrets, auth codes |
| Network | HTTPS only via rustls-tls |
| OAuth callback | Loopback server (127.0.0.1 only, ports 53123-53125) |
| CSP | Restricts to self, ipc, tauri, specific image CDNs |
| Build secrets | OAuth client IDs/secrets injected at compile time via `build.rs` |
| External links | Intercepted by `ExternalLinkGuard`, opened via Tauri opener plugin |

---

## 11. Build & Release

### CI Pipeline (`.github/workflows/ci.yml`)
- Triggers: push to main, all PRs
- Runs on `macos-latest`
- Steps: checkout → Rust stable → pnpm install → `pnpm typecheck` → `cargo test --lib`

### Release Pipeline (`.github/workflows/release.yml`)
- Triggers: `workflow_dispatch` or `v*` tags
- Matrix: macOS aarch64 (Apple Silicon) + x86_64 (Intel)
- Uses `tauri-action` to build native binaries
- Creates draft GitHub release with auto-generated notes
- Uses Bun instead of pnpm for faster installs

### Build-Time Environment

OAuth credentials are loaded at **compile time** via `build.rs` reading `.env.local` or `.env`:
- `VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET`, `VERCEL_INTEGRATION_SLUG`
- `RAILWAY_CLIENT_ID`

Missing credentials emit warnings but allow builds (PAT auth still works).

---

## 12. Preferences & Configuration

| Preference | Default | Description |
|------------|---------|-------------|
| `theme` | `"system"` | Light/dark/system theme |
| `refresh_interval_ms` | 30000 | Polling interval (min 5s, max 600s) |
| `start_at_login` | false | Launch at login (macOS LaunchAgent) |
| `global_shortcut` | `"Alt+Cmd+D"` | Toggle popover shortcut |
| `show_in_dock` | false | Show in macOS dock |
| `hide_to_menubar_shown` | false | Close hint dialog seen |

---

## 13. Extensibility

The PRD documents a clear path to add new platforms (e.g., Netlify):

1. Create a new adapter module implementing `DeploymentMonitor`
2. Add the platform variant to the `Platform` enum
3. Add OAuth/PAT handlers in `auth/`
4. Register the adapter in `AdapterRegistry`
5. Add UI elements (provider mark, chip, icons)
6. Update CSP for new image domains

The trait-based adapter pattern makes this a well-scoped task without touching the polling, caching, or notification systems.

---

## 14. Notable Design Decisions

1. **No external state management** — React hooks + Tauri events are sufficient for the app's scope. No Redux/Zustand overhead.

2. **Unified keychain vault** — Instead of per-account keychain entries, all secrets live in a single JSON blob in one keychain entry. Reduces OS keychain access and simplifies migration.

3. **Backend-driven polling** — The Rust poller owns the polling loop and pushes state via events. The frontend never directly calls provider APIs or manages polling timers.

4. **OKLch color space** — Uses perceptually uniform colors for more consistent light/dark theme transitions.

5. **Build-time secret injection** — OAuth client credentials are baked in at compile time, not loaded at runtime. Prevents accidental exposure via config files.

6. **Compile-time redaction patterns** — Log redaction is applied at the tracing/log layer, ensuring no sensitive data reaches log files even in verbose mode.

7. **Project cache with TTL** — Projects are cached for 5 minutes per account to reduce API calls, while deployments are fetched fresh each poll.

8. **Rate limit cooldowns** — Per-account rate limit tracking with reuse of previous data during cooldown, rather than failing the entire dashboard.

---

## 15. Current State & In-Flight Work

- The `plan.md` file documents a completed implementation of Railway OAuth with PKCE and token refresh support.
- The app supports both Vercel and Railway with OAuth and PAT authentication.
- CI runs TypeScript typechecking and Rust unit tests.
- Release builds target macOS only (aarch64 + x86_64).
- The product is at version 0.0.1, indicating early development stage.
- North Star metric from PRD: **≤20 seconds time-to-awareness** for deployment state changes.
- Performance targets: <0.5% idle CPU, <12 MB bundle size, 99.5% crash-free rate.
