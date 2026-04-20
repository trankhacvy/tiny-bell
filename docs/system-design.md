# DESIGN SYSTEM SPECIFICATION

> Updated 2026-04-20 to match the shipping v0.1.0 UI. The product is now **Tiny Bell** (earlier drafts used the code name **Dev Radio**). The actual implementation uses Tailwind v4 with OKLch-based CSS variables, shadcn/ui primitives, and a product-layer set of components under `src/components/dr/`.

---

## 1. Product Vision & Design Principles

1. **Ambient, not intrusive.** A green tray icon is the best UI. The app speaks only when something changes.
2. **Native first.** Respect OS idioms — macOS menu-bar templates, Windows notification patterns, Linux tray conventions.
3. **Glanceability over density.** Every screen answers one question in under two seconds; depth is a click away.
4. **Keyboard-native.** Every action reachable without a mouse; power users rule their tools.
5. **Honest states.** Loading, empty, error, offline, rate-limited, and no-accounts are first-class designs — never afterthoughts.

---

## 2. Visual Identity & Branding

- **Name:** Tiny Bell
- **Tagline:** *Tune in to your deploys.* (Cargo description: *"A quiet menubar app for monitoring your deploys"*.)
- **Logo concept:** A small bell mark — hence the name. Legacy "radio waves" artwork (`dev-radio-logo.png`) is retained in the repo root for historical reference only; the shipping app icon is `app-icon.png`.
- **Voice / tone:** Matter-of-fact, technical, zero fluff. Confirmations use verbs ("Connected", "Deployment ready"), errors surface the platform's exact message where safe.

---

## 3. Color System (OKLch tokens)

### 3.1 Tokens

Colors are defined as CSS variables in `src/index.css` using the **OKLch** color space (not hex). A light-mode `:root { --… }` block and a `.dark { --… }` override drive both themes. Tailwind v4 reads them via `@theme inline { --color-… : var(--…) }`.

| Semantic token | Role |
|---|---|
| `--background`, `--foreground` | Body surface & text |
| `--surface`, `--surface-foreground` | Window chrome |
| `--muted`, `--muted-foreground` | Secondary copy |
| `--card`, `--card-foreground` | Elevated surfaces |
| `--border`, `--input`, `--ring` | Borders, inputs, focus ring |
| `--primary`, `--primary-foreground` | Brand accent + contrast text |
| `--accent`, `--accent-foreground` | Hover / active |
| `--destructive`, `--destructive-foreground` | Errors and dangerous actions |
| `--status-ready`, `--status-building`, `--status-queued`, `--status-error`, `--status-canceled`, `--status-offline` | Deployment state colors |
| `--popover`, `--popover-foreground` | Popover window bg / text |

All components reference variables via Tailwind utility classes (e.g. `bg-surface text-foreground`). No component hard-codes hex values.

### 3.2 Semantic Status Colors

Both the React layer (`components/dr/status-glyph.tsx`) and the Rust layer (`src-tauri/src/poller.rs::health_from_state`) are driven by the same `DeploymentState` enum:

| State | Token | Intent | Icon |
|---|---|---|---|
| Ready | `--status-ready` | Success, finished | Lucide `CircleCheck` |
| Building | `--status-building` | Actively building | Lucide `Loader2` (spinning unless `prefers-reduced-motion`) |
| Queued | `--status-queued` | Waiting in queue | Lucide `Clock` |
| Error | `--status-error` | Failed build | Lucide `CircleX` |
| Canceled | `--status-canceled` | Aborted / skipped | Lucide `Ban` |
| Offline | `--status-offline` | Cache reused, no network | Lucide `WifiOff` |

### 3.3 Tray Icon Color Rules (aggregate)

Computed in `src-tauri/src/poller.rs::health_from_state`:

| Aggregate condition | Tray state |
|---|---|
| No projects (or no accounts) | **Gray** |
| Any latest deployment in `Error` within the last **30 min** (`ERROR_WINDOW_MS`) | **Red** |
| Else, any latest deployment `Building` or `Queued` | **Yellow** |
| Else, all latest deployments `Ready` | **Green** |
| App is mid-first-poll / mid-force-refresh | **Syncing** |
| First launch, no accounts yet | **Setup** |

