# Tiny Bell — Codebase Research Report

> Project branding: product name is **Tiny Bell** ("a quiet menubar app for monitoring your deploys"), but the original design docs and some HTML/comments still use the earlier name **Dev Radio**. Tagline: *"Tune in to your deploys."* Source: `package.json` → `"name": "tiny-bell"`, `src-tauri/Cargo.toml` → `description = "A quiet menubar app for monitoring your deploys"`, `src-tauri/tauri.conf.json` → `productName: "Tiny Bell"`.

---

## 1. Executive Summary

Tiny Bell is a cross-platform **desktop menu-bar / system-tray app** that surfaces real-time build and deployment status for **Vercel**, **Railway**, and **GitHub Actions** in a single glance. It is a local-first app: no server, no telemetry backend. All API credentials live in the OS-native keychain, and all polling happens inside the Rust process.

- **Shell:** Tauri v2 with two webview windows (`popover`, `desktop`) plus a tray icon that is the primary UI.
- **Backend:** Rust 2021, Tokio async runtime, `reqwest` with `rustls-tls`, `keyring` for secrets, `tauri-plugin-store` for JSON-on-disk settings.
- **Frontend:** React 19 + TypeScript, Vite 7, Tailwind v4, shadcn/ui (Radix primitives under `components/ui/`) + a custom design-system layer under `components/dr/` (the "dr" is a vestige of the Dev Radio name).
- **Extensibility:** A `DeploymentMonitor` trait defines the adapter contract — adding a new platform means implementing `list_projects` and `list_recent_deployments` and slotting into an `AdapterRegistry`.

The product makes three aggressive choices that shape the whole design:
1. **Tray color is the UI.** A single OS-tray icon (green/yellow/red/gray/syncing) tells the user whether everything is fine, building, or broken. The popover and desktop windows are secondary.
2. **Tokens never leave the machine.** OAuth and PAT flows both write into one JSON blob in the OS keychain. No remote token store, no SaaS.
3. **Two windows, one webview app.** Both `popover` and `desktop` are served from the same Vite bundle; `main.tsx` branches on `getCurrentWindow().label`.

---

## 2. Stack Summary

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 (`tauri`, `tauri-plugin-{log, opener, store, notification, autostart, global-shortcut}`) |
| Backend language | Rust 2021; async via `tokio` (full features), `async-trait` |
| HTTP | `reqwest` 0.12 with `rustls-tls`, JSON |
| OAuth helpers | `base64`, `rand`, `sha2` (PKCE), `url`, `urlencoding`, `tiny_http` (loopback server) |
| Secrets | `keyring` 3 with `apple-native`, `windows-native`, `sync-secret-service` features |
| Persistence | `tauri-plugin-store` (single JSON at `tiny-bell.store.json`) |
| Logging | `log` + `tauri-plugin-log` with a custom redactor |
| Testing | `wiremock` (unit-level API mocking) — no E2E harness |
| Frontend | React 19.2, Vite 7.3, TypeScript 5.9 |
| UI kit | Tailwind v4 via `@tailwindcss/vite`, shadcn/ui (Radix), `lucide-react`, `sonner` (toasts), `vaul`, `next-themes`, `@dnd-kit` |
| Release | GitHub Actions matrix: macOS arm64 + x86_64 DMGs (`.github/workflows/release.yml`) |

---

## 3. Project Layout

