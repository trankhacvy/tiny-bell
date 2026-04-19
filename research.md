# Dev Radio — Deep Codebase Research

## 1. Project Purpose & Domain

**Dev Radio** is a lightweight, native-feeling desktop menu-bar application that monitors real-time build and deployment status across **Vercel** and **Railway** cloud deployment platforms. The tagline is *"Tune in to your deploys."*

**Primary use cases:**
- At-a-glance status via a tray icon (green = ready, yellow = building/queued, red = error, gray = offline)
- One-click popover dashboard showing recent deployments grouped by account/project
- Keyboard-driven navigation and shortcuts for power users
- Native desktop notifications on deployment completion or failure
- Configurable polling intervals and global hotkey activation

**Target platforms:** macOS, Windows, Linux

---

## 2. Project Structure

```
hanoi/
├── src/                                 # React TypeScript frontend
│   ├── app/
│   │   ├── desktop/                     # Desktop window (settings, onboarding)
│   │   │   ├── desktop-app.tsx
│   │   │   ├── views/
│   │   │   │   ├── onboarding-view.tsx
│   │   │   │   ├── settings-view.tsx
│   │   │   │   └── settings/            # Settings tabs (general, accounts, about)
│   │   │   └── components/
│   │   │       └── close-hint-dialog.tsx
│   │   └── popover/
│   │       └── popover-app.tsx          # Main dashboard / deployments list
│   ├── components/
│   │   ├── ui/                          # shadcn/ui primitives
│   │   ├── dr/                          # Custom components (badge, icon, menu, window)
│   │   ├── account/                     # Account auth UI
│   │   ├── popover/                     # Popover-specific components
│   │   ├── theme-provider.tsx
│   │   ├── external-link-guard.tsx
│   │   └── debug-panel.tsx
│   ├── hooks/
│   │   ├── use-dashboard.ts
│   │   └── use-scope.ts
│   ├── lib/
│   │   ├── accounts.ts                  # Types + accountsApi Tauri wrapper
│   │   ├── deployments.ts               # Types + deploymentsApi, windowApi wrappers
│   │   ├── tauri.ts                     # Typed invoke helper
│   │   ├── prefs.ts                     # Preferences API
│   │   ├── format.ts                    # Formatting utilities
│   │   └── utils.ts
│   ├── assets/
│   ├── main.tsx
│   └── index.css                        # Tailwind + CSS variables
│
├── src-tauri/                           # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── lib.rs                       # App setup, plugin registration, command handlers
│   │   ├── main.rs                      # Desktop entry point
│   │   ├── platform.rs                  # Platform-specific helpers (macOS dock visibility)
│   │   ├── adapters/                    # Abstraction over Vercel & Railway APIs
│   │   │   ├── mod.rs                   # Platform enum, domain models
│   │   │   ├── trait.rs                 # DeploymentMonitor trait & AdapterError
│   │   │   ├── registry.rs              # AdapterRegistry (one adapter per account)
│   │   │   ├── vercel/                  # Vercel REST API client
│   │   │   └── railway/                 # Railway GraphQL API client
│   │   ├── auth/                        # OAuth & token management
│   │   │   ├── oauth.rs                 # PKCE, loopback server, state validation
│   │   │   ├── pat.rs                   # PAT validation & profile fetching
│   │   │   ├── vercel.rs                # Vercel OAuth flow
│   │   │   ├── railway.rs               # Railway OAuth flow
│   │   │   └── token_provider.rs        # Token refresh logic
│   │   ├── commands/                    # Tauri invoke handlers
│   │   │   ├── accounts.rs              # OAuth, PAT, account CRUD
│   │   │   ├── deployments.rs           # Dashboard fetch, poll control
│   │   │   ├── window.rs                # Window control
│   │   │   ├── prefs.rs                 # Settings persistence
│   │   │   └── ux.rs                    # UX state (close hint)
│   │   ├── keychain.rs                  # OS keychain vault (unified)
│   │   ├── store.rs                     # Persisted account metadata (tauri-plugin-store)
│   │   ├── cache.rs                     # In-memory dashboard state + diff tracking
│   │   ├── poller.rs                    # Main polling loop (tokio-based)
│   │   ├── prefs.rs                     # User preferences
│   │   ├── window.rs                    # Window management
│   │   ├── tray.rs                      # System tray icon & menu
│   │   ├── notifications.rs             # Desktop notifications
│   │   ├── shortcut.rs                  # Global hotkey registration
│   │   └── redact.rs                    # Secret redaction for logs
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── docs/
│   ├── prd.md                           # Product requirements
│   ├── system-design.md                 # Design system & UI spec
│   └── connecting-accounts.md           # User guide
├── package.json
├── vite.config.ts
├── components.json                      # shadcn/ui config
└── .env.example
```

