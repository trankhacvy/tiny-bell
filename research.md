# Dev Radio — Codebase Research Report

A deep-dive into the `dev-radio` repository: what it is, how it's built, and the specificities worth knowing before touching it.

---

## 1. What is Dev Radio?

**Dev Radio** is a lightweight, cross-platform **desktop tray/menu-bar app** that gives developers real-time visibility into cloud build and deployment status across multiple providers. Tagline: *"Tune in to your deploys."*

- **Core use case**: glance at a color-coded tray icon to know the health of all your Vercel/Railway deploys without opening a browser.
- **UI surfaces**: a small popover window attached to the tray, plus a standalone desktop window for onboarding and settings.
- **Current platforms supported**: Vercel (REST + OAuth/PAT) and Railway (GraphQL + PAT). Architecture is explicitly designed to plug in more (Netlify, Render, GitHub Actions, etc.).
- **Recent direction**: commit `f65c7c8` "Flat deployment feed + Linear/Raycast UI redesign" — the UI was recently overhauled toward a flatter, minimal, keyboard-centric aesthetic inspired by Linear and Raycast.

---

## 2. Tech Stack

### Frontend (`src/`)
- **React 19 + TypeScript + Vite** (dev server on port 1420)
- **TailwindCSS v4** via `@tailwindcss/vite`
- **shadcn/ui** (Radix primitives) + a custom `components/dr/` layer for Dev Radio's own design language
- **Lucide-react** icons, **Sonner** for toasts, **Recharts** (declared but light use), **@dnd-kit** (declared)
- No global state library — uses React hooks + Tauri event subscriptions as the source of truth

### Backend (`src-tauri/`)
- **Tauri v2** (Rust)
- **Tokio** async runtime, **Reqwest** HTTP, **async-trait**, **Serde**
- Plugins: `notification`, `autostart`, `global-shortcut`, `log`, `opener`, `store`
- **`keyring`** crate for OS keychain (apple-native / windows-native / sync-secret-service)

### Tooling
- **pnpm** (package manager), **bun** is referenced in `tauri.conf.json` beforeDev/Build hooks
- **GitHub Actions CI** on macOS: `pnpm typecheck` + `cargo test --lib`

---

## 3. Repository Layout

Single package (not a monorepo). Two sibling codebases share the root:

```
chicago/
├── src/                  # React frontend
│   ├── main.tsx          # Bootstrap; branches on window.label (popover vs desktop)
│   ├── app/
│   │   ├── popover/      # Tray popover UI
│   │   └── desktop/      # Onboarding + settings window
│   ├── components/
│   │   ├── ui/           # shadcn primitives
│   │   ├── dr/           # Custom Dev Radio design-language components
│   │   ├── popover/      # Popover-specific pieces (header, footer, deploy-row, states)
│   │   └── account/      # Account mgmt UI
│   ├── hooks/            # use-dashboard, use-scope, use-theme, use-mobile
│   └── lib/              # tauri command wrappers, formatters, prefs
├── src-tauri/            # Rust backend
│   ├── src/
│   │   ├── lib.rs        # App init, plugins, invoke_handler registry
│   │   ├── main.rs       # Thin entry
│   │   ├── adapters/     # DeploymentMonitor trait + Vercel/Railway impls
│   │   ├── auth/         # OAuth (PKCE + loopback) and PAT validation
│   │   ├── commands/     # Tauri invoke handlers (accounts, deployments, window, ux, prefs)
│   │   ├── poller.rs     # Tokio background poll loop
│   │   ├── cache.rs      # In-memory DashboardState + diff detection
│   │   ├── tray.rs       # Tray icon + health state machine
│   │   ├── keychain.rs   # Unified-vault keychain wrapper
│   │   ├── store.rs      # tauri-plugin-store persistence for accounts/settings
│   │   ├── notifications.rs
│   │   ├── redact.rs     # Regex-based secret redaction for logs
│   │   ├── shortcut.rs   # Global hotkey
│   │   └── window.rs     # Window lifecycle
│   ├── icons/            # App + tray icons (gray/green/yellow/red/syncing)
│   └── tauri.conf.json   # Windows, CSP, bundle config
├── docs/
│   ├── prd.md            # Full product requirements (user stories, flows, APIs)
│   ├── system-design.md  # Visual/interaction design spec
│   └── connecting-accounts.md
├── package.json
├── vite.config.ts
└── .github/workflows/ci.yml
```

---

## 4. Architecture

### Two-Window Model
- **`popover`** — 380×600, frameless, always-on-top, transparent, skipTaskbar. Anchored to the tray.
- **`desktop`** — 560×680, resizable, normally hidden, launched for onboarding & settings.
- `src/main.tsx` reads `window.label` and mounts either `<PopoverApp>` or `<DesktopApp>`.