Only the first deployment seen per project counts (they are pre-sorted newest-first), so an old Error doesn't override a current Ready.

### 3.4 Tray icon rendering

The tray module (`src-tauri/src/tray.rs`) ships **six pre-rendered PNGs** baked in via `include_bytes!`:

```
icons/tray/tray-template@2x.png
icons/tray/tray-gray@2x.png
icons/tray/tray-green@2x.png
icons/tray/tray-yellow@2x.png
icons/tray/tray-red@2x.png
icons/tray/tray-syncing@2x.png
```

On macOS, `HealthLevel::is_template()` returns `true` for the neutral states (`Setup`, `Syncing`, `Gray`), so those render as proper template icons (black + alpha) that respect menu-bar appearance. Colored states (`Green`, `Yellow`, `Red`) call `set_icon_as_template(false)` so the hue actually shows.

---

## 4. Typography

System-native stacks preserve the native feel and avoid font-loading cost. Tiny Bell additionally ships `@fontsource-variable/inter` as a fallback on systems without a modern UI font; the stack prefers the OS default where available.

```css
font-family:
  -apple-system, BlinkMacSystemFont,
  "Segoe UI Variable", "Inter Variable", Inter,
  system-ui, sans-serif;
font-family: ui-monospace, SFMono-Regular, Menlo, "Cascadia Code", monospace;
```

### Scale

| Role | Tailwind | Usage |
|---|---|---|
| Display | `text-lg font-semibold tracking-tight` | Desktop window section headers |
| Title | `text-base font-medium` | Project name, dialog titles |
| Body | `text-sm` | Default body text |
| Caption | `text-xs text-muted-foreground` | Timestamps, row metadata |
| Code / SHA | `text-xs font-mono` | Commit SHAs, URLs |

---

## 5. Iconography

**Library:** `lucide-react`.

### Actual icon usage

| Purpose | Icon |
|---|---|
| App logo mark | Custom SVG (bell) |
| Platform: Vercel | `src/assets/providers/vercel.svg` |
| Platform: Railway | `src/assets/providers/railway.svg` |
| Platform: GitHub | `src/assets/providers/github.svg` |
| Status: Ready | `CircleCheck` |
| Status: Building | `Loader2` (rotate) |
| Status: Queued | `Clock` |
| Status: Error | `CircleX` |
| Status: Canceled | `Ban` |
| Refresh | `RefreshCw` |
| Settings | `Settings` |
| Account | `User` / `Users` |
| Add | `Plus` |
| External link | `ExternalLink` |
| Quit | `Power` |
| Offline | `WifiOff` |

### Tray icon sizes

| OS | Sizes | Notes |
|---|---|---|
| macOS | 22 pt visual; embedded as `@2x` PNG | Template rendering for neutral states |
| Windows | Pre-rendered PNGs re-used from bundle | Shipped but not yet CI-released |
| Linux | Pre-rendered PNGs re-used from bundle | Shipped but not yet CI-released |

---

## 6. Windows & Composition

Tiny Bell has **one Vite bundle** serving **two Tauri windows**. `src/main.tsx` reads `getCurrentWindow().label` and dynamically imports the right root:

- `popover` → `PopoverApp`
- `desktop` → `DesktopApp`

### 6.1 Popover Window (`src/app/popover/popover-app.tsx`)

**Geometry:** `380 × 600`, fixed-size, frameless, `alwaysOnTop: true`, `skipTaskbar: true`, `shadow: true`. Positioned by `src-tauri/src/window.rs::show_popover` under the tray icon at `y = 28pt`, `x = tray_center − 190`, clamped to `x ≥ 8`.

**Layout:**

```
┌─────────────────────────────────────────┐
│  🔔  status summary        ↻  ⚙  close  │  ← Header (PopoverHeader)
├─────────────────────────────────────────┤
│  Scope: [ All ▾ ]   Projects: [ ▾ ]     │  ← FilterBar
├─────────────────────────────────────────┤
│  Maya (Vercel)                       3   │  ← AccountGroupHeader
│    ● acme-web    2m ago   production     │  ← DeployRow
│    ● landing     Building…   preview     │
│  Acme Team (Vercel)                  1   │
│    ● docs        Ready      production   │
│  Maya (GitHub)                       2   │
│    ● api/CI      5m ago     push         │
│                                         │
├─────────────────────────────────────────┤
│ Last updated 4s ago · 30s interval       │  ← PopoverFooter
└─────────────────────────────────────────┘
```