---

## 3. Tech Stack

### Frontend (React 19 + TypeScript)

| Tool | Version | Role |
|------|---------|------|
| React | 19.2.4 | UI framework |
| TypeScript | 5.9.3 | Type safety |
| Vite | 7.3.1 | Bundler |
| TailwindCSS | 4.2.1 | Styling |
| shadcn/ui | 4.3.0 | UI component library (Radix UI + Tailwind) |
| lucide-react | 1.8.0 | Icons |
| @tanstack/react-table | 8.21.3 | Table primitives |
| @dnd-kit | — | Drag-and-drop (account reordering) |
| next-themes | 0.4.6 | Light/dark/system theming |
| sonner | 2.0.7 | Toast notifications |
| zod | 4.3.6 | Schema validation |

### Backend (Rust + Tauri v2)

| Tool | Version | Role |
|------|---------|------|
| Tauri v2 | 2 | Desktop app framework / IPC |
| tokio | 1 | Async runtime |
| reqwest | 0.12 | HTTP client (rustls-tls + json) |
| serde / serde_json | 1 | JSON serialization |
| keyring | 3 | OS keychain (macOS/Win/Linux) |
| tauri-plugin-store | 2 | Persistent JSON settings |
| tauri-plugin-notification | 2 | Native desktop notifications |
| tauri-plugin-global-shortcut | 2 | Hotkey registration |
| tauri-plugin-autostart | 2 | Launch at login |
| tauri-plugin-log | 2 | Structured logging |
| tauri-plugin-opener | 2 | Open external URLs |
| sha2 + base64 | 0.10 / 0.22 | PKCE challenge hashing |
| rand | 0.8 | Cryptographic randomness (OAuth state) |
| tiny_http | 0.12 | Local loopback OAuth callback server |
| thiserror | 1 | Ergonomic error enums |
| chrono | 0.4 | Timestamps |
| uuid | 1 | Account ID generation |
| regex + once_cell | 1 | Log redaction patterns |

---

## 4. Architecture

### High-Level Design Pattern: Adapter Pattern

All platform-specific logic is isolated in adapters that implement a common `DeploymentMonitor` trait. This makes it straightforward to add new platforms without touching core poller logic.

