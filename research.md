# Tiny Bell — Research Report

A deep dive into the `tiny-bell` codebase: what it is, how it is put together, and the specific decisions that make it tick.

---

## 1. What it is

**Tiny Bell** (previously codenamed "Dev Radio") is a macOS/Windows/Linux **menubar desktop app** built on **Tauri v2** that monitors real-time build & deployment status for three providers:

- **Vercel** (REST)
- **Railway** (GraphQL)
- **GitHub Actions** (REST, per-repo)

The tagline from `README.md` is "Tune in to your deploys." It is a tray-first app: a small, always-on-top popover drops down from the menubar icon to show the latest deployments, and a separate desktop window hosts onboarding + settings.

Core design goals visible in the code:

- **Minimal friction** — tokens live in the OS keychain, nothing sensitive is persisted to disk or logs.
- **Low rate-limit footprint** — especially for GitHub, where an ETag cache drops poll cost by ~99%.
- **Native feel** — system tray, native notifications, global shortcut, start-at-login, macOS dock visibility toggling.

---

## 2. Tech stack

### Frontend (`src/`)

- **React 19** + **TypeScript 5.9**
- **Vite 7** (dev server on port 1420; `beforeDevCommand: bun run dev` in `tauri.conf.json`)
- **TailwindCSS v4** with an **oklch**-based design token system
- **shadcn/ui** primitives + **Radix UI** (Switch, Dialog, Dropdown, Tabs, …)
- **next-themes** for system/light/dark
- **Lucide React** for UI icons + **simple-icons v16** for provider brand logos
- **Sonner** for toasts, **Zod** for schema validation
- Tauri JS plugins: `@tauri-apps/api`, `@tauri-apps/plugin-log`, `@tauri-apps/plugin-opener`
- `dnd-kit`, `recharts` present but not yet prominent (reserved for future features)

### Backend (`src-tauri/`)

- **Tauri v2** with plugins: `log`, `store`, `notification`, `autostart`, `global-shortcut`, `opener`
- **reqwest 0.12** (rustls-tls) for HTTP
- **tokio 1** (full) for async runtime
- **keyring 3** with native backends (apple-native, windows-native, sync-secret-service)
- **serde / serde_json**, **chrono**, **uuid**, **once_cell**, **thiserror**, **async-trait**
- OAuth helpers: **base64**, **sha2**, **rand**, **url / urlencoding**, **regex**
- `wiremock` in dev-dependencies for API mocking in tests

Release profile is size-optimized: `opt-level = "s"`, LTO on, `codegen-units = 1`, `panic = "abort"`, strip symbols (`src-tauri/Cargo.toml:54-62`).

---

## 3. Frontend architecture

### Entry point — dynamic root selection

`src/main.tsx` inspects `window.__TAURI_METADATA__` (label = `"popover"` or `"desktop"`) and mounts a different React tree per window:

- **`PopoverApp`** — the deployment feed
- **`DesktopApp`** — onboarding + settings + about
- **`DevSandbox`** — a browser-only harness used when running Vite outside Tauri

Shared providers wrap both: `ThemeProvider` (next-themes), `ExternalLinkGuard`, `Toaster`, and a dev-only `DebugPanel`.

### Folder layout

```
src/
├── app/
│   ├── desktop/                 # "Desktop" window app
│   │   ├── desktop-app.tsx      # route state machine
│   │   ├── views/
│   │   │   ├── onboarding-view.tsx
│   │   │   ├── settings-view.tsx
│   │   │   └── settings/        # accounts-tab, general-tab, about-tab
│   │   └── components/
│   │       └── close-hint-dialog.tsx
│   └── popover/
│       ├── popover-app.tsx      # deployment feed + keyboard nav
│       └── components/
├── components/
│   ├── dr/                      # "Dev Radio" design-system primitives
│   │   ├── brand-mark.tsx       # generic simple-icons SVG renderer
│   │   ├── status-glyph.tsx     # hand-drawn deployment-state glyphs
│   │   ├── provider-mark.tsx    # brand badge (icon + name)
│   │   ├── button.tsx, icon.tsx, kbd.tsx, initials-avatar.tsx ...
│   ├── account/                 # add-account dialog + form + GitHub repo picker
│   ├── popover/                 # rows, header, footer, filter bars, states
│   └── ui/                      # shadcn/ui primitives
├── hooks/
│   ├── use-dashboard.ts         # subscribes to dashboard:update
│   ├── use-scope.ts             # "all accounts" vs single-account filter
│   ├── use-theme.ts
│   └── use-mobile.ts
└── lib/
    ├── accounts.ts              # TS bindings for account Tauri commands
    ├── deployments.ts           # dashboard + window + refresh APIs
    ├── prefs.ts                 # theme, intervals, shortcuts, notifications
    ├── tauri.ts                 # trackedInvoke wrapper
    ├── format.ts                # formatRelative / formatInterval
    └── utils.ts                 # cn() (clsx + tailwind-merge)
```