**Components referenced** (under `src/components/popover/`):
- `popover-header.tsx` — title + refresh button + settings/close
- `filter-bar.tsx` + `project-filter.tsx` — scope tabs + multi-select
- `account-group-header.tsx` — group label with per-group count
- `deploy-row.tsx` — one row per deployment, click-to-open
- `popover-footer.tsx` — last-refreshed + interval label
- `states/{loading,empty,no-accounts,offline,offline-banner,rate-limit}.tsx` — first-class state views
- `stacked-avatars.tsx`, `icon-button.tsx` — shared primitives

**Scope model** (`src/hooks/use-scope.ts`):
- `scope: "all" | <account_id>` (persisted in `localStorage`).
- Deployments and projects are filtered to the scoped accounts before the project-multi-select is applied.
- When scope changes invalidate a previously-selected project, the selection is pruned (effect in `popover-app.tsx`, lines 108–117).

**On focus change**, the popover reloads account data and re-subscribes to `accounts:changed`. Focus-lost hides the popover (`lib.rs::on_window_event` for `"popover"` + `WindowEvent::Focused(false)`).

### 6.2 Desktop Window (`src/app/desktop/desktop-app.tsx`)

**Geometry:** `560 × 680`, `minWidth: 480`, `minHeight: 560`, frameless, resizable, centered on show.

**Routes** (driven by the `desktop:route` Tauri event):
- `onboarding` → `OnboardingView` — first-run Connect-Vercel / Railway / GitHub actions.
- `settings` → `SettingsView` with tabs: **Accounts**, **General**, **About**.
- `about` → same `SettingsView` but with the About tab pre-selected.

**Close behavior:** the Rust window handler intercepts `CloseRequested` and calls `hide_desktop` instead, so the app never actually dies when the user closes the window. The first time this happens, `desktop:close-hint` fires (guarded by `CLOSE_HINT_FIRED: AtomicBool`) and the React layer shows `CloseHintDialog` — a one-time "we kept the app in the menu bar" message.

### 6.3 Component layer

Two folders, deliberately kept separate:

| Folder | Purpose |
|---|---|
| `src/components/ui/` | Unmodified shadcn/ui primitives (`button`, `dialog`, `dropdown-menu`, `tabs`, `toast/sonner`, …) |
| `src/components/dr/` | Product-layer primitives: `status-glyph`, `provider-chip`, `provider-mark`, `initials-avatar`, `kbd`, `tabs`, `menu`, `window`, `button`, `input`, `icon` — enforce Tiny Bell's tone/spacing/behavior |

Reason for the split: shadcn/ui primitives stay vanilla so upgrades are painless; opinionated product behavior (e.g. the Building glyph pulses; the provider chip pairs name+icon+avatar consistently) lives one layer up in `dr/*`.

### 6.4 Account & onboarding dialogs

Under `src/components/account/`:
- `add-account-dialog.tsx` — the "Add account" shell.
- `add-account-form.tsx` — per-platform forms (Vercel / Railway / GitHub), exposes OAuth button + paste-token fallback.
- `repo-selector.tsx` — the GitHub monitored-repo picker (list of pushed repos, checkboxes, 30-repo cap).

---

## 7. Layout & Spacing

- **Base spacing unit:** 4 px (Tailwind `space-1`). Component vertical rhythm: 8 / 12 / 16 / 24.
- **Popover rows:** account header `32 px`, deploy row ~`56 px` (two-line metadata: project/service + commit; timestamp right-aligned).
- **Container padding:** rows `px-3 py-2`, cards `p-4`, dialog panes `p-6`.
- **Dividers:** `border-b border-border` for header/footer; list rows rely on hover states rather than visible rules.
- **Safe area:** 8 px min gap between popover edge and tray, enforced by the positioning logic in `src-tauri/src/window.rs`.

---