```
┌─────────────────────────────────────────────────────────┐
│                   React Frontend (src/)                  │
│  - Popover: real-time deployment list                    │
│  - Desktop: onboarding & settings                        │
│  - Typed Tauri invoke wrappers (accountsApi, etc.)       │
└────────────────────┬────────────────────────────────────┘
                     │ Tauri invoke (IPC)
┌────────────────────▼────────────────────────────────────┐
│              Rust Backend (src-tauri/src/)               │
│                                                          │
│  Commands layer (Tauri handlers):                        │
│  - accounts.rs  → OAuth, PAT, account CRUD               │
│  - deployments.rs → fetch dashboard, refresh             │
│  - window.rs    → show/hide popover & desktop            │
│  - prefs.rs     → load/save settings                     │
│  - ux.rs        → UX state (close hints)                 │
│                                                          │
│  Polling engine (poller.rs):                             │
│  - Tokio-based interval loop (configurable 5–600s)       │
│  - Calls adapter.list_recent_deployments()               │
│  - Diffs old vs new state (cache.rs)                    │
│  - Emits DashboardState to frontend via Tauri events     │
│  - Fires notifications on state changes                  │
│  - Updates tray icon color                               │
│                                                          │
│  Adapter layer:                                          │
│  - DeploymentMonitor trait (async)                       │
│  - VercelAdapter (REST API)                              │
│  - RailwayAdapter (GraphQL API)                          │
│  - Registry manages one adapter per account              │
│                                                          │
│  Auth layer (auth/):                                     │
│  - OAuth: PKCE + loopback server (port 53123)           │
│  - PAT: token validation & profile fetching              │
│  - token_provider: refresh token logic                   │
│                                                          │
│  Persistence:                                            │
│  - keychain.rs: OS keychain vault (secrets only)         │
│  - store.rs: JSON file (account metadata, no tokens)    │
│  - prefs.rs: user settings (theme, interval, etc.)      │
│  - cache.rs: in-memory dashboard state                  │
│                                                          │
│  System integration:                                     │
│  - tray.rs: menu-bar icon + context menu                 │
│  - notifications.rs: desktop toasts                      │
│  - shortcut.rs: global hotkey                            │
│  - window.rs: popover positioning + lifecycle            │
│  - platform.rs: macOS dock visibility                    │
└─────────────────────────────────────────────────────────┘
```

### Data Flow: Polling → Diff → Notifications → UI Update

1. **Poller** spawns on app startup as a tokio task
2. On interval (default 30s), poller calls `AdapterRegistry::poll()`
3. Registry collects deployments from all enabled accounts' adapters (parallel `JoinSet`)
4. Poller compares old cache state vs new state → diff events
5. For each diff event (state changed):
   - Fires a native desktop notification
   - Emits `DashboardState` Tauri event to React
6. React `useDashboard()` hook listens, updates UI
7. Poller updates tray icon color based on aggregate health
8. User opens popover → `useDashboard()` reads from cache

---

## 5. Key Data Models & Types

### Rust Domain Models (`src-tauri/src/adapters/mod.rs`)

```rust
pub enum Platform { Vercel, Railway }

pub enum DeploymentState {
  Queued, Building, Ready, Error, Canceled, Unknown
}

pub struct AccountProfile {
  pub id: String,
  pub platform: Platform,
  pub display_name: String,
  pub email: Option<String>,
  pub avatar_url: Option<String>,
  pub scope_id: Option<String>,   // Vercel team ID or Railway scope
}

pub struct Project {
  pub id: String,
  pub account_id: String,
  pub platform: Platform,
  pub name: String,
  pub url: Option<String>,
  pub framework: Option<String>,
  pub latest_deployment: Option<Deployment>,
}

pub struct Deployment {
  pub id: String,
  pub project_id: String,
  pub service_id: Option<String>,      // Railway service ID
  pub service_name: Option<String>,
  pub state: DeploymentState,
  pub environment: String,             // "production", "preview", etc.
  pub url: Option<String>,
  pub inspector_url: Option<String>,   // Vercel function inspector
  pub branch: Option<String>,
  pub commit_sha: Option<String>,
  pub commit_message: Option<String>,
  pub author_name: Option<String>,
  pub author_avatar: Option<String>,
  pub created_at: i64,
  pub finished_at: Option<i64>,
  pub duration_ms: Option<u64>,
  pub progress: Option<u8>,            // 0–100 for in-progress
}
```

### TypeScript Frontend Types (`src/lib/`)

```typescript
type Platform = "vercel" | "railway"
type AccountHealth = "ok" | "needs_reauth" | "revoked"
type DeploymentState = "queued" | "building" | "ready" | "error" | "canceled" | "unknown"

interface AccountRecord extends AccountProfile {
  enabled: boolean
  created_at: number
  health: AccountHealth
}

interface DashboardState {
  projects: Project[]
  deployments: Deployment[]
  last_refreshed_at: number | null
  last_error: string | null
  offline: boolean
  polling: boolean
}
```