```
tiny-bell/
├── package.json, vite.config.ts, tsconfig*.json, eslint.config.js, components.json
├── index.html                     # Single HTML entry for both windows
├── .env.example, .env.local       # OAuth client IDs/secrets embedded at build time
├── docs/
│   ├── prd.md                     # Product requirements doc (verbose)
│   ├── system-design.md           # Visual / design-system spec
│   └── connecting-accounts.md     # End-user auth guide
├── plan.md                        # Full v1 implementation plan (1.3k lines)
├── .github/workflows/{ci,release}.yml
├── src/                           # React frontend (single bundle for 2 windows)
│   ├── main.tsx                   # Root: picks PopoverApp vs DesktopApp by window label
│   ├── index.css                  # Global CSS, design tokens (OKLch)
│   ├── app/
│   │   ├── popover/popover-app.tsx
│   │   ├── desktop/{desktop-app,views/*}.tsx
│   │   └── dev/sandbox.tsx        # Component sandbox for `pnpm dev` without Tauri
│   ├── components/
│   │   ├── ui/                    # vanilla shadcn/ui primitives
│   │   ├── dr/                    # product-specific primitives (button, menu, kbd, status-glyph…)
│   │   ├── account/               # connect-account dialog, form, GitHub repo selector
│   │   ├── popover/               # DeployRow, FilterBar, states/{empty,loading,offline,…}
│   │   ├── external-link-guard.tsx
│   │   ├── debug-panel.tsx        # DEV-only
│   │   └── theme-provider.tsx     # wraps next-themes + Tauri set_window_theme
│   ├── hooks/{use-dashboard, use-scope, use-theme, use-mobile}.ts
│   └── lib/{accounts, deployments, prefs, debug-events, format, tauri, utils}.ts
└── src-tauri/                     # Rust backend
    ├── Cargo.toml, build.rs, tauri.conf.json, Info.plist
    ├── capabilities/default.json  # Tauri permissions (incl. opener allow-list)
    ├── icons/                     # App + tray icons (template + green/yellow/red/gray/syncing)
    └── src/
        ├── main.rs, lib.rs        # setup(), invoke_handler!, window-event routing
        ├── adapters/              # Platform trait + vercel/railway/github implementations
        │   ├── mod.rs             # Platform enum, Project, Deployment, AccountProfile
        │   ├── trait.rs           # DeploymentMonitor trait + AdapterError
        │   ├── registry.rs        # AdapterRegistry — maps account_id → AdapterHandle
        │   ├── vercel/{mod,types,mapper}.rs
        │   ├── railway/{mod,client,types,mapper}.rs
        │   └── github/{mod,types,mapper}.rs
        ├── auth/
        │   ├── mod.rs             # AuthError
        │   ├── oauth.rs           # PKCE + loopback server (ports 53123-53125)
        │   ├── pat.rs             # connect_via_pat + Railway GraphQL profile fetcher
        │   ├── token_provider.rs  # get_fresh_access_token (auto-refreshes Railway)
        │   ├── vercel.rs, railway.rs, github.rs
        ├── commands/              # Tauri `#[command]` handlers (React → Rust RPC)
        │   ├── accounts.rs, deployments.rs, prefs.rs, window.rs, ux.rs
        ├── cache.rs               # In-memory DashboardState + diff
        ├── poller.rs              # Background task: hydrate → fetch → diff → notify
        ├── keychain.rs            # Unified vault in keyring (one JSON blob)
        ├── store.rs               # Account metadata (excluding tokens) in store plugin
        ├── prefs.rs               # Prefs struct + store wrapper
        ├── tray.rs                # Tray icon + context menu + health colors
        ├── window.rs              # show/hide/toggle popover + desktop, positioning
        ├── platform.rs            # macOS dock-icon visibility (ActivationPolicy)
        ├── shortcut.rs            # Global shortcut registration (toggles popover)
        ├── notifications.rs       # OS notifications on state transitions
        └── redact.rs              # Log redactor (tokens, bearer headers, JSON secrets)