## 8. Interaction Patterns

### 8.1 Tray click

All OSes use the same behavior (`tray.rs::route_primary_action`):

| Action | Behavior |
|---|---|
| Left click | No accounts → open desktop `onboarding`. Has accounts → toggle popover. |
| Right click | Context menu: Open Tiny Bell (`Cmd+O`) · Refresh Now (`Cmd+R`) · Settings… · Quit (`Cmd+Q`) |

No OS-specific "native menu only on macOS" mode today — the popover is the primary UI everywhere.

### 8.2 Hover states

- Row: `hover:bg-muted/40 transition-colors duration-75`.
- Button ghost: `hover:bg-accent`.
- Status glyph: unchanged on hover (informational, not a target).

### 8.3 Keyboard shortcuts

Global (configurable, default `Alt+Command+D`): toggle popover from anywhere. Registered via `tauri-plugin-global-shortcut` in `src-tauri/src/shortcut.rs`.

Inside the popover (`popover-app.tsx::onRootKeyDown`):

| Key | Action |
|---|---|
| `Escape` | Hide popover |
| `↑` / `↓` | Move focus between deploy rows |
| `Enter` | Activate focused row (opens inspector URL) |
| `⌘ R` | Force refresh now |
| `⌘ ,` | Open desktop `settings` |
| `⌘ Q` | Quit app |
| `⌘ N` | Open desktop `onboarding` (add account) |
| `⌘ 0` | Scope: All accounts |
| `⌘ 1` … `⌘ 9` | Scope: nth account |

> Shortcuts from earlier drafts (`1/2/3/4` for filter tabs, `⌘+Shift+R` for redeploy, `→`/`←` for detail-panel navigation) are **not implemented** — row actions and the detail panel are deferred out of v1.

### 8.4 External link handling

Two defenses (because webview navigations can come from unexpected sources):

1. **React `ExternalLinkGuard`** — catches clicks on `<a href>` with external targets and routes them through `open_external` (which calls `tauri-plugin-opener`).
2. **Rust `external_navigation_plugin`** (`lib.rs`) — on every `on_navigation`, if the URL isn't `tauri:` / `localhost` / `127.0.0.1` / `tauri.localhost`, it's handed off to the system browser and the in-webview navigation is cancelled.

---

## 9. Platform-Specific Adaptations

| Concern | macOS | Windows | Linux |
|---|---|---|---|
| Tray image | Template PNG for neutral states; colored for Green/Yellow/Red | Colored PNGs | Colored PNGs (indicator) |
| Popover position | Centered under tray icon, 28pt from top | Placeholder position (same logic) | Placeholder (same logic) |
| Dock icon | Toggled via `ActivationPolicy::{Regular, Accessory}` based on `show_in_dock` pref | n/a | n/a |
| Menu on click | Popover (no NSMenu) | Popover | Popover |
| Notifications | `tauri-plugin-notification` → `UNUserNotificationCenter` | Windows Toast | `libnotify` |
| Autostart | `LaunchAgent` plist via `tauri-plugin-autostart` | Registry `Run` key | `.desktop` in autostart dir |
| Window chrome | Frameless, `decorations: false`, rounded via CSS | Frameless, rounded via CSS | Frameless, rounded via CSS |
| Close | Hidden — `decorations: false`; `Escape` / focus-lost dismiss | Same | Same |
| Releases in CI | ✅ arm64 + x86_64 DMG | ⏳ future | ⏳ future |

---

## 10. Accessibility Requirements