### Stored Secrets (`src-tauri/src/keychain.rs`)

```rust
pub enum StoredSecret {
  Pat { value: String },
  Oauth {
    access_token: String,
    refresh_token: String,
    expires_at_ms: i64,
  }
}
```

---

## 6. External Integrations & APIs

### Vercel

- **Auth:** OAuth (PKCE) at `https://vercel.com/oauth/authorize` + `https://vercel.com/oauth/token`, or PAT
- **API base:** `https://api.vercel.com`
- **Endpoints:**
  - `GET /v1/projects` — list projects (paginated)
  - `GET /v1/deployments` — list recent deployments (by project/env)
  - Supports `teamId` query param for team-scoped access
- **Format:** REST JSON

### Railway

- **Auth:** OAuth (PKCE) with custom redirect handler, or PAT
  - Workspace PATs return `null` for `me` query — handled specially
- **API base:** `https://backboard.railway.com/graphql/v2`
- **Queries:**
  - `{ me { id email name avatar } }` — user profile
  - Projects + services + deployments with pagination
- **Format:** GraphQL JSON

### System Services

- **OS Keychain:** `keyring` crate → macOS Keychain, Windows Credential Manager, Linux Secret Service
- **Native notifications:** Tauri plugin → UNUserNotificationCenter / Toast / libnotify
- **Global hotkey:** Tauri plugin → native OS API per platform
- **Autostart:** Tauri plugin → `LaunchAgent` / Registry / `.desktop`

---

## 7. Authentication & Authorization

### Two Auth Flows

**1. OAuth 2.0 with PKCE (browser-based)**

1. User clicks "Connect with Vercel/Railway"
2. App spawns HTTP loopback server on port 53123–53125
3. Generates PKCE pair (verifier + SHA256 challenge)
4. Opens browser to provider's auth endpoint with `code_challenge`, `state`, `redirect_uri=http://127.0.0.1:{port}/callback`
5. User authorizes in browser
6. Loopback server receives callback; validates state (constant-time comparison for CSRF)
7. App exchanges code for `access_token` + optional `refresh_token`
8. Tokens stored in OS keychain; loopback server closes; browser auto-closes after 800ms

**2. PAT (Personal Access Token) fallback**

1. User pastes token from platform dashboard
2. App validates by calling platform's `/me` endpoint
3. If valid, stored in keychain and account created

### Token Lifecycle

- **Storage:** OS keychain only — never disk, never frontend memory
- **Refresh:** OAuth tokens refreshed via `refresh_token` before expiry; PATs never refresh
- **Validation:** On account sync, `validate_token()` calls `/me`; 401/403 → marks `NeedsReauth` or `Revoked`

### Security Measures

- **CSRF:** OAuth state token validated with constant-time comparison (`constant_time_eq`)
- **Log redaction:** `redact.rs` filters tokens/secrets from all log output before writing
- **CSP:** `tauri.conf.json` restricts `connect-src` to Vercel & Railway APIs only
- **Keychain encryption:** Delegated to OS

---

## 8. UI Structure & Components

### Two-Window Design

**Desktop Window** (560×680, resizable)
- Onboarding view: account connection UI, platform tabs, OAuth + PAT forms
- Settings view: Accounts, General, About tabs
- Opens on first run or via Settings menu

**Popover Window** (380×560, frameless, always-on-top)
- Activates after ≥1 account configured
- Anchored to tray icon; hides on focus loss
- Main dashboard showing deployments grouped by account
- Keyboard-driven (↑↓ navigate, Enter open, Esc close)

### Component Organization

