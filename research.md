# Dev Radio (kyoto) — Research Report

> A deep dive into the Dev Radio codebase: what it is, how it works, and the interesting bits you won't find in the README.

## 1. What is Dev Radio?

**Dev Radio** is a cross-platform desktop app that lives in the menu bar / system tray and ambiently shows the status of your cloud deploys. It currently supports **Vercel** and **Railway**, and is architected so adding a new provider means implementing a single Rust trait.

Key properties:

- **Menubar-first**: the tray icon is the primary surface. A popover window shows deployments; a separate desktop window is used only for onboarding, settings, and about.
- **Tauri v2 + React 19**: native Rust backend, web-tech frontend, single binary per-platform.
- **Local-first security**: tokens never touch disk or localStorage; everything lives in the OS keychain, and logs are scrubbed through a redactor.
- **Lazy everything**: the keychain isn't touched at boot (no prompts), the poller isn't started until an account exists, and the dock icon only appears when a real window is visible (macOS).

Stack summary:

| Layer | Tech |
|------|------|
| Frontend | React 19, TypeScript, Vite, TailwindCSS v4, shadcn/ui, Lucide icons |
| Backend | Rust 2021, Tauri v2, Tokio, Reqwest (rustls), Serde |
| Storage | `keyring` crate (OS keychain) for secrets; `tauri-plugin-store` for metadata |
| Auth | Vercel: OAuth2 (PKCE + loopback). Railway: PAT paste. Vercel also supports PAT. |
| Tooling | pnpm, ESLint, Prettier, `cargo test --lib`, GitHub Actions CI on macOS |

## 2. Repository Layout

```
kyoto/
├── src/                       React frontend
│   ├── app/
│   │   ├── desktop/           Onboarding / Settings / About window
│   │   └── popover/           Tray popover window (deployments list)
│   ├── components/            shadcn primitives + feature components
│   ├── hooks/                 use-dashboard (listens for backend events)
│   ├── lib/                   Typed Tauri invoke wrappers + formatters
│   ├── main.tsx               Dual-root bootstrap (picks app based on window label)
│   └── index.css              Tailwind v4 + CSS variables
├── src-tauri/                 Rust backend
│   ├── src/
│   │   ├── adapters/          Platform trait + Vercel / Railway impls
│   │   ├── auth/              OAuth (PKCE + loopback) and PAT
│   │   ├── commands/          #[tauri::command] entrypoints
│   │   ├── cache.rs           DashboardState + diffing
│   │   ├── keychain.rs        Vault abstraction over `keyring` crate
│   │   ├── poller.rs          Tokio background polling loop
│   │   ├── redact.rs          Secret-stripping for logs
│   │   ├── store.rs           Persistent metadata (non-secret)
│   │   ├── tray.rs            Tray icon state machine + menu
│   │   ├── window.rs          Show/hide/position helpers
│   │   ├── platform.rs        macOS activation-policy toggle
│   │   ├── notifications.rs   Native desktop notifications
│   │   ├── lib.rs / main.rs   App wiring, plugin setup, setup hook
│   ├── icons/                 Tray variants (gray/green/yellow/red/syncing + @1x/2x/3x)
│   ├── capabilities/          Tauri v2 capability files (IPC scopes)
│   └── tauri.conf.json        Windows, CSP, bundle config
├── docs/                      connecting-accounts, prd, system-design
├── .github/workflows/         CI (ci.yml), release pipeline (release.yml)
├── plan.md / plan-v2.md / plan-v3.md   Historical planning docs (see §9)
├── package.json / pnpm-lock.yaml
└── README.md
```

## 3. High-Level Architecture