### State management — none (by choice)

There is **no Redux / Zustand / Jotai**. Everything is built on:

1. React local state + `useEffect`
2. Tauri events fanned out from Rust:
   - `dashboard:update` — a fresh `DashboardState` snapshot
   - `accounts:changed` — accounts list mutated
   - `prefs:changed` — user preferences mutated
   - `desktop:route` — route request from Rust (e.g., tray menu "Settings")

`useDashboard` (`src/hooks/use-dashboard.ts`) is the canonical pattern: fetch snapshot once, then subscribe and replace state on every `dashboard:update`.

### Styling & design tokens

- Tailwind v4 driven by CSS custom properties in `src/index.css` (oklch).
- Semantic tokens (`--text`, `--foreground`, `--border`) plus per-provider accents (`--accent-vercel`, `--accent-railway`, `--accent-github`).
- Light/dark switched via `data-theme` attribute on root.
- No component CSS files — everything is Tailwind utilities.

### Routing — hand-rolled

`DesktopApp` keeps a `route` union (`"onboarding" | "settings" | "about"`) and renders the right view. Route transitions come from:

- Tray menu → Rust command `open_desktop(route)` → emit `desktop:route` → frontend swaps route.
- In-app nav (e.g., "Back to onboarding" from settings).

No React Router — the surface is small enough that a state variable suffices.

---

## 4. Backend (Rust / Tauri) architecture

### `lib.rs` — wiring

`src-tauri/src/lib.rs:60-214` does the setup:

1. Register plugins (log with redaction, store, notification, autostart, global-shortcut, opener).
2. Build shared state: `AdapterRegistry`, `Cache`, `Prefs`.
3. Build the system tray (`tray::build`).
4. Load prefs + apply theme + autostart state.
5. Branch on account count:
   - **0 accounts** → open the desktop window to onboarding.
   - **≥ 1** → `poller::ensure_started` + `set_interval_secs` so the background poller kicks in.