- **`ui/`** — shadcn/ui primitives: button, card, tabs, dialog, input, badge, dropdown-menu, select, tooltip, avatar, checkbox, toggle, separator, table, sheet, skeleton
- **`dr/`** — custom design-system components: badge, button, icon, kbd (keyboard shortcut), menu, provider-mark, provider-chip, tabs, window, initials-avatar
- **`popover/`** — PopoverApp, PopoverHeader, PopoverFooter, DeployRow, state screens (loading, empty, no-accounts, offline)
- **`account/`** — AddAccountDialog, AddAccountForm (platform tabs, mode toggle, error handling)
- **Shared** — ThemeProvider, ExternalLinkGuard, DebugPanel (dev mode)

### State Management

- **React hooks:** useState, useEffect, useCallback, useMemo, useRef — no external state library
- **Tauri events:** `listen()` for `accounts:changed`, `popover:show`, `desktop:route`, dashboard updates
- **`useDashboard()`** — listens for dashboard events, caches state locally
- **`useScope()`** — account filter state (all vs. single account view)

---

## 9. Business Logic & Workflows

### Initial Setup Flow

1. App starts → checks store for accounts
2. If empty → show Desktop (Onboarding)
3. User selects platform + auth mode → OAuth or PAT flow
4. Profile stored in JSON store; token stored in keychain
5. Adapters hydrated; poller started

### Continuous Polling Loop (`poller.rs`)

Every N seconds (configurable 5–600s, default 30s):
1. `registry.poll()` calls all enabled adapters in parallel (`JoinSet`)
2. Merges new projects + deployments into cache
3. Diffs against previous state → per-deployment diff events
4. For each diff: fire native notification + emit Tauri event
5. Compute aggregate health → update tray icon color
6. Handle errors: mark offline, surface `last_error` to UI, retry on next tick

### Account Management

- **List:** Fetch from JSON store (no secrets exposed to frontend)
- **Enable/Disable:** Toggle `enabled` flag; re-hydrate adapters
- **Validate:** Call `validate_token()` → `/me` endpoint check
- **Delete:** Remove from store + keychain

### Settings Persistence

- **Theme** → OS window theme + CSS variables
- **Refresh interval** → poller interval change (live, no restart)
- **Global hotkey** → re-register with OS
- **Launch at login** → Tauri autostart plugin
- **Show in dock** (macOS) → `ActivationPolicy` change

### Tray Icon State Machine

| Condition | Color |
|-----------|-------|
| Any error in last 30 min | Red |
| Any building or queued | Yellow |
| All ready | Green |
| No accounts / offline > 60s | Gray |

---

## 10. Configuration & Environment

### Environment Variables (`.env.example`)

```bash
VERCEL_CLIENT_ID=...
VERCEL_CLIENT_SECRET=...
# Without these, OAuth is disabled; PAT flow available as fallback
```

### Preferences (stored in `dev-radio.store.json`)

```rust
pub struct Prefs {
  pub theme: String,                   // "system" | "light" | "dark"
  pub refresh_interval_ms: u64,        // default 30000, min 5000
  pub hide_to_menubar_shown: bool,     // UX hint one-shot flag
  pub start_at_login: bool,
  pub global_shortcut: String,         // default "Alt+Command+D" / "Ctrl+Shift+D"
  pub show_in_dock: bool,              // macOS only
}
```

### Account Store Schema

```json
{
  "accounts": [
    {
      "id": "uuid",
      "platform": "vercel",
      "display_name": "...",
      "scope_id": "team-id or null",
      "enabled": true,
      "created_at": 1713607200000,
      "health": "ok"
    }
  ]
}
```

Secrets are stored separately in the OS keychain under service name `dev-radio:vault`, never in the JSON store.

### Tauri Config (`tauri.conf.json`)

- Two windows declared: `desktop` (visible, resizable) and `popover` (frameless, always-on-top)
- CSP restricts `connect-src` to Vercel/Railway API origins
- Bundle targets: DMG (macOS), MSI (Windows), AppImage + .deb (Linux)

---

## 11. Build & Deployment

### Development

```bash
pnpm install
pnpm tauri dev           # Dev server + Tauri window (hot reload)
pnpm typecheck           # TypeScript check
cd src-tauri && cargo test --lib
```

### Production Build