```
          ┌──────────────────┐
 user ──▶ │   Tray icon      │ left-click / right-click
          └────────┬─────────┘
                   │
          ┌────────┴──────────────────────────────┐
          │           Tauri v2 app                 │
          │                                        │
          │  ┌──────────┐        ┌──────────────┐  │
          │  │ Desktop  │        │  Popover     │  │
          │  │ window   │        │  window      │  │
          │  │ (React)  │        │  (React)     │  │
          │  └────┬─────┘        └──────┬───────┘  │
          │       │  invoke/event       │          │
          │       └──────┬──────────────┘          │
          │              ▼                         │
          │  ┌───────────────────────────────┐    │
          │  │  Rust commands (accounts,     │    │
          │  │  deployments, window, ux)     │    │
          │  └───────────┬───────────────────┘    │
          │              │                         │
          │  ┌───────────▼──────────┐  ┌────────┐ │
          │  │ Poller (tokio task)  │─▶│ Cache  │─┐
          │  └──────┬───────────────┘  └────────┘ │ emits
          │         │                              │ dashboard:update
          │  ┌──────▼──────┐  ┌───────────┐       │
          │  │ Adapter     │  │ Keychain  │       │
          │  │ registry    │  │ vault     │       │
          │  └──┬─────┬────┘  └───────────┘       │
          │     │     │                            │
          │     ▼     ▼                            │
          │   Vercel  Railway                      │
          │   REST    GraphQL                      │
          └────────────────────────────────────────┘
```

Two windows, one backend. The frontend talks to Rust through `invoke()` (request/response) and listens to Tauri events (server-push). The backend owns all state.

## 4. Backend — Rust Modules in Depth

### 4.1 Domain Models — `adapters/mod.rs`

```rust
enum Platform { Vercel, Railway }
enum DeploymentState { Queued, Building, Ready, Error, Canceled, Unknown }

struct AccountProfile { id, platform, display_name, email, avatar_url, scope_id }
struct Project        { id, account_id, platform, name, url, framework, latest_deployment }
struct Deployment     { id, project_id, state, environment, url, inspector_url,
                        branch, commit_sha, commit_message, author_name, author_avatar,
                        created_at, finished_at, duration_ms, progress }
```

`scope_id` is the polymorphic "which slice of the account" field — team ID on Vercel, project/environment ID on Railway.

### 4.2 Adapter Trait — `adapters/trait.rs`

```rust
#[async_trait]
pub trait DeploymentMonitor: Send + Sync + Debug {
    fn platform(&self) -> Platform;
    fn account_id(&self) -> &str;
    async fn list_projects(&self) -> Result<Vec<Project>, AdapterError>;
    async fn list_deployments(&self, project_id: &str, limit: usize)
        -> Result<Vec<Deployment>, AdapterError>;
}
```

`AdapterError` distinguishes transient vs terminal errors: `Unauthorized`, `RateLimited`, `Network`, `Parse`, `Unknown`. The poller uses this to decide whether to keep retrying or surface an error to the UI.

### 4.3 Adapter Implementations

- **Vercel** (`adapters/vercel/`) — REST over `https://api.vercel.com`. Appends `?teamId=...` when `scope_id` is set. Handles pagination, maps API DTOs to domain models in `mapper.rs`.
- **Railway** (`adapters/railway/`) — GraphQL POST to `https://backboard.railway.app/graphql/v2`. One query for projects, another for recent deployments per project.

Both adapters get their bearer token from the keychain vault at construction time, not per-request.

### 4.4 Adapter Registry — `adapters/registry.rs`

`HashMap<String, Arc<dyn DeploymentMonitor>>` keyed by `account_id`. The poller asks the registry to hydrate itself from the store before each round, and the registry only creates adapters for enabled accounts whose tokens are available in the vault.

### 4.5 Auth — `auth/`

- **OAuth (PKCE + loopback)** — `auth/oauth.rs` + `auth/vercel.rs`. Generates a 32-byte random code verifier, derives SHA-256 challenge, spawns a loopback HTTP server on `127.0.0.1:53123`, opens the authorize URL via `tauri-plugin-opener`, waits for the redirect, validates state, exchanges the code for an access token, then fetches the user profile to populate `AccountProfile`.
- **PAT (paste token)** — `auth/pat.rs`. User pastes a token; we call a "whoami"-style endpoint on the platform to validate and populate profile metadata, then store the token in the vault.