### Data Flow
1. Rust **poller** runs on a Tokio interval (default 15s, range 5–600s, hot-swappable via `AtomicU64`).
2. Poller fans out across all enabled accounts (bounded `JoinSet`), calls each adapter.
3. New state is diffed against the **in-memory cache** (`cache.rs`); a `DiffEvent` is generated for any state change.
4. Rust emits a `dashboard:update` Tauri event → frontend hooks (`use-dashboard`) re-render.
5. Tray icon and native notifications are recomputed from the same diff.

No persistent queue, no cron, no DB — everything lives in memory during the process lifetime. Accounts and settings are persisted via `tauri-plugin-store` (JSON file); tokens go in the OS keychain.

### Adapter Pattern
`src-tauri/src/adapters/trait.rs` defines `DeploymentMonitor` (async). Each platform implements it in its own subfolder (`adapters/vercel/`, `adapters/railway/`) with `mod.rs`, `client.rs` (HTTP/GraphQL), `types.rs` (DTOs), `mapper.rs` (DTO → domain). An `AdapterRegistry` holds `Arc<dyn DeploymentMonitor>` instances keyed by account ID. Adding a new provider = implement the trait + register it; the frontend is provider-agnostic.

### Tray Health State Machine (`tray.rs`)
- **Gray** — no accounts connected
- **Green** — all deployments `Ready`
- **Yellow** — any `Building` / `Queued`
- **Red** — any `Error` within last 30 min
- **Syncing** — initial poll in flight

Each state maps to a separate icon file; macOS uses template-mode icons with an overlay dot.

---

## 5. Domain Model

### Rust (`src-tauri/src/adapters/mod.rs`)
```rust
enum Platform { Vercel, Railway }
enum DeploymentState { Queued, Building, Ready, Error, Canceled, Unknown }

struct AccountProfile { id, platform, display_name, email, avatar_url, scope_id }
struct Project        { id, account_id, platform, name, url, framework, latest_deployment }
struct Deployment     { id, project_id, service_id?, service_name?, state, environment,
                        url?, inspector_url?, branch?, commit_sha?, commit_message?,
                        author_name?, author_avatar?, created_at, finished_at?,
                        duration_ms?, progress? }
```

### Persistence (`src-tauri/src/store.rs`)
```rust
enum AccountHealth { Ok, NeedsReauth, Revoked }

struct StoredAccount { id, platform, display_name, scope_id?, enabled, created_at, health }
// Token is NOT stored here — it lives in the keychain, keyed by account id
```

### Frontend (`src/lib/accounts.ts`, `src/lib/deployments.ts`)
TypeScript mirrors of the Rust models for type-safe `invoke()` calls.

---

## 6. External Integrations

### Vercel (`https://api.vercel.com`)
| Purpose | Endpoint |
|---|---|
| Validate token / profile | `GET /v2/user` |
| Teams for scope picker | `GET /v2/teams` |
| List projects | `GET /v9/projects` |
| Poll deployments | `GET /v6/deployments` |
| Deployment detail | `GET /v13/deployments/{id}` |
| Cancel | `PATCH /v12/deployments/{id}/cancel` |

**Auth**: Bearer token. Supports both PAT and **OAuth PKCE** via a loopback server on `127.0.0.1:53123` (fallbacks `53124`, `53125`). 5-minute timeout, state validation for CSRF.

### Railway (`https://backboard.railway.com/graphql/v2`)
GraphQL. Queries: `me`, `projects`, `deployments`. Mutation: `serviceInstanceRedeploy`. **Token-only** — no OAuth.

### CSP (tauri.conf.json)
`connect-src` is locked to the two API hosts; avatar hosts (GitHub, Vercel, Railway) are whitelisted for `img-src`.

---

## 7. Tauri Commands (RPC surface)

Registered in `src-tauri/src/lib.rs` `invoke_handler`. Grouped roughly:

- **Accounts**: `start_oauth`, `cancel_oauth`, `connect_with_token`, `list_accounts`, `delete_account`, `set_account_enabled`, `rename_account`, `validate_token`
- **Deployments**: `get_dashboard`, `refresh_now`, `set_poll_interval`, `get_poll_interval`, `hydrate_adapters`
- **Windows**: `open_desktop`, `close_desktop`, `toggle_popover`, `show_popover`, `hide_popover`, `quit_app`
- **UX**: `open_external`
- **Prefs**: polling interval, theme, autostart getters/setters

Frontend calls go through `src/lib/tauri.ts` (`trackedInvoke` helper) for centralized error capture.

---

## 8. Security & Privacy