```bash
pnpm build               # Frontend: Vite → dist/
pnpm tauri build         # Tauri bundles → dist-tauri/
```

### Release Profile (`Cargo.toml`)

```toml
[profile.release]
codegen-units = 1   # Single-unit LLVM optimization
lto = true          # Link-time optimization
opt-level = "s"     # Size optimization
panic = "abort"
strip = true
```

---

## 12. Unique Patterns & Specificities

### PKCE OAuth Without a Backend

Dev Radio is a single-user desktop app; no server-side session store is needed. A `tiny_http` loopback server on a random port handles the OAuth callback entirely locally. The PKCE verifier is generated fresh each flow.

### Diff-Driven Notifications

`cache.rs` tracks previous + current deployment states. Notifications and Tauri events only fire on state transitions — not on every poll — preventing notification spam during frequent refreshes.

### Log Redaction via Regex

`redact.rs` applies regex patterns (`token=...`, `bearer ...`, etc.) before any log write (stdout, file, or webview console). This protects against token leakage in debug logs.

### Unified Keychain Vault

All secrets (Vercel PAT, Railway PAT, Vercel OAuth, Railway OAuth) are stored under a single keychain service `dev-radio:vault` as JSON-serialized `StoredSecret` enums. This simplifies management while keeping everything in OS-encrypted storage.

### Projects vs. Deployments Poll Cadence

Projects are re-fetched every ~5 minutes (not every poll cycle) to reduce API quota usage. Deployments are fetched on every poll tick.

### Dual Window Lifecycle

- **Popover** is always present in memory after first account setup; hidden/shown via tray click or global hotkey. It positions itself relative to the tray icon on each show.
- **Desktop** is created on demand (settings/onboarding) and can be hidden-to-tray with a one-shot hint dialog.

### Constant-Time CSRF Protection

OAuth state tokens are validated using `constant_time_eq()` to prevent timing oracle attacks, which is unusually thorough for a local desktop app.

### Railway GraphQL Quirks

- Workspace PATs return `null` for `me { id email name }` — the Railway adapter handles this by treating a null-profile PAT as a workspace-level token and using a fallback display name.
- All Railway API calls go through a single GraphQL endpoint; the client in `railway/client.rs` composes typed query strings.

### Platform-Specific macOS Behavior

`platform.rs` handles ActivationPolicy changes (show/hide dock icon), which requires a special macOS API. This is gated with `#[cfg(target_os = "macos")]`.

### Health Enum for Smart Re-Auth UX

Accounts carry a `health` field (`Ok`, `NeedsReauth`, `Revoked`) updated by token validation. The UI surfaces contextual banners ("Re-connect your Vercel account") without exposing token details.

---

## 13. Key Files Quick Reference

| File | What it does |
|------|-------------|
| `src-tauri/src/poller.rs` | Core polling loop — orchestrates everything |
| `src-tauri/src/adapters/trait.rs` | `DeploymentMonitor` trait definition |
| `src-tauri/src/adapters/registry.rs` | Manages all active adapters per account |
| `src-tauri/src/adapters/vercel/mod.rs` | Vercel REST API client + adapter impl |
| `src-tauri/src/adapters/railway/client.rs` | Railway GraphQL queries |
| `src-tauri/src/auth/oauth.rs` | PKCE flow + loopback server |
| `src-tauri/src/cache.rs` | In-memory state + diff logic |
| `src-tauri/src/keychain.rs` | Unified OS keychain vault |
| `src-tauri/src/tray.rs` | System tray icon + color state machine |
| `src-tauri/src/redact.rs` | Log secret redaction |
| `src/app/popover/popover-app.tsx` | Main popover UI root |
| `src/app/desktop/desktop-app.tsx` | Desktop window root |
| `src/hooks/use-dashboard.ts` | Listens to dashboard Tauri events |
| `src/lib/accounts.ts` | TypeScript types + accountsApi Tauri wrapper |
| `src/lib/deployments.ts` | TypeScript types + deploymentsApi wrapper |