- **Contrast:** OKLch tokens tuned for WCAG AA (4.5:1 body, 3:1 ≥18 pt). Status badges convey state via **both** color and icon shape — never color alone.
- **Focus:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` on every interactive element.
- **ARIA:** `role` attributes on list containers; every icon-only button has `aria-label`. The popover footer (last-refreshed, interval) uses `aria-live="polite"`.
- **Reduced motion:** The `Loader2` building glyph and the row activation pulse respect `prefers-reduced-motion` by collapsing to static presentations.
- **Screen readers:** Tray tooltip and every icon-only button have accessible labels.
- **Zoom:** Popover scales with OS text-size up to 150 % without horizontal scroll (the `380 px` content width uses internal grid layouts that wrap).
- **Color-blind safety:** Each status conveys meaning via icon shape (check / cross / clock / ban / spinner / wifi-off).

---

## 11. Dark / Light Mode Strategy

- `components/theme-provider.tsx` wraps `next-themes` and mirrors the current value into the Rust side by calling `set_window_theme` (which sets `tauri::Theme` on all webview windows so the webview chrome matches).
- Default: **System** — listen to OS appearance.
- All color tokens reference CSS variables; no hardcoded hex in components.
- Popover background uses `bg-surface` + subtle shadow; on macOS the window's own shadow and rounded corners blend with the menu-bar aesthetic.

---

## 12. Animation & Micro-interactions

All motion durations ≤ 200 ms. `tw-animate-css` supplies a few keyframes (subtle pulse for Building); no other external animation lib.

| Element | Motion | Duration | Easing |
|---|---|---|---|
| Popover appear | Fade + scale 0.98 → 1.0 | 140 ms | `ease-out` |
| Row hover | `transition-colors` | 75 ms | `ease-in-out` |
| Filter tab change | Underline slide | 120 ms | `ease-out` |
| Building glyph | Rotate `Loader2` | 1 s linear | — |
| Status change pulse | One-shot ring ping on the row that just changed state | 500 ms | `ease-out` |
| Toast (`sonner`) | Slide-up + fade | ~160 ms | `ease-out` |

**Forbidden:** bouncy springs, parallax, decorative loops, passive color fades on status changes (use the one-shot ping only). All transitions collapse to `duration-0` under `prefers-reduced-motion`.

---

## 13. States Catalog

The popover treats empty / loading / error / offline as first-class views, each rendered as a dedicated component under `src/components/popover/states/`:

| State | Component | When |
|---|---|---|
| No accounts | `no-accounts.tsx` | Store has zero `StoredAccount` entries (pre-onboarding — shouldn't happen because onboarding opens the desktop window, but handled defensively) |
| Loading | `loading.tsx` | Dashboard cache empty + dashboard loading (`useDashboard`) |
| Empty | `empty.tsx` | Has accounts and projects exist, but filter or scope yields zero rows |
| Offline banner | `offline-banner.tsx` | Sticky banner atop the list when `state.offline === true`; dims list content via `pointer-events-none opacity-65` |
| Offline panel | `offline.tsx` | Full-panel offline (reserved) |
| Rate-limited | `rate-limit.tsx` | Reserved for future explicit rate-limit UX |

---

## 14. Implementation Checklist (for contributors)

- [x] **Milestone #1 — Tray & IPC Foundation** — tray icon, frameless popover anchored to tray, Rust↔React `invoke` plumbing.
- [x] **Milestone #2 — Adapter Architecture & Vercel Client** — `DeploymentMonitor` trait, domain models, `AdapterRegistry`, wiremock-driven tests.
- [x] **Milestone #3 — Keychain, Settings, First-Run Onboarding** — single-entry keychain vault, `tauri-plugin-store`, onboarding desktop window, paste-token + OAuth for Vercel.
- [x] **Milestone #4 — Polling Engine, Cache, Tray State Machine, Notifications** — Tokio poller with cooldowns, diff-driven emission, `tauri-plugin-notification`, first-poll suppression.
- [x] **Milestone #5 — Railway Adapter + OAuth + Refresh** — Railway GraphQL adapter with batched deployments, PKCE authorization code flow, auto-refresh via `token_provider`.
- [x] **Milestone #6 — GitHub Actions Adapter** — classic OAuth, monitored-repo selector, per-repo workflow-run fetch.
- [x] **Milestone #7 — macOS Release** — arm64 + x86_64 DMG via GitHub Actions.
- [ ] **Milestone #8 — Row Actions** — Copy URL, Copy SHA, Redeploy where supported (requires extending trait with an `ActionSupport` capability).
- [ ] **Milestone #9 — Project Detail Panel** — slide-in panel with deployment history.
- [ ] **Milestone #10 — Per-account / per-project notification mutes**.
- [ ] **Milestone #11 — Windows + Linux installers**.
- [ ] **Milestone #12 — macOS notarization & code signing**.