### 4.6 Keychain Vault — `keychain.rs`

The single most interesting design choice. Rather than storing one keychain entry per account (which prompts the user once per account on macOS), Dev Radio uses a **vault**: a single keychain entry (`service="dev-radio"`, `account="vault"`) containing a JSON map `{ account_id: token }`.

Behavior:

- **Lazy load** — `ensure_loaded()` is called on the first poll, not at boot. No prompts during splash.
- **In-memory cache** — Once loaded, the map lives in a `OnceCell<RwLock<HashMap<String,String>>>` for the lifetime of the process.
- **Legacy migration** — If a token isn't in the vault, `get_token` falls back to a legacy per-account entry, imports it, and deletes the old one. Older installs migrate transparently on first poll.
- **Flush on write** — Any `store_token` / `delete_token` re-serializes the full map back to the OS keychain.

### 4.7 Persistent Store — `store.rs`

Uses `tauri-plugin-store` (JSON file in the app data directory). Stores only non-secret metadata: the list of `StoredAccount { id, platform, display_name, scope_id, enabled, created_at }` plus small UX flags like `ui.close_hint_seen`. Tokens **never** go here.

### 4.8 Polling Loop — `poller.rs`

Tokio task started by the setup hook if any accounts exist, or when the first account is added. Per tick:

1. `keychain::ensure_loaded()` — first tick pays the OS prompt cost.
2. Load accounts from store → hydrate registry.
3. For each enabled adapter: `list_projects()` → for each project: `list_deployments(limit=10)`. Parallelized with a concurrency cap.
4. Build a fresh `DashboardState`.
5. `cache.replace_and_diff(new)` — swaps state and emits `DiffEvent`s for any project whose latest-deployment state transitioned.
6. Diff events drive native desktop notifications (`notifications.rs`) and tray health updates (`tray.rs`).
7. Emit `dashboard:update` event so any listening window refreshes.

Interval defaults to 15 s, adjustable via `set_poll_interval` (clamped). `refresh_now` triggers an immediate poll without resetting the interval timer.

### 4.9 Cache & Diff — `cache.rs`

`DashboardState { projects, deployments_by_project, last_refreshed_at, last_error, offline, polling }`. Held in an `RwLock`. `replace_and_diff` compares the latest deployment per project between old and new state and returns a list of transition events consumed by the tray and notifier.

### 4.10 Tray — `tray.rs`

The tray icon is a finite-state machine:

| State    | Trigger |
|----------|---------|
| Setup    | No accounts yet |
| Syncing  | First poll in progress |
| Gray     | Offline or no recent data |
| Green    | All latest deployments Ready |
| Yellow   | Any Building / Queued |
| Red      | Any Error within last ~30 min |

Icon PNGs live in `src-tauri/icons/tray/` as 1x/2x/3x variants so macOS picks the right DPI.

Click behavior:

- **Left click**: toggle popover (if accounts) or open the desktop onboarding window (if no accounts).
- **Right click**: context menu — Open Dev Radio, Refresh Now, Settings, Quit.

### 4.11 Windows & Platform — `window.rs`, `platform.rs`, `tauri.conf.json`

Two windows declared in `tauri.conf.json`:

| Window   | Size     | Flags |
|----------|----------|-------|
| desktop  | 560×680  | decorated, resizable-ish, starts hidden |
| popover  | 380×600  | frameless, alwaysOnTop, skipTaskbar, transparent |

`window.rs` computes the popover position from the tray rect at show-time and auto-hides on blur. `platform.rs::set_visible_dock(app, bool)` is macOS-only and toggles `ActivationPolicy::Regular` vs `Accessory` so the dock icon only appears while a real window is visible. On Windows/Linux it's a no-op.