```

Two stray empty files at the repo root (`src/poller.rs`, `src/window.rs`) are not compiled — they appear to be leftover from an aborted scaffold move.

---

## 4. High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                            Tiny Bell                               │
│                                                                    │
│   ┌──────────────┐       ┌─────────────────┐    ┌──────────────┐   │
│   │ React popover│◀─────▶│   Tauri IPC     │◀──▶│ React desktop│   │
│   │ (menubar UI) │ invk  │  + event bus    │    │  (settings)  │   │
│   └──────┬───────┘       └────────┬────────┘    └──────────────┘   │
│          │                        │                                │
│          │  dashboard:update      │  invoke "refresh_now"          │
│          ▼                        ▼                                │
│   ┌────────────────────────────────────────────────────────────┐   │
│   │                         Poller (tokio)                     │   │
│   │  every N s → hydrate registry → fan out to adapters →      │   │
│   │  write DashboardState → diff → emit → tray color + notify  │   │
│   └─────┬────────────────┬─────────────────┬────────────────┬──┘   │
│         ▼                ▼                 ▼                ▼      │
│   ┌──────────┐    ┌───────────┐     ┌────────────┐   ┌──────────┐  │
│   │ Vercel   │    │  Railway  │     │  GitHub    │   │  Cache   │  │
│   │ adapter  │    │  adapter  │     │  adapter   │   │  (RwLock)│  │
│   │ REST v6/9│    │ GraphQL v2│     │ Actions API│   └──────────┘  │
│   └──────────┘    └───────────┘     └────────────┘                 │
│                                                                    │
│     ┌─────────────┐         ┌───────────────┐   ┌──────────────┐   │
│     │ keychain.rs │         │ store.rs      │   │ tray.rs      │   │
│     │ OS keyring  │         │ accounts JSON │   │ icon + menu  │   │
│     └─────────────┘         └───────────────┘   └──────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

Key integration points:

- `lib.rs::run()` wires every Tauri plugin, registers **27 invoke commands**, sets up tray, window-close behavior, external-navigation plugin, initial theme, global shortcut, and autostart sync.
- State shared via `app.manage(...)`: `Arc<AdapterRegistry>`, `Arc<Cache>`, and (once started) `Arc<Poller<R>>`.
- Windows are declared statically in `tauri.conf.json` (`desktop` and `popover`) — both hidden on boot; one of them is shown in `setup()` based on whether the user has accounts.

---

## 5. Rust Backend — Deep Dive

### 5.1 Adapter Layer (`src-tauri/src/adapters/`)

**Domain model** (`mod.rs`): `Platform { Vercel | Railway | GitHub }`, `DeploymentState { Queued | Building | Ready | Error | Canceled | Unknown }`, `AccountProfile`, `Project`, `Deployment`. Everything serde-derived and `snake_case` on the wire so the React side can consume it directly.

**Contract** (`trait.rs`):
```rust
#[async_trait]
pub trait DeploymentMonitor: Send + Sync + std::fmt::Debug {
    fn platform(&self) -> Platform;
    fn account_id(&self) -> &str;
    async fn list_projects(&self) -> Result<Vec<Project>, AdapterError>;
    async fn list_recent_deployments(
        &self,
        project_ids: Option<&[String]>,
        limit: usize,
    ) -> Result<Vec<Deployment>, AdapterError>;
}
pub type AdapterHandle = Arc<dyn DeploymentMonitor>;
```
`AdapterError` cleanly separates `Unauthorized`, `RateLimited(u64)`, `Network(String)`, `Platform(String)`, `Unsupported`. The poller uses this enum to decide whether to mark an account as `NeedsReauth`, apply a cooldown, or just reuse prior state.

**Registry** (`registry.rs`): a `RwLock<HashMap<account_id, AdapterHandle>>`. `hydrate()` rebuilds the map from the persisted account list, pulling a *fresh* access token from the token provider for each enabled account. Adapters whose token fetch fails are silently skipped — a deliberate choice so a single broken account doesn't stall the whole poll.

**Vercel adapter** (`vercel/mod.rs`):
- Simple REST client. `team_id` becomes a `teamId=` query parameter on every request.
- `list_projects` → `GET /v9/projects?limit=100`.
- `list_recent_deployments` → `GET /v6/deployments?limit=<N>&projectIds=...`.
- 401/403 → `Unauthorized`. 429 reads `x-ratelimit-reset` for retry-after seconds.
- Deployments are sorted newest-first before returning.

**Railway adapter** (`railway/mod.rs`, `railway/client.rs`):
- GraphQL over `https://backboard.railway.com/graphql/v2`.
- `list_projects` uses a `me { workspaces { id name projects { edges { node { id name } } } } }` query; if `scope_id` is set (workspace filter), only projects from that workspace come back.
- `list_recent_deployments` builds a **single batched GraphQL query with aliases** (`p0: deployments(...)`, `p1: deployments(...)`, …). This minimizes round-trips across many projects.
- Project IDs are inlined into the query string; the adapter escapes `\` and `"` manually to avoid injection.
- 401/403 → `Unauthorized`; 429 → `RateLimited(60)` (fixed since Railway doesn't expose a retry-after); GraphQL `errors[0].message` → `Platform(...)`.

**GitHub adapter** (`github/mod.rs`):
- Reads user-selected "monitored repos" (max 30, capped in `commands::accounts::set_monitored_repos`).
- `list_projects` is **synthetic** — no GitHub call; it just projects the stored `monitored_repos` into `Project` shapes (`id = "owner/repo"`, `url = https://github.com/owner/repo`).
- `list_recent_deployments` iterates monitored repos and hits `/repos/{repo}/actions/runs?per_page=N`, where `N = (limit / repos.len()).max(5).min(10)` — a per-repo fairness cap.
- Rate-limit handling is the most nuanced: **403 + `x-ratelimit-remaining: 0`** is mapped to `RateLimited(reset_epoch - now)` (honors GitHub's reset-as-unix-timestamp convention), a plain 403 is treated as `Unauthorized`, and any 429 is a generic 60s cooldown.
- `User-Agent: tiny-bell` and `Accept: application/vnd.github+json` are set on every call — GitHub requires both.

Every adapter has a companion `mapper.rs` whose responsibility is translating platform-specific statuses → the unified `DeploymentState`, and extracting git-commit metadata from wildly differing shapes (Vercel's `meta.githubCommit*`, Railway's flat `meta.commitMessage`, GitHub's `head_commit.message` + `actor`).

Every adapter also ships with **wiremock-driven unit tests** covering: happy path, team/workspace filter, unauthorized, rate-limit-with-reset, missing fields. The adapter layer is the best-tested part of the codebase.

### 5.2 Authentication (`src-tauri/src/auth/`)

Three flows coexist:

1. **OAuth with PKCE + loopback server** (`oauth.rs`, `vercel.rs`, `railway.rs`, `github.rs`).
2. **Personal Access Token paste** (`pat.rs` — used for Vercel, Railway, GitHub fallback).
3. **Token refresh** (`token_provider.rs` — only Railway supports refresh today).

**Loopback server** (`oauth.rs`):
- Binds `tiny_http` to one of `[53123, 53124, 53125]` on `127.0.0.1` (first available).
- Spawns a dedicated OS thread (`oauth-loopback`) because `tiny_http` is synchronous; uses `tokio::sync::oneshot` to deliver the result back to the async caller.
- Serves a static success/failure HTML page (system-font styled) after capturing the code.
- Guards against CSRF with `constant_time_eq` against the expected `state`.
- Has a **global `Mutex<Option<ActiveServer>>` slot** so `spawn_loopback_server` always aborts any previous server first — prevents orphaned ports.
- `OAUTH_TIMEOUT_SECS = 300` wraps the receive in `tokio::time::timeout` so a user who never approves doesn't leak threads.
- Non-trivial tests: PKCE determinism, state randomness, constant-time compare, and a real bind/abort round-trip.

**Vercel OAuth** (`vercel.rs`):
- Pre-registered Vercel integration; auth URL is `https://vercel.com/integrations/<slug>/new?redirect_uri=...&state=...`.
- Uses the **integration flow** (not pure OAuth2), so no `code_challenge` is needed — PKCE is generated but discarded (`let _ = pkce;` on line 211 shows that explicitly).
- Token response may include `team_id`, in which case the account becomes a team-scoped account and `fetch_vercel_profile` hits `/v2/teams/{id}` instead of `/v2/user`.

**Railway OAuth** (`railway.rs`):
- Standard OAuth2 authorization code + PKCE (`code_challenge_method=S256`), scopes: `openid email profile offline_access workspace:viewer project:viewer`.
- Requires a `refresh_token`; if missing, returns `AuthError::Provider("Railway did not return a refresh_token")`.
- Stores the bundle as `StoredSecret::Oauth { access_token, refresh_token, expires_at_ms }`.
- 5xx and 429 from the token endpoint → `AuthError::Network` (transient), 4xx → `AuthError::Provider` (permanent).

**GitHub OAuth** (`github.rs`):
- Classic OAuth (no PKCE), scopes `repo read:user`.
- Token exchange POSTs to `/login/oauth/access_token` with `Accept: application/json` to force JSON instead of `form-urlencoded`.

**PAT flow** (`pat.rs`):
- One generic `connect_via_pat(app, platform, token, scope_id)` that delegates to `fetch_*_profile` then writes an `StoredSecret::Pat { value }` into the keychain vault.
- Railway's `me` query is used both to validate the token and to harvest profile info; a null `me` (workspace/project token) is rejected as "Invalid token".

**Token provider** (`token_provider.rs`):
```
get_fresh_access_token(account_id, platform):
  fetch StoredSecret from keychain
  if Pat { value } → return value
  if Oauth { .. } and now+60s < expires_at_ms → return access_token
  else → call refresh_tokens (Railway only) → persist → return new access_token
```
`EXPIRY_SKEW_MS = 60_000` adds a minute of slack so the poller doesn't hand out a token that will expire mid-request. Vercel and GitHub OAuth currently have no refresh path (Vercel tokens are long-lived integration tokens; GitHub doesn't return a refresh token in the classic flow).

### 5.3 Keychain Vault (`keychain.rs`)

A deliberate design choice: **one keychain entry (`service=tiny-bell`, `account=vault`) holds a JSON map** of `account_id → serialized StoredSecret`. This avoids N keychain popups on macOS and makes bulk operations atomic.

- In-memory mirror: `static VAULT: OnceCell<Arc<RwLock<HashMap<String, String>>>>`.
- `ensure_loaded()` is idempotent and runs on first access.
- `StoredSecret` is tagged (`#[serde(tag = "token_type")]`) with variants `Pat` and `Oauth`; `parse_secret` falls back to `StoredSecret::Pat { value: raw }` if the raw string doesn't start with `{`, providing backward compat with the earlier single-string format.
- `migrate_legacy_for(platform, account_id)` looks for the old `{platform}:{account_id}` keychain entry, pulls its value into the vault on first read, and deletes the legacy credential. This is invoked lazily from `get_secret`, so existing users upgrade transparently.
- `delete_token` removes both the vault entry and any legacy entry for idempotency.
- All keychain-touching tests are gated behind `#[ignore]` because they mutate real OS state.

### 5.4 Account & Prefs Storage (`store.rs`, `prefs.rs`)

Both share the same store file `tiny-bell.store.json` (via `tauri-plugin-store`), but under different keys (`"accounts"` and `"prefs"`). This keeps non-secret state inside the app's data directory while secrets stay in the keychain.

`StoredAccount` fields: `id`, `platform`, `display_name`, `scope_id`, `enabled`, `created_at`, `health` (`Ok | NeedsReauth | Revoked`), `monitored_repos: Option<Vec<String>>` (GitHub-only). The `#[serde(default)]` on `health` and `monitored_repos` makes the store forward/backward compatible.

`delete_account` also purges all three possible keychain legacy keys (`vercel:<id>`, `railway:<id>`, `github:<id>`) to be safe — vault removal is handled by `keychain::delete_token` which handles both paths.

`Prefs` defaults: `theme="system"`, `refresh_interval_ms=30_000`, `start_at_login=false`, `global_shortcut="Alt+Command+D"`, `show_in_dock=true`, `notify_on_{failure,recovery}=true`. `apply_u64("refresh_interval_ms", ..)` enforces a 5-second minimum to avoid flooding APIs.

### 5.5 The Poller (`poller.rs`)

This is the **heart of the app** and the longest module (~575 lines). It runs as a single tokio task spawned once via `ensure_started()`, guarded by a `OnceCell`.

**Cycle:**
1. `ensure_loaded()` on keychain; if it fails → mark cache offline, gray tray, bail.
2. `store::list_accounts()` → `registry.hydrate()` (fetches fresh tokens, rebuilds adapter map).
3. If no adapters → `mark_empty()`, gray tray, bail.
4. Fan out per-adapter with a **`Semaphore::new(4)`** concurrency cap. Each adapter:
   - Checks a cooldown map (`HashMap<account_id, Instant>`); if still cooling down, skip the API call and signal reuse-previous.
   - Refreshes projects only if `projects_last_fetched[account_id]` is older than `PROJECTS_REFRESH_SECS = 5min` — projects change rarely, deployments change constantly.
   - Fetches recent deployments (limit `DEPLOYMENTS_LIMIT = 100`).
5. Join results → build `DashboardState` → `cache.replace_and_diff(new_state)` returns a list of `DiffEvent` describing any deployment whose `state` changed (or appeared for the first time).
6. Compute health via `health_from_state`:
   - Look at the first deployment seen per project (they're sorted newest-first).
   - **Red** if any recent `Error` (≤ 30 min old). Else **Yellow** if any `Building`/`Queued`. Else **Green**. No projects → **Gray**.
   - `ERROR_WINDOW_MS = 30 * 60 * 1000` is the "forgiveness window" so an old error doesn't keep the tray red forever.
7. Update tray icon, emit `dashboard:update`, fire notifications **only after the first poll** (otherwise the first sync would spam notifications for every existing deployment).
8. Sleep `interval_secs` OR exit early when `force_tx.try_send(())` unblocks `rx.recv()` (used by the "Refresh now" button, by showing the popover, by connecting a new account).

**Health-signal feedback loop:** if an account returns `Unauthorized`, the poller writes `AccountHealth::NeedsReauth` back into the store and emits `accounts:changed` so the desktop settings UI can show a warning badge.

**Cooldowns:** on `RateLimited(secs)`, an entry `until = now + secs` is inserted into `cooldowns` and the next poll reuses previous projects+deployments (via `copy_account_from_prev`), preventing rate-limit amplification.

**Error window vs interval defaults:** `DEFAULT_INTERVAL_SECS = 15` (poll loop), `PROJECTS_REFRESH_SECS = 300` (per-account project-list staleness), `ERROR_WINDOW_MS = 30min` (tray red duration). `set_interval_secs` clamps input to `[5, 600]`.

Unit tests cover `health_from_state` across all branches including the "red overrides yellow" and "old errors don't count" cases.

### 5.6 Cache (`cache.rs`)

An `RwLock<DashboardState>` wrapper. The interesting method is `replace_and_diff`, which:
1. Swaps in the new state.
2. Builds a `HashMap<deployment_id, &Deployment>` from the *previous* snapshot.
3. For each deployment in the new state whose state differs from the previous (or is new), emits a `DiffEvent { project_id, project_name, deployment_id, previous, current }`.
4. Resolves `project_name` against the incoming projects list so notifications are human-readable.

Only `Ready`, `Error`, `Canceled` transitions actually fire notifications in `notifications.rs`; Queued/Building changes are intentionally silent.

### 5.7 Tray & Windows (`tray.rs`, `window.rs`, `platform.rs`)

**Tray** (`tray.rs`):
- Six health levels: `Setup, Syncing, Gray, Green, Yellow, Red`. Each has a pre-rendered PNG in `src-tauri/icons/tray/tray-<name>@2x.png` baked into the binary via `include_bytes!`.
- `is_template()` returns true for neutral states (`Setup`, `Syncing`, `Gray`) — macOS renders those as template icons that respect dark-mode menu-bar colors. Colored states are rendered directly (not templated) so the green/red hue actually shows.
- Left-click behavior: `route_primary_action` — if no accounts, open the desktop onboarding; otherwise toggle the popover.
- Context menu: Open, Refresh Now, Settings…, Quit. Keyboard accelerators on each (`Cmd+O`, `Cmd+R`, `Cmd+Q`).

**Windows** (`window.rs`):
- `show_popover` computes its own position from the tray rect: centered under the tray icon, y = 28pt, clamped to x ≥ 8 so it never clips off-screen. On show, it force-refreshes the poller so users always see current data.
- **Focus-lost hides the popover** (handled in `lib.rs::on_window_event` for `"popover"` + `WindowEvent::Focused(false)`).
- **Desktop close is prevented** — `close_requested` calls `hide_desktop` instead, and fires a one-shot `desktop:close-hint` event (guarded by `CLOSE_HINT_FIRED: AtomicBool`) so the React side can show the "we kept the app in the menu bar" dialog exactly once.
- `set_visible_dock(app, visible)` on macOS toggles `ActivationPolicy::Regular` vs `Accessory` — this is how the app hides its dock icon when only the menubar is in use.

### 5.8 Redactor (`redact.rs`)

A log-output filter built from four regexes, chained in order:
1. `Bearer <token>` in headers → `Bearer ***`
2. JSON pairs like `"token":"..."` (keys: token, access_token, refresh_token, authorization, code, client_secret, code_verifier, password, api_key)
3. `key="..."` quoted assignments
4. `key=value` plain assignments

Hooked into `tauri-plugin-log`'s format callback so every `log::info!("…token=abc…")` is scrubbed before hitting stdout or the rotating log file. Tests verify both redaction correctness and that non-sensitive strings pass through untouched.

### 5.9 Tauri Command Surface

27 commands registered in `lib.rs::run()`, organized by module:

| Module | Commands |
|---|---|
| `accounts` | `start_oauth`, `connect_with_token`, `cancel_oauth`, `list_accounts`, `delete_account`, `set_account_enabled`, `rename_account`, `validate_token`, `hydrate_adapters`, `list_github_repos`, `set_monitored_repos` |
| `deployments` | `get_dashboard`, `refresh_now`, `set_poll_interval`, `get_poll_interval`, `open_external` |
| `window` | `open_desktop`, `close_desktop`, `show_popover`, `hide_popover`, `toggle_popover`, `quit_app`, `get_autostart`, `set_autostart` |
| `ux` | `has_seen_close_hint`, `mark_close_hint_seen`, `dev_reset` (debug-only) |
| `prefs` | `get_prefs`, `set_pref`, `set_window_theme` |

`set_pref` applies side effects inline (updating poll interval, dock visibility, registering a new global shortcut, toggling autostart) and emits `prefs:changed` so other windows reflect changes in real-time.

`start_oauth` and `connect_with_token` both call `rehydrate_after_change` at the end, which (1) hydrates the adapter registry, (2) ensures the poller is running, (3) force-refreshes, and (4) emits `accounts:changed`.

### 5.10 Capabilities & CSP

`src-tauri/capabilities/default.json`:
- Grants default permissions for core, opener, log, store, notification, autostart, global-shortcut.
- Narrows `opener:allow-open-url` to only Vercel, Railway, and GitHub domains — external links outside those still work via the custom `external-navigation` plugin, but only these domains can be invoked from Tauri IPC.

`tauri.conf.json` CSP restricts `connect-src` to `ipc:`, `http://ipc.localhost`, `api.vercel.com`, `backboard.railway.{app,com}`, `api.github.com`, etc. This is the last-ditch defense if a supply-chain issue tries to exfiltrate tokens — the webview simply can't connect to attacker domains.

The **`external_navigation_plugin`** (`lib.rs`) intercepts any navigation to non-internal URLs and hands them off to the system browser via the opener plugin. This is what stops `<a target="_blank">` from opening new webview windows.

---

## 6. Frontend — Deep Dive

### 6.1 Bootstrap (`src/main.tsx`)

The same Vite bundle serves both windows. `loadRoot()`:
1. If `import.meta.env.DEV && !isTauri()` → load the `DevSandbox` (pure-browser component preview).
2. Else read `getCurrentWindow().label`:
   - `"popover"` → code-split import `@/app/popover/popover-app`.
   - Anything else → `@/app/desktop/desktop-app`.
3. Renders under `<ThemeProvider>`, with `<ExternalLinkGuard>` (catches stray `<a href>` clicks and routes through `open_external`), a DEV-only `<DebugPanel>`, and a shared `<Toaster>`.

### 6.2 Popover App (`src/app/popover/popover-app.tsx`)

The most logic-dense React file. Responsibilities:

- **Data subscription:** `useDashboard()` hook seeds state via `get_dashboard`, then subscribes to `dashboard:update` events and re-renders.
- **Scope management:** `useScope()` persists the currently selected account (or `"all"`) in localStorage; command shortcuts `Cmd+0..9` switch scope fast.
- **Filter state:** project multi-select with automatic pruning when scope changes (effect on lines 108-117).
- **Grouping:** deployments are grouped by account (not project) — the UI is account-first.
- **Keyboard model:** `Escape` hides the popover, `Cmd+R` refreshes, `Cmd+,` opens settings, `Cmd+Q` quits, `Cmd+N` opens onboarding, `Cmd+0..9` switches scope, `ArrowUp/Down` moves focus between deploy rows.
- **On focus gained** (`getCurrentWindow().onFocusChanged`): reloads accounts — guards against stale account state after the desktop window added/deleted one.

Visual states are explicit first-class components: `PopoverLoading`, `PopoverEmpty`, `PopoverNoAccounts`, `OfflineBanner`, `RateLimitBanner`, `PopoverOffline` under `components/popover/states/`.

### 6.3 Desktop App (`src/app/desktop/desktop-app.tsx`)

Two routes driven by a Tauri event `desktop:route`:
- **`onboarding`** — first-run flow (`views/onboarding-view.tsx`): "Connect Vercel / Railway / GitHub" with platform icons.
- **`settings`** / **`about`** — tabbed settings (`views/settings-view.tsx`) with three tabs: Accounts, General, About (under `views/settings/`).

Event listeners: `desktop:route` (nav), `accounts:changed` (reload), `desktop:close-hint` (show the one-time "we're in the menu bar" modal).

### 6.4 Shared libs (`src/lib/`)

- `tauri.ts` — wraps `invoke` with `trackedInvoke` (adds optional debug-panel instrumentation) and an `isTauri()` guard.
- `accounts.ts` — typed wrappers over every accounts-related command + a friendly auth-error translator that maps Rust `AuthError` variants into user-facing copy ("The provider rejected this token.", "Your Railway session expired. Please reconnect.", etc.).
- `deployments.ts` — dashboard state types + `deploymentsApi.{getDashboard, refreshNow, setPollInterval, openExternal, hydrateAdapters}`.
- `prefs.ts` — prefs typing and default object. `DEFAULT_PREFS` mirrors the Rust defaults.
- `format.ts`, `utils.ts` — `cn()` + date/duration helpers.
- `debug-events.ts` — dev-only event-bus.

### 6.5 Design System

Two layered component folders:
- **`components/ui/`** — stock shadcn/ui primitives (button, dialog, dropdown, tabs, toast via sonner, etc.).
- **`components/dr/`** — higher-level product primitives: `status-glyph` (the Ready/Building/Error icon), `provider-chip`, `provider-mark`, `initials-avatar`, `kbd` (keyboard shortcut chips), `tabs`, `menu`, `button`, etc. These encode product-specific behaviors (e.g. the status glyph animates for `Building`).

Colors live in `src/index.css` as OKLch-based CSS variables (per `docs/system-design.md`), with `tw-animate-css` powering Building pulses and `next-themes` handling light/dark.

---

## 7. Build, Dev, Release

- `pnpm dev` — Vite only (React hot-reload without Tauri); `main.tsx` detects this and loads `DevSandbox`.
- `pnpm tauri dev` — launches the full app. `beforeDevCommand` is `bun run dev` (note: package.json scripts are pnpm-first but Tauri calls `bun`; both must be installed, or update the config).
- `pnpm typecheck`, `pnpm lint`, `pnpm format` — TS/ESLint/Prettier.
- `cd src-tauri && cargo test --lib` — runs the Rust unit tests (keychain/OS tests are `#[ignore]`-gated).

**`build.rs`** is doing heavy lifting:
- Loads `.env.local` / `.env` from the workspace root via `dotenvy`.
- Exports `VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET`, `VERCEL_INTEGRATION_SLUG`, `RAILWAY_CLIENT_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` as `rustc-env` so the auth modules compile with `env!(..)` pointing at build-time constants.
- If any are empty in a `release` profile, prints a cargo warning telling the maintainer OAuth will fall back to paste-token.
- `cargo:rerun-if-env-changed=...` declared for each var.

Consequence: **the binary has OAuth client IDs embedded at build time**. There is no runtime config for switching OAuth clients.

**Release profile** (`Cargo.toml`): `codegen-units = 1`, `lto = true`, `opt-level = "s"`, `panic = "abort"`, `strip = true` — optimized for small DMG bundles.

**CI/CD** (`.github/workflows/`):
- `ci.yml` — typecheck + `cargo test --lib`.
- `release.yml` — matrix build for macOS arm64 + x86_64, produces unsigned DMGs (uses GITHUB_TOKEN).

---

## 8. Security Posture

Stacked layers:

1. **Tokens in OS keychain, never in the store file.** The keychain is a single vault entry to minimize popups; account metadata (id, display name, health, scope) is the only thing on disk.
2. **PKCE on Railway OAuth**, state verified with `constant_time_eq` on every flow.
3. **Loopback server** only listens on `127.0.0.1` and only for the one expected `state`. Any other request reads the URL but rejects on state mismatch.
4. **Log redactor** scrubs tokens from any `log::*!` call before the log plugin writes to stdout/disk.
5. **CSP** restricts `connect-src` to whitelisted platform domains.
6. **Tauri capability** narrows `opener:allow-open-url` to the same three domains.
7. **External-navigation plugin** prevents in-webview navigation to any non-local URL.
8. `content-security-policy` blocks inline scripts outside `'self' 'unsafe-inline'` (the `'unsafe-inline'` is needed because Vite bootstraps via inline scripts in the built HTML).

Weak points to note:
- GitHub OAuth uses no PKCE (classic flow, client-secret-in-binary). This is standard for the classic flow but worth knowing — GitHub Apps would be more secure.
- `show_in_dock` defaults to true; a truly zero-chrome menubar app would default to false, but this choice matches the "familiar first-run" PRD goal.
- Some console logs still get through during OAuth flow (e.g., `log::info!("OAuth authorize → slug={}, redirect_uri={}")`) but the redactor catches token-bearing ones.

---

## 9. Key Events (Rust → React)

| Event | Payload | When emitted |
|---|---|---|
| `dashboard:update` | `DashboardState` | After every poll cycle |
| `accounts:changed` | `()` | Account added/removed/health-changed/enabled toggled |
| `prefs:changed` | `Prefs` | After `set_pref` |
| `oauth:complete` | `AccountProfile` | After successful OAuth token exchange |
| `desktop:route` | `string` ("onboarding"/"settings"/"about") | `show_desktop(app, route)` |
| `desktop:close-hint` | `()` | First time the user hits the close button |
| `popover:show` | `()` | `show_popover` — triggers account reload |

---

## 10. Noteworthy Patterns & Design Choices

- **Single-JSON keychain vault** over per-account keychain entries — slashes popup friction on macOS and simplifies atomic deletion.
- **Trait-based adapters with a registry map** make adding a new platform a single file plus one match-arm addition in `registry.rs` and one variant in `Platform`.
- **Batched GraphQL for Railway** (aliased `p0, p1, …` queries) minimizes latency across many projects — a deliberate optimization.
- **Projects cache with staleness timer** (`PROJECTS_REFRESH_SECS = 5min`) separates the slow-changing catalog from the fast-changing deployment list.
- **Cooldown map as lightweight circuit-breaker** — a rate-limited account simply re-renders previous data while the cooldown is active.
- **First-poll suppression of notifications** via `AtomicBool first_poll_done` — prevents a notification storm on launch.
- **Dock-icon visibility controlled by `ActivationPolicy`** — cleaner than spawning a hidden window or using a fake dock item.
- **Synthetic GitHub projects** (no upfront `list_repositories` at startup — the user explicitly selects up to 30) keeps the GitHub Actions integration fast and scoped.
- **Build-time injection of OAuth secrets via `build.rs`** — no runtime config, no plain-text secrets on disk.
- **Two windows sharing one bundle** — reduces cold-start overhead and keeps the frontend maintainable; selection happens on `window.label`.
- **Tray icon semantics encode business logic**: the 30-minute error window prevents a one-off broken deploy from keeping the tray red indefinitely.

---

## 11. Loose Ends / Things to Watch

- `src/poller.rs` and `src/window.rs` at the repo root are zero-byte files. Harmless but clutter.
- `tauri.conf.json` uses `bun run dev` in `beforeDevCommand` while `package.json`, `pnpm-lock.yaml`, and README tell you to use `pnpm`. A small inconsistency.
- `Dev Radio Design _standalone_.html` (1.4 MB) and `dev-radio-logo.png` under repo root are legacy design artifacts from the rename; still referenced by `docs/` but not by the app.
- `plan.md` (46 KB) is the original implementation plan that predates most of the current code — useful as historical context, but no longer a spec-of-truth; `README.md` and this file are more current.
- `.conductor/` exists but is empty; related to a Conductor dev workflow the repo once used.
- `src-tauri/gen/` contains Tauri-generated files including macOS code signing entitlements — ensure it stays gitignored for signing keys.
- No E2E tests — validation relies on unit-level adapter tests and manual QA for the UI flows. The PRD lists success metrics (cold-start < 800ms, RSS < 120MB) but there's no automated check for them.
- **Vercel PKCE is generated then discarded** — not broken (the integration flow doesn't require it), but a dead allocation that could be cleaned up.
- `migrate_legacy_entries` in `keychain.rs` is a no-op body; real per-account migration happens in `migrate_legacy_for` called lazily from `get_secret`. The stubbed function is a leftover scaffold.

---

## 12. One-Sentence Takeaway

Tiny Bell is a tightly-scoped, well-layered Tauri app whose backend carries most of the complexity (async polling, adapter registry, keychain vault, OAuth loopback, diff-driven notifications) while the frontend focuses on glanceable UI — the adapter trait, the single-entry keychain vault, and the cooldown-aware poll loop are the three patterns worth stealing.