- **Tokens** → OS keychain only (service = `dev-radio`). Stored as a single serialized JSON "vault" under account `vault`, rather than one keychain entry per token. This avoids keychain API fragility; all tokens hydrate into memory once at startup.
- **Legacy keys** (`{platform}:{account_id}`) auto-migrate to the vault.
- **Log redaction** (`src-tauri/src/redact.rs`) — a regex pipeline strips bearer headers, API keys, JSON token fields, query params, and plain `key=value` assignments. Has dedicated unit tests.
- **CSP** restricts network egress to the two API hosts.
- **No telemetry** by default.
- **Notifications** deduped by deployment ID.

---

## 9. Configuration

### Env vars (dev builds)
- `VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET` — enables Vercel OAuth. Without them, the app falls back to PAT-only.

### Persisted settings (via tauri-plugin-store → `dev-radio.store.json`)
- `accounts[]` (StoredAccount records)
- `settings` (polling interval, theme, autostart, etc.)

### Tauri bundle targets
- macOS DMG (universal, notarized)
- Windows MSI (code-signed)
- Linux AppImage + .deb

---

## 10. Scripts (`package.json`)

| Script | Action |
|---|---|
| `pnpm dev` | Vite dev server (1420) |
| `pnpm build` | `tsc -b && vite build` |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |
| `pnpm preview` | Vite preview |
| `pnpm tauri` | Tauri CLI passthrough (`pnpm tauri dev`, `pnpm tauri build`) |

Typical dev flow: `pnpm install && pnpm tauri dev`.

---

## 11. Testing & CI

- **Rust**: `cargo test --lib` runs on `macos-latest` on push and PRs. Unit tests exist for the redactor and adapters (fixtures via `wiremock`).
- **Frontend**: only `pnpm typecheck` runs in CI. No Vitest/Jest suite visible.
- CI file: `.github/workflows/ci.yml`.

---

## 12. Notable Patterns & Quirks

1. **Rust as the source of truth.** The frontend holds no derived state beyond UI concerns; it listens for `dashboard:update` events and renders whatever Rust sent.
2. **Custom `dr/` component layer** over shadcn — this is where the "Linear/Raycast" aesthetic lives (custom badge, button, status-glyph, provider chip/mark, window chrome, menu).
3. **Stale-while-revalidate** in the popover: the cached DashboardState is shown immediately; the polling indicator communicates background refresh.
4. **Hot-swappable polling interval** via `AtomicU64` — no poller restart when the user changes the cadence in settings.
5. **Bounded fan-out**: accounts are polled concurrently but with a semaphore to avoid hammering APIs on users with many accounts.
6. **Unified keychain vault** (not one entry per token) — an intentional choice to sidestep per-entry keychain bugs, at the cost of rewriting the full JSON on each change.
7. **No router**; window identity (popover vs desktop) is the routing boundary, and within each window, views are swapped by React state.
8. **Docs quality is unusually high** for a v0.1 project: `docs/prd.md` (~774 lines) covers user stories, flows, APIs, extensibility; `docs/system-design.md` (~346 lines) is a full design system with colors, typography, component contracts, accessibility, and motion specs.
9. **No `CLAUDE.md`** in the repo.

---

## 13. Key Files to Know

| Concern | File |
|---|---|
| App bootstrap (Rust) | `src-tauri/src/lib.rs` |
| Adapter trait | `src-tauri/src/adapters/trait.rs` |
| Vercel adapter | `src-tauri/src/adapters/vercel/{mod,client,mapper,types}.rs` |
| Railway adapter | `src-tauri/src/adapters/railway/{mod,client,mapper,types}.rs` |
| Poller | `src-tauri/src/poller.rs` |
| Cache + diff | `src-tauri/src/cache.rs` |
| Tray/health | `src-tauri/src/tray.rs` |
| Keychain vault | `src-tauri/src/keychain.rs` |
| Redactor | `src-tauri/src/redact.rs` |
| OAuth PKCE | `src-tauri/src/auth/oauth.rs` |
| Popover UI | `src/app/popover/popover-app.tsx` |
| Desktop UI | `src/app/desktop/desktop-app.tsx` |
| Dashboard hook | `src/hooks/use-dashboard.ts` |
| Account wrappers | `src/lib/accounts.ts` |
| Deployment wrappers | `src/lib/deployments.ts` |
| Frontend bootstrap | `src/main.tsx` |
| Tauri config | `src-tauri/tauri.conf.json` |

---

## 14. Status & Trajectory

- Current state: v0.1 with Vercel + Railway end-to-end, tray + popover + settings + onboarding, OAuth working for Vercel.
- Last major change: flat deployment feed + Linear/Raycast-style UI redesign (PR #1, commit `f65c7c8`).
- Extensibility is the dominant architectural theme — the adapter trait and `docs/prd.md`'s 5-step "add a new platform" guide make it clear the authors expect Netlify, Render, GH Actions, etc. to follow.