6. Register a window close handler that hides (doesn't destroy) the desktop window, and a blur handler that auto-hides the popover.

### Tauri commands (the frontend surface)

Registered via `invoke_handler!` (`lib.rs:98-132`):

- **Accounts** — `start_oauth`, `connect_with_token`, `cancel_oauth`, `list_accounts`, `delete_account`, `set_account_enabled`, `rename_account`, `validate_token`, `hydrate_adapters`, `list_github_repos`, `set_monitored_repos`
- **Deployments** — `get_dashboard`, `refresh_now`, `get_poll_interval`, `set_poll_interval`, `open_external`
- **Windows** — `open_desktop`, `close_desktop`, `show_popover`, `hide_popover`, `toggle_popover`, `quit_app`, `get_autostart`, `set_autostart`
- **UX / prefs** — `has_seen_close_hint`, `mark_close_hint_seen`, `get_prefs`, `set_pref`, `set_window_theme`, `test_notification`, `open_notification_settings`

### Adapter pattern (`src-tauri/src/adapters/`)

The core abstraction (`adapters/trait.rs:29-39`):

```rust
#[async_trait]
pub trait DeploymentMonitor: Send + Sync + Debug {
    fn platform(&self) -> Platform;
    fn account_id(&self) -> &str;
    async fn list_projects(&self) -> Result<Vec<Project>, AdapterError>;
    async fn list_recent_deployments(
        &self,
        project_ids: Option<&[String]>,
        limit: usize,
    ) -> Result<Vec<Deployment>, AdapterError>;
}
```

`AdapterError` (`adapters/trait.rs:7-26`): `Unauthorized`, `RateLimited(u64 secs)`, `Network`, `Platform`, `Unsupported`.

**Shared data model** (`adapters/mod.rs:38-89`):

- `Platform` — `Vercel | Railway | GitHub`
- `DeploymentState` — `Queued | Building | Ready | Error | Canceled | Unknown`
- `AccountProfile`, `Project`, `Deployment` — flat structs serialized to JSON for the frontend.

### Platform adapters

- **Vercel** (`adapters/vercel/mod.rs`) — REST to `api.vercel.com`. Bearer auth. Supports team via `teamId` param. Parses `x-ratelimit-reset` on 429.
- **Railway** (`adapters/railway/mod.rs`) — GraphQL to `backboard.railway.com/graphql/v2`. Separate `client` module does the actual GraphQL fetches.
- **GitHub** (`adapters/github/mod.rs` + `adapters/github/cache.rs`) — REST to `api.github.com`. Iterates each **monitored repo** on the account, calls `/repos/{repo}/actions/runs` with `If-None-Match: <etag>`. On `304 Not Modified`, returns cached deployments with **zero rate-limit cost**.

The GitHub ETag cache lives in `AdapterRegistry` (not the adapter instance) so it survives the adapter hydration that happens every poll cycle.

### Registry & hydration (`adapters/registry.rs`)

`AdapterRegistry` holds `RwLock<HashMap<account_id, AdapterHandle>>` plus the per-account GitHub ETag cache. `hydrate(accounts)` re-pulls tokens from the keychain, rebuilds adapters for any changed/new account, and GCs caches for disabled or removed accounts.

### Poller (`src-tauri/src/poller.rs`)

A singleton background task (stored in `OnceCell`) that:

- Runs on an interval (default 15s, min 5s, max 600s — see `poller.rs:18-21`).
- Can be forced to tick immediately via a `tokio::sync::Notify` (triggered by the UI refresh button, Cmd+R, or account mutations).
- Spawns adapter fetches with a **`Semaphore(4)`** to cap concurrency.
- Caches project lists for `PROJECTS_REFRESH_SECS = 300s` (no point refetching every 15s).
- Skips a poll when an adapter is in a rate-limit cooldown window.
- Tracks per-account **health**: `Ok | NeedsReauth | Revoked`.
- Feeds the result into `Cache::replace_and_diff`, which produces a diff event for deployments whose state changed.
- Updates the **tray icon** (Gray / Green / Amber / Red / Syncing) based on aggregate health.
- Fires **notifications** for diffs (gated by prefs).
- Emits `dashboard:update` to the frontend.

`ERROR_WINDOW_MS = 30 * 60 * 1000` means an error keeps the tray red for 30 minutes even if no newer deploy has landed.

### Cache & diffing (`src-tauri/src/cache.rs`)

`Cache` wraps an `RwLock<DashboardState>`. `replace_and_diff` walks deployments by ID, emits `DeploymentDiff` events for state transitions, and returns them so the poller can hand them off to the notification layer. Unit-tested in the same file.

### Secrets — keychain vault (`src-tauri/src/keychain.rs`)

Rather than one keychain entry per account, Tiny Bell stores a **single JSON vault** under service `"tiny-bell"`. It is lazy-loaded and shadowed in memory. Keys are `"account_id:platform"`; values are `StoredSecret::Pat { value }` or `StoredSecret::Oauth { access_token, refresh_token, expires_at_ms }`.

Tokens never touch `tiny-bell.store.json` and never appear in logs (see redaction below).

### Auth flows (`src-tauri/src/auth/`)

- **OAuth (Vercel, Railway)** — PKCE + loopback server on ports 53123–53125. `tiny_http` listens for the callback, validates `state` in constant time, exchanges the code, stores in the keychain, shuts down. 300s timeout.
- **PAT / paste-token (all three)** — user pastes a token; Rust validates it by making a real API call, then persists it.
- **GitHub** — paste-token focused, with a repo-enumeration API used to populate the `RepoSelector`.

Client ID/secret for Vercel/Railway OAuth are read from `.env.local`; without them, only paste-token works.

### Persistence — `tiny-bell.store.json`

Managed by `tauri-plugin-store`. Contains:

- `accounts` — array of `StoredAccount` (id, platform, display_name, scope_id, enabled, created_at, health, `monitored_repos`).
- `prefs` — single `Prefs` object (see below).

Account metadata only — **no tokens**.

### Prefs (`src-tauri/src/prefs.rs`)

Single JSON object stored in the same file. Fields:

- `theme` — `"system" | "light" | "dark"`
- `refresh_interval_ms` — clamped ≥ 5000
- `global_shortcut` — default `Alt+Command+D` on macOS
- `start_at_login`
- `show_in_dock`
- `notifications.on_failure`, `notifications.on_recovery`
- `hide_to_menubar_shown` — one-shot flag for the close-hint dialog

Typed apply helpers (`apply_string / apply_u64 / apply_bool`) validate and emit `prefs:changed`.

### Notifications (`src-tauri/src/notifications.rs`)

- Uses `tauri-plugin-notification`.
- Only fires on diff events, never on raw state (so a stable "Error" doesn't re-notify every 15s).
- First poll after startup suppresses notifications (to avoid a notification storm on launch).
- Gated by `notify_on_failure` (Error/Canceled) and `notify_on_recovery` (Error → Ready).

### Tray, window, shortcut, platform

- `tray.rs` — icon states, menu items (Open, Refresh Now, Settings, Quit), left-click toggles the popover.
- `window.rs` — two windows: `desktop` (560×680, hidden on boot, close hides instead of destroys) and `popover` (380×600, always-on-top, skipTaskbar, acceptFirstMouse, shadow, positioned under the tray icon).
- `shortcut.rs` — registers the user's global shortcut; toggles the popover.
- `platform.rs` — macOS-only helper that switches `ActivationPolicy::Regular` ↔ `Accessory` based on whether any real windows are visible, so the app disappears from the dock when only the menubar is in use.

### Redaction (`src-tauri/src/redact.rs`)

All logs pass through `redact()`. Regex patterns mask 14 sensitive keys (token, access_token, refresh_token, authorization, code, client_secret, code_verifier, password, api_key, …) across Bearer headers, JSON pairs, and loose key=value text. Unit-tested.

### CSP (`src-tauri/tauri.conf.json:48`)

Tight Content-Security-Policy:

- `connect-src` — only `api.vercel.com`, `backboard.railway.app`, `api.github.com`
- `img-src` — `data:` + those three domains (for avatars)
- `script-src` — `'self' 'unsafe-inline'` (Tauri requires inline)

Prevents accidental exfiltration if a rendering bug ever surfaces untrusted content.

---

## 5. Core domain

The mental model in the app is three nested entities:

1. **Account** — a credential tied to a platform. Has `health` (`Ok | NeedsReauth | Revoked`), `scope_id` (team/org for Vercel/Railway), and `monitored_repos` for GitHub.
2. **Project** — a deployable unit owned by an account. For GitHub this is one monitored repository; for Vercel/Railway it's the platform's own project concept.
3. **Deployment** — a single run with `state`, branch, commit SHA, author, timestamps, progress, URLs (`url` for the deployed site, `inspector_url` for the logs/build page).

**Notifications fire** when a deployment's state changes between polls (subject to user prefs). They do **not** fire on the first poll of a session.

---

## 6. Key user flows

### Onboarding

1. First launch with zero accounts → desktop window opens to `OnboardingView`.
2. User picks a platform (Vercel / Railway / GitHub).
3. `AddAccountDialog` offers OAuth (Vercel/Railway) or paste-token (all three).
4. OAuth: Rust spawns a loopback server on 53123-53125, opens the provider's auth page, catches the callback, exchanges the code.
5. Token stored in the keychain vault; account metadata written to `tiny-bell.store.json`.
6. Backend emits `accounts:changed`; poller is started (if not already) and forced to tick immediately.
7. For GitHub, `RepoSelector` lets the user pick which repos to monitor (saved via `set_monitored_repos`).

### Real-time updates

- Poller loops on the user-configured interval (default 15s, min 5s).
- Each tick hydrates adapters, fetches projects (cached 5 min) and the latest 100 deployments per account (bounded to 4 concurrent fetches).
- Diffs new state against the cached state; emits `dashboard:update` + fires notifications for transitions.
- Tray icon color reflects aggregate health.

### Popover interaction

Keyboard is first-class (`popover-app.tsx:155-203`):

- `↑ ↓` — focus row
- `⌘R` — refresh
- `⌘,` — open settings
- `⌘Q` — quit
- `⌘N` — onboarding
- `⌘0..9` — switch account scope
- `Esc` — hide popover
- `Enter` — open deploy URL
- `Shift+Enter` — open inspector (logs)

Clicking a row opens its URL; focused rows reveal "Open site" and "Logs" buttons.

### Settings

Three tabs:

- **Accounts** — list / add / enable / disable / delete / rename accounts; validate token; select GitHub repos.
- **General** — theme, poll interval, notification toggles, global shortcut recorder, start-at-login, dock visibility.
- **About** — version, links.

Pref changes are round-tripped: frontend calls `set_pref` → Rust updates the store + applies side-effects (e.g., re-registering the global shortcut or toggling `autostart`) → emits `prefs:changed`.

### GitHub ETag flow

For each monitored repo:

1. Look up cached `etag` in `AdapterRegistry`.
2. `GET /repos/{repo}/actions/runs` with `If-None-Match: <etag>`.
3. `304` → return cached deployments (costs ~no rate-limit budget).
4. `200` → parse, update cache with new ETag + payload.

With 30 repos polled every 10s this takes an otherwise-impossible load (10,800 req/hr) and reduces it to a few hundred real fetches per hour.

---

## 7. Project-specific quirks worth calling out

- **Single keychain vault** — one secure store entry holds all tokens; simpler lifecycle, fewer OS keychain prompts.
- **GitHub ETag cache lives in the registry, not the adapter** — so rebuilding adapters each poll (cheap, keeps tokens fresh) doesn't blow away the cache.
- **Semaphore-bounded polling** — max 4 concurrent adapter calls, protects against 50-account chaos.
- **`BrandMark`** (`components/dr/brand-mark.tsx`) — a 24×24 SVG shell fed by `simple-icons` paths with `fill="currentColor"`, so brand logos inherit theme color. Recent refactor made it generic (git: `f557b20`).
- **`StatusGlyph`** — hand-drawn SVG per deployment state with a `dr-pulse` animation for in-flight states.
- **oklch design tokens** — perceptually uniform across light/dark.
- **macOS dock visibility toggle** — app vanishes from dock when only the menubar is in use; reappears when onboarding/settings is open.
- **Close-hint dialog** — first time a user closes the desktop window, the app surfaces "this window closes to the menubar" (tracked via `has_seen_close_hint` pref).
- **Log redaction** — 14-key regex sweep on every log line, unit-tested.
- **Strict CSP** — allow-list of exactly three outbound hosts.
- **First-poll notification suppression** — avoids a storm on launch.
- **`ERROR_WINDOW_MS`** — tray stays red for 30 min after an error, even if nothing new has happened, so users don't miss a failure that occurred while the app was hidden.
- **No frontend test runner** — only Rust unit tests (`cache.rs`, `redact.rs`). `wiremock` is available for mocking adapter HTTP in integration tests.

---

## 8. Build & dev setup

### Scripts (`package.json:6-13`)

- `pnpm dev` — Vite on `:1420`
- `pnpm build` — `tsc -b && vite build`
- `pnpm tauri dev` — full desktop dev loop (Vite + Rust auto-rebuild)
- `pnpm tauri build` — produces DMG / MSI / AppImage
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` / `pnpm format` — ESLint / Prettier

### Rust tests

```
cd src-tauri && cargo test --lib
```

### Environment (`.env.local`, optional)

```
VERCEL_CLIENT_ID=...
VERCEL_CLIENT_SECRET=...
# Railway + GitHub similarly if OAuth is desired
```

Without these, OAuth is disabled for that provider but paste-token still works.

### Release profile (`src-tauri/Cargo.toml:54-62`)

`opt-level = "s"`, LTO, `codegen-units = 1`, `panic = "abort"`, strip — produces a small binary (~10–15 MB on macOS).

---

## 9. Data flow at a glance

```
Tray ── click ──► Popover / Desktop (React)
                         │
                         │ invoke(cmd)
                         ▼
                 Tauri command layer (Rust)
                         │
            ┌────────────┼──────────────┐
            ▼            ▼              ▼
       AdapterRegistry  Cache         Prefs / Store
            │             │
            │             └── replace_and_diff ─► notifications + events
            ▼
     Vercel / Railway / GitHub HTTP
            (GitHub with If-None-Match)
```

Events `dashboard:update`, `accounts:changed`, `prefs:changed`, `desktop:route` flow back from Rust to React; the frontend has no state store beyond React hooks that listen to these events.

---

## 10. Recent git history (context)

```
d216d81 feat(settings): notification status panel with test + deep-link
78a7572 fix: GitHub onboarding flow + UX polish across popover and settings
f557b20 refactor(dr): extract BrandMark for generic simple-icons rendering
4e3949a feat: switch provider icons to simple-icons package
63fc413 feat: GitHub ETag cache + finish settings wiring + sandbox overhaul
```

Trajectory: started with Vercel, added Railway OAuth + token refresh + unified vault, then GitHub Actions with the ETag cache, then iterated on UI (Linear/Raycast-inspired flat feed), then polished onboarding + notification UX.

---

## 11. One-paragraph summary

Tiny Bell is a lean Tauri v2 menubar app whose job is to tell you — quickly and cheaply — when your Vercel, Railway, or GitHub Actions deploys change state. Its architecture is deliberately small: a Rust poller orchestrates per-platform adapters behind a shared `DeploymentMonitor` trait, stores all secrets in a single OS-keychain vault, caches GitHub responses via ETags to avoid rate limits, and fans diffs out to a React 19 frontend over Tauri events — no state-management library, no routing library, just hooks listening to `dashboard:update`. Native affordances (tray icon, global shortcut, start-at-login, macOS dock toggling, native notifications) are layered on top, with log redaction and a locked-down CSP protecting sensitive data.