Closing the desktop window **hides** it (doesn't quit). A one-shot "I'm still in your menu bar" hint dialog fires the first time, then `ui.close_hint_seen` is flipped in the store.

### 4.12 Redactor — `redact.rs`

Regex-based log scrubber installed as the format callback of `tauri-plugin-log`. Matches four shapes of secrets:

1. `Bearer <...>` → `Bearer ***`
2. JSON `"token":"..."` (and the other key names)
3. URL-encoded `token=...&...`
4. Plain `token: ...`

Covered keys: `token`, `access_token`, `refresh_token`, `authorization`, `code`, `client_secret`, `code_verifier`, `password`, `api_key` / `api-key`.

### 4.13 Notifications — `notifications.rs`

Thin wrapper over `tauri-plugin-notification`. Called from the poller when a project transitions into `Ready` or `Error`. No persistent queue or in-app notification center.

## 5. Tauri Command Surface

Everything the frontend can call. All return `Result<T, String>` at the IPC boundary.

### Accounts — `commands/accounts.rs`

| Command | Purpose |
|---|---|
| `start_oauth(platform)` | Kick off PKCE OAuth (Vercel) |
| `cancel_oauth()` | Abort in-flight OAuth |
| `connect_with_token(platform, token, scope_id?)` | PAT flow for either provider |
| `list_accounts()` | Return `Vec<AccountRecord>` |
| `delete_account(id)` | Remove from store + vault |
| `set_account_enabled(id, enabled)` | Toggle polling for one account |
| `rename_account(id, display_name)` | Update metadata |
| `hydrate_adapters()` | Force registry sync (called on popover focus) |

### Deployments — `commands/deployments.rs`

| Command | Purpose |
|---|---|
| `get_dashboard()` | Return current cached `DashboardState` |
| `refresh_now()` | Force immediate poll |
| `set_poll_interval(secs)` / `get_poll_interval()` | Read/write polling interval (5 s – 10 min) |
| `open_external(url)` | Open URL in system browser |

### Window — `commands/window.rs`

| Command | Purpose |
|---|---|
| `open_desktop(view)` | Show desktop window and emit `desktop:route` |
| `close_desktop()` | Hide desktop window |
| `toggle_popover()` / `show_popover()` / `hide_popover()` | Popover lifecycle |
| `quit_app()` | Process exit |
| `get_autostart()` / `set_autostart(enabled)` | Launch-at-login toggle |

### UX — `commands/ux.rs`

| Command | Purpose |
|---|---|
| `has_seen_close_hint()` / `mark_close_hint_seen()` | One-shot close-hint dialog |

### Events (backend → frontend)

- `dashboard:update` — cache updated, frontend should re-fetch via `get_dashboard`
- `accounts:changed` — account list changed
- `desktop:route` — change desktop view programmatically
- `desktop:close-hint` — show close-hint dialog
- `oauth:complete` / `oauth:error` — signal OAuth result to any open dialog

## 6. Frontend — React 19

### 6.1 Dual-Root Bootstrap — `src/main.tsx`

```ts
const label = getCurrentWindow().label
if (label === "popover") { /* import PopoverApp */ }
else                     { /* import DesktopApp */ }
```

Each window is a **separate React root** with **no shared state**. All cross-window coordination goes through backend events. This keeps things simple at the cost of each window re-fetching what it needs on focus.

### 6.2 Desktop App — `src/app/desktop/`

State-machine router with three views:

- **OnboardingView** — `AddAccountForm` (tabs: Vercel / Railway). Auto-advances to settings on first successful connect.
- **SettingsView** — account list (toggle enabled / rename / delete), polling interval slider, launch-at-login checkbox.
- **AboutView** — version + links.

Also owns the `CloseHintDialog` that fires once when the user first closes the desktop window.

### 6.3 Popover App — `src/app/popover/`

Display-only view:

- **DeploymentsView** if accounts exist — header with account switcher + settings gear, scrollable list of `DeploymentCard`s, footer with last-refreshed + interval.
- **EmptyConnectView** otherwise — a single "Connect account" button that opens the desktop window into onboarding.

Each `DeploymentCard` shows provider logo, project name, branch + commit SHA, author avatar, relative time, and a colored `StatusIcon`.

### 6.4 Libraries & Helpers

- `src/lib/accounts.ts`, `src/lib/deployments.ts` — typed wrappers over `invoke()` so the rest of the UI never touches the raw Tauri API.
- `src/lib/tauri.ts` — `trackedInvoke` / `trackedEmit` add debug instrumentation (see `components/debug-panel.tsx`) — useful during development, harmless in release.
- `src/lib/format.ts` — `formatRelative("2m ago")`, human status labels, etc.
- `src/lib/provider-theme.ts` — per-provider accent colors.
- `src/hooks/use-dashboard.ts` — subscribes to `dashboard:update`, returns current state.
- `src/components/external-link-guard.tsx` — intercepts internal links that shouldn't escape to the system browser.

### 6.5 UI System

shadcn/ui primitives copied into `src/components/ui/` (button, dialog, input, tabs, select, toggle, dropdown-menu, alert-dialog, sheet, card, separator, badge, avatar, skeleton, sonner toast, TanStack table). TailwindCSS **v4** via `@tailwindcss/vite`; theming is done with CSS variables in `src/index.css`, dark mode through `next-themes`.

## 7. Security Model

- **CSP (`tauri.conf.json`)** — `connect-src` is limited to `api.vercel.com`, `vercel.com`, `backboard.railway.app`, `railway.app`. `img-src` allows avatars from GitHub, Vercel, and Railway only. No remote scripts.
- **Tokens** — OS keychain vault only. Never in state files, never in frontend memory after the initial paste step, never in logs.
- **Logs** — Everything passes through `redact.rs` before hitting disk. Bearer tokens, JSON secrets, URL-encoded secrets, and bare `key: value` shapes are all caught.
- **OAuth state & PKCE** — State param validated with constant-time compare; PKCE verifier is cryptographically random.
- **External URLs** — Only opened via `tauri-plugin-opener`, not via `window.open`. Frontend `ExternalLinkGuard` is a second line of defense.

## 8. Build, Tooling, CI

### Scripts (`package.json`)

```
pnpm dev        # vite dev server
pnpm build      # tsc -b && vite build
pnpm lint       # eslint
pnpm typecheck  # tsc --noEmit
pnpm tauri      # passthrough to tauri CLI
```

### Rust profile (`src-tauri/Cargo.toml`)

Release build: `lto = true`, `codegen-units = 1`, `opt-level = "s"`, `panic = "abort"`, `strip = true` — aggressively size-optimized.

### GitHub Actions

- `ci.yml` — macOS runner: Rust stable + cached target, `pnpm install`, `pnpm typecheck`, `cargo test --lib` (with `VERCEL_CLIENT_ID` / `VERCEL_CLIENT_SECRET` injected from repo secrets).
- `release.yml` — exists in `.github/workflows/` for packaged releases.

### Tests

- **Rust**: `cargo test --lib` covers `redact.rs` (regex cases), `cache.rs` (diff logic), and a couple of keychain tests (marked `#[ignore]` because they touch the real OS keychain).
- **Frontend**: no Jest/Vitest yet — typecheck is the only check.

## 9. Planning Docs (plan.md, plan-v2.md, plan-v3.md)

Three historical planning documents tell the evolution of the product:

- **plan.md** (~41 KB) — V1. Auth-only: OAuth PKCE details, loopback port strategy, token exchange, PAT flows, initial keychain strategy (per-account entries). Mostly superseded.
- **plan-v2.md** (~47 KB) — V2. Full menubar: poller loop, tray health FSM, cache/diff algorithm, both provider adapters, `DeploymentMonitor` trait, notifications. Largely shipped — the popover **was** the main window in V2.
- **plan-v3.md** (~29 KB) — V3, the current direction. Splits the UI into a **desktop window** (onboarding/settings/about) and a **popover** (display-only deployments), introduces the **lazy keychain vault**, the **runtime macOS activation policy toggle**, and the **one-shot close-hint dialog**. The implementation in `src/` and `src-tauri/` matches V3.

If you want to understand *why* the code looks the way it does, read plan-v3.md first — it's the closest to current state.

## 10. Quirks, Gotchas, Non-Obvious Choices

1. **Dual-root React with no shared state** — Each window re-queries what it needs. Simpler than Redux across windows, but means a little redundant work on focus.
2. **Vault (single keychain entry) vs per-account** — Trades a tiny amount of atomicity for a dramatic reduction in OS keychain prompts, especially on macOS. Legacy entries are transparently migrated.
3. **Lazy keychain** — No prompts on boot. The first poll is where the user sees the system prompt — which is intuitive ("I just added an account, of course it's asking").
4. **Activation policy is macOS-only** — dock icon hidden/shown based on whether a real window is visible. Windows/Linux don't have the concept, so it's a no-op.
5. **Close ≠ quit** — The desktop window's close button hides the window. Quitting requires the tray menu's Quit item. The close-hint dialog exists precisely because this is surprising.
6. **Health aggregation window** — A project with an `Error` in the last ~30 min keeps the tray Red even if the latest deployment is now `Ready`. Deliberately sticky so you don't miss recent failures.
7. **Poller tasks are detached** — No graceful shutdown; relies on process exit. Fine for a tray app; not fine if this ever got embedded somewhere else.
8. **Loopback port is hardcoded to 53123** — There's a `LOOPBACK_PORTS` array but it currently has length 1. If the port is busy, OAuth fails; fallback ports are mentioned in docs but not implemented.
9. **Redactor is regex-only** — Good enough for conventional log shapes; wouldn't catch tokens hidden inside a base64 blob or unusual formats. Acceptable because tokens shouldn't be in logs at all — this is defense in depth.
10. **No integration/E2E tests** — Unit tests cover the pure-Rust pieces (redactor, cache diff). Anything touching HTTP, OS keychain, or the UI is untested in CI.
11. **`trackedInvoke` / `trackedEmit` debug panel** — Every IPC call is optionally logged to an in-process ring buffer surfaced by `DebugPanel`. Handy for development; invisible in production unless explicitly opened.
12. **TailwindCSS v4** — Uses the new Vite plugin + CSS-first config. Different from v3; don't look for a `tailwind.config.js`.

## 11. Extending the System

The cleanest extension points, in rough order of effort:

- **Add a provider** — Implement `DeploymentMonitor` in `adapters/<name>/`, add a variant to `Platform`, wire it into the registry factory and the `AddAccountForm` tabs. The poller, cache, tray, and UI don't need to change.
- **New deployment metadata** — Extend `Deployment` struct → update both mappers → surface in `DeploymentCard`.
- **New notification types** — Hook into `replace_and_diff` output in the poller and fan out through `notifications.rs`.
- **Different polling strategy** (webhooks, SSE, etc.) — The poller is the only producer into `cache`; swapping it out doesn't ripple.
- **Additional window** — Add an entry in `tauri.conf.json`, branch in `main.tsx`, create a new React root.

## 12. Quick File-Level Index

Hot files for navigation:

- `src-tauri/src/lib.rs` — app builder, plugin setup, `setup()` hook
- `src-tauri/src/poller.rs` — the heart of the runtime
- `src-tauri/src/keychain.rs` — vault layer
- `src-tauri/src/cache.rs` — state + diff
- `src-tauri/src/adapters/trait.rs` — the abstraction everything hinges on
- `src-tauri/src/tray.rs` — tray FSM
- `src-tauri/tauri.conf.json` — windows + CSP
- `src/main.tsx` — dual-root entry
- `src/app/desktop/desktop-app.tsx` / `src/app/popover/popover-app.tsx` — window roots
- `src/lib/accounts.ts` / `src/lib/deployments.ts` — IPC surface from the frontend's perspective
- `plan-v3.md` — current design intent

---

**TL;DR** — Dev Radio is a well-factored Tauri v2 + React 19 menubar app with a clean platform-adapter pattern, a deliberately lazy security model built around an OS-keychain vault, and a split-window UI (tray popover for viewing, separate desktop window for configuring). The Rust backend does all the work; the frontend is a thin, event-driven view. The three plan-vN.md docs let you read the design history; `plan-v3.md` is the map to the current code.
