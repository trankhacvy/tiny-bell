# DESIGN SYSTEM SPECIFICATION

## 1. Product Vision & Design Principles

1. **Ambient, not intrusive.** A green tray icon is the best UI. The app speaks only when something changes.
2. **Native first.** Respect OS idioms — macOS menu bar templates, Windows notification patterns, Linux tray conventions.
3. **Glanceability over density.** Every screen answers one question in under two seconds; depth is a click away.
4. **Keyboard-native.** Every action reachable without a mouse; power users rule their tools.
5. **Honest states.** Loading, empty, error, and offline are first-class designs — never afterthoughts.

---

## 2. Visual Identity & Branding

- **Name:** Dev Radio
- **Tagline:** *Tune in to your deploys.*
- **Logo concept:** A minimalist broadcast-signal mark — three concentric radio waves emanating from a single dot, forming a stylized "R". Works as monochrome template on macOS (12×12–22×22 pt) and as full-color app icon. The dot itself is the aggregate-status color in the colored app icon.
- **Voice/tone:** Matter-of-fact, technical, zero fluff. Confirmations use verbs ("Redeployed", "Connected"), errors surface the platform's exact message.

---

## 3. Color Palette

### 3.1 Brand & Neutrals
All colors are already aligned to Tailwind CSS variables in the `agmmnn/tauri-ui` template's `index.css` (`--background`, `--foreground`, `--primary`, etc.). Dev Radio overrides the primary accent.

| Token | Light | Dark | Tailwind var |
|---|---|---|---|
| Primary (brand) | `#2563EB` (blue-600) | `#3B82F6` (blue-500) | `--primary` |
| Primary Foreground | `#FFFFFF` | `#FFFFFF` | `--primary-foreground` |
| Background | `#FFFFFF` | `#0A0A0A` | `--background` |
| Foreground | `#0A0A0A` | `#FAFAFA` | `--foreground` |
| Muted | `#F4F4F5` | `#171717` | `--muted` |
| Muted Foreground | `#71717A` | `#A1A1AA` | `--muted-foreground` |
| Border | `#E4E4E7` | `#262626` | `--border` |
| Card | `#FFFFFF` | `#0F0F0F` | `--card` |

### 3.2 Semantic Status Colors

| State | Token | Light hex | Dark hex | Tailwind util |
|---|---|---|---|---|
| Ready | `--status-ready` | `#16A34A` | `#22C55E` | `bg-green-600 dark:bg-green-500` |
| Building | `--status-building` | `#D97706` | `#F59E0B` | `bg-amber-600 dark:bg-amber-500` |
| Queued | `--status-queued` | `#64748B` | `#94A3B8` | `bg-slate-500 dark:bg-slate-400` |
| Error | `--status-error` | `#DC2626` | `#EF4444` | `bg-red-600 dark:bg-red-500` |
| Canceled | `--status-canceled` | `#6B7280` | `#9CA3AF` | `bg-gray-500 dark:bg-gray-400` |
| Offline | `--status-offline` | `#A1A1AA` | `#52525B` | `bg-zinc-400 dark:bg-zinc-600` |

### 3.3 Tray Icon Color Rules (aggregate)

| Aggregate condition | Tray state | Icon color |
|---|---|---|
| Any deployment in `Error` within last 30 min | **Red** | `#DC2626` |
| Else, any deployment `Building` or `Queued` | **Yellow** | `#D97706` |
| Else, all latest deployments `Ready` | **Green** | `#16A34A` |
| No accounts configured OR offline > 60s | **Gray** | `#A1A1AA` |

> On macOS, tray image is a **monochrome template** (black + alpha); the color dot is a separate overlay composited in Rust using the `image` crate at icon-generation time, or a pre-generated colored variant swapped in when NSImage template rendering is disabled for status emphasis.

---

## 4. Typography

Use system-native stacks to preserve the native feel and avoid font-loading cost.

```css
/* tailwind.config — theme.fontFamily */
sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI Variable', 'Inter', 'system-ui', 'sans-serif']
mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Cascadia Code', 'monospace']
```

### Scale (shadcn/ui aligned)

| Role | Tailwind | Usage |
|---|---|---|
| Display | `text-lg font-semibold tracking-tight` | Section headers in Settings |
| Title | `text-base font-medium` | Project name |
| Body | `text-sm` | Default |
| Caption | `text-xs text-muted-foreground` | Timestamps, metadata |
| Code / SHA | `text-xs font-mono` | Commit SHAs, URLs |

---

## 5. Iconography

**Library:** `lucide-react` (already in `agmmnn/tauri-ui`).

### Required icons
| Purpose | Lucide name |
|---|---|
| App logo mark | custom SVG `radio-waves.svg` |
| Platform: Vercel | custom SVG (triangle mark) |
| Platform: Railway | custom SVG (train mark) |
| Status: Ready | `CircleCheck` |
| Status: Building | `Loader2` (spinning) |
| Status: Queued | `Clock` |
| Status: Error | `CircleX` |
| Status: Canceled | `Ban` |
| Refresh | `RefreshCw` |
| Settings | `Settings` |
| Account | `User` / `Users` (team) |
| Add | `Plus` |
| External link | `ExternalLink` |
| Copy | `Copy` |
| Redeploy | `Rocket` |
| Search | `Search` |
| Chevron (collapse) | `ChevronDown` / `ChevronRight` |
| Quit | `Power` |
| Offline | `WifiOff` |

### Tray icon sizes per OS
| OS | Sizes | Notes |
|---|---|---|
| macOS | 16×16 @1x, 32×32 @2x, 44×44 @3x | PNG, template (black + alpha). 22pt max visual. |
| Windows | 16×16, 20×20, 24×24, 32×32 | ICO bundle; DPI-aware. |
| Linux | 22×22, 24×24, 32×32, 48×48 | PNG; indicator icon set. |

All four color states pre-rendered per size, shipped in `src-tauri/icons/tray/`.

---

## 6. Component Library

All components are implemented using shadcn/ui primitives + Tailwind. Files referenced below live under `src/components/`.

### 6.1 Tray Menu / Popover Layout

**Composition:** frameless window, 380px × 560px (resizable only on Windows/Linux, fixed on macOS), positioned adjacent to tray.

```
┌─────────────────────────────────────────┐
│  Dev Radio          🔄  ⚙️  [account ▾]  │  ← Header: 48px, sticky
├─────────────────────────────────────────┤
│  [All] [Building] [Failing] [Ready]     │  ← Filter bar (Tabs): 40px
├─────────────────────────────────────────┤
│  ▼ Maya (Vercel)                        │  ← Account group
│    ● acme-web         2m ago            │
│    ● landing          Building…         │
│  ▼ Acme Team (Vercel)                   │
│    ● docs             Ready             │
│  ▼ Maya (Railway)                       │
│    ● api              Ready             │
│                                         │
│              (ScrollArea)               │
├─────────────────────────────────────────┤
│  Last updated 4s ago  •  15s interval    │  ← Footer: 32px
└─────────────────────────────────────────┘
```

**Key Tailwind:**
- Root: `w-[380px] h-[560px] flex flex-col bg-background text-foreground rounded-xl overflow-hidden shadow-xl border border-border`
- Header: `flex items-center justify-between h-12 px-3 border-b border-border`
- Body: `<ScrollArea className="flex-1">`
- Footer: `h-8 px-3 flex items-center text-xs text-muted-foreground border-t border-border`

### 6.2 Project Card (`ProjectCard.tsx`)

**shadcn/ui primitives:** `Card`, `Badge`, `Avatar`, `Tooltip`, `DropdownMenu` (row menu).

| Prop | Type | Notes |
|---|---|---|
| `project` | `Project` | Domain model |
| `onClick` | `() => void` | Expand detail |
| `dense` | `boolean` | Compact grouping variant |

**Variants:** `default` (popover list), `detail` (first card in detail panel).

**States:** `idle`, `hover` (`hover:bg-muted/40`), `active`, `muted` (opacity-60 for disabled account).

**Layout (default):**
```tsx
<div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/40 cursor-pointer group">
  <StatusDot state={project.latest_deployment?.state} />
  <PlatformIcon platform={project.platform} className="size-4 text-muted-foreground" />
  <div className="flex-1 min-w-0">
    <div className="text-sm font-medium truncate">{project.name}</div>
    <div className="text-xs text-muted-foreground truncate">
      {relativeTime(project.latest_deployment?.created_at)} · {project.latest_deployment?.environment}
    </div>
  </div>
  <StatusBadge state={project.latest_deployment?.state} />
  <DropdownMenu>…</DropdownMenu>
</div>
```

### 6.3 Deployment Row / Table (`DeploymentRow.tsx`)

**shadcn/ui primitives:** `Table`, `TableRow`, `Badge`, `Avatar`, `Button`, `DropdownMenu`.

Used in detail panel. 6 columns: `Status · Env · Commit · Author · When · Actions`.

```tsx
<TableRow className="h-10 hover:bg-muted/30">
  <TableCell><StatusBadge state={d.state} /></TableCell>
  <TableCell className="text-xs capitalize">{d.environment}</TableCell>
  <TableCell className="font-mono text-xs truncate max-w-[140px]">
    {d.commit_sha?.slice(0,7)} <span className="text-muted-foreground">{d.commit_message}</span>
  </TableCell>
  <TableCell><Avatar className="size-5"><AvatarImage src={d.author_avatar}/></Avatar></TableCell>
  <TableCell className="text-xs text-muted-foreground">{relativeTime(d.created_at)}</TableCell>
  <TableCell className="text-right"><DropdownMenu>…</DropdownMenu></TableCell>
</TableRow>
```

### 6.4 Status Badge (`StatusBadge.tsx`)

**shadcn/ui primitive:** `Badge`.

| Variant | State | Classes |
|---|---|---|
| `ready` | Ready | `bg-green-600/15 text-green-700 dark:text-green-400 border-green-600/30` |
| `building` | Building | `bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30` + `Loader2` spin |
| `queued` | Queued | `bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30` |
| `error` | Error | `bg-red-600/15 text-red-700 dark:text-red-400 border-red-600/30` |
| `canceled` | Canceled | `bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/30` |

Small dot variant `StatusDot` = `<span className="size-2 rounded-full {color}" />`.

### 6.5 Account Selector / Switcher (`AccountSwitcher.tsx`)

**shadcn/ui primitives:** `DropdownMenu`, `DropdownMenuCheckboxItem`, `Avatar`, `Separator`.

Lives in popover header. Behaves as a **multi-select filter** (checkboxes) rather than a single-switcher — all enabled accounts contribute to the dashboard, the dropdown toggles which ones are currently *visible*.

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="sm" className="h-8 gap-2">
      <Users className="size-4" />
      {visibleCount} of {totalCount}
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="w-64">
    <DropdownMenuLabel>Accounts</DropdownMenuLabel>
    {accounts.map(a => (
      <DropdownMenuCheckboxItem key={a.id} checked={a.visible} onCheckedChange={toggle(a.id)}>
        <Avatar className="size-5 mr-2"><AvatarImage src={a.avatar_url}/></Avatar>
        <span className="flex-1 truncate">{a.display_name}</span>
        <PlatformIcon platform={a.platform} className="size-3.5 opacity-60"/>
      </DropdownMenuCheckboxItem>
    ))}
    <Separator/>
    <DropdownMenuItem onClick={openSettingsAccounts}>
      <Plus className="size-4 mr-2"/> Add account…
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### 6.6 Settings Dialog (`SettingsDialog.tsx`)

**shadcn/ui primitives:** `Dialog`, `Tabs`, `Switch`, `Slider`, `Input`, `Button`, `Card`, `Separator`.

Opens as a standalone window (600×520) rather than a modal on top of the popover, so users can tweak settings while the popover stays visible.

Tabs: **General · Accounts · Notifications · About**.

- **General pane:** poll interval `Slider` (marks: 5/10/15/30/60/300s), `Switch` launch-at-login, theme `RadioGroup` (System/Light/Dark).
- **Accounts pane:** `Table` with accounts, actions column (Edit / Disable / Delete). Header "Add account" `Button` opens `AddAccountDialog`.
- **Notifications pane:** master `Switch`, then per-event switches (Ready/Error/Canceled), then a searchable `Command` list of accounts + projects to mute individually.
- **About pane:** version, open logs folder, open data folder, GitHub link.

### 6.7 Empty / Loading / Error States

| State | Component | Design |
|---|---|---|
| Empty (no accounts) | `EmptyState` | Centered, Lucide `RadioTower` illustration, heading "Tune in to your deploys.", subtext, primary `Button` "Connect your first account". |
| Empty (no projects) | `EmptyState` | "All quiet on this account." with a `RefreshCw` secondary button. |
| Loading (initial) | `Skeleton` rows | 5× `<Skeleton className="h-10 w-full"/>` inside project list. |
| Loading (refresh) | Subtle | `RefreshCw` icon in header spins; content stays interactive (stale-while-revalidate). |
| Error (API down) | Banner | `Alert variant="destructive"` sticky above list: "Can't reach Vercel — retrying in 12s." with a `Retry` button. |
| Offline | Banner | `Alert` neutral: "Offline — showing last known state (3 min ago)." |

---

## 7. Layout & Spacing

- **Popover window:** `w-[380px] h-[560px]`, `rounded-xl`, `shadow-xl`.
- **Base spacing unit:** 4px (`space-1`). Component vertical rhythm: 8 / 12 / 16 / 24.
- **Row height:** project row `44px`, deployment row `40px`.
- **Container padding:** `px-3 py-2` for rows, `p-4` for cards, `p-6` for dialog panes.
- **Dividers:** `border-b border-border` for header/footer; within list, rely on hover states rather than rules to reduce visual noise.
- **Safe area:** 8px min gap between popover edge and tray (handled by positioning logic in Rust).

---

## 8. Interaction Patterns

### 8.1 Tray click
| Action | macOS | Windows | Linux |
|---|---|---|---|
| Left click | Native menu with top item "Open Dashboard" (Enter) + quick-status summary | Toggle popover | Toggle popover |
| Right click | Context menu (Open, Refresh, Settings, Pause Notifications, Quit) | Same | Same |
| Middle click | Force refresh now | Force refresh | Force refresh |
| Cmd/Ctrl+Click | Open Settings | Open Settings | Open Settings |

Setting "Open popover on left click (macOS)" allows overriding menu behavior for users who prefer it.

### 8.2 Hover states
- Row: `hover:bg-muted/40 transition-colors duration-75`.
- Button ghost: `hover:bg-accent`.
- Status badge: unchanged on hover (information, not a target).

### 8.3 Keyboard shortcuts (global when popover focused)

| Key | Action |
|---|---|
| `↑ / ↓` | Navigate project rows |
| `→` | Open project detail |
| `←` / `Esc` | Close detail / close popover |
| `Enter` | Open highlighted deployment in browser |
| `⌘/Ctrl + R` | Refresh now |
| `⌘/Ctrl + ,` | Open Settings |
| `⌘/Ctrl + F` | Focus filter |
| `1 / 2 / 3 / 4` | Filter: All / Building / Failing / Ready |
| `⌘/Ctrl + Shift + R` | Redeploy highlighted deployment (with confirm) |

Global hotkey (configurable, default `Cmd/Ctrl + Shift + D`): toggle popover from anywhere.

---

## 9. Platform-Specific Adaptations

| Concern | macOS | Windows | Linux |
|---|---|---|---|
| Tray image | Template PNG (mono + alpha) | Colored ICO | Colored PNG (indicator) |
| Popover arrow | No arrow — floating rounded card | No arrow, anchored top-right of taskbar tray | No arrow, centered above/below indicator |
| Menu on click | Native NSMenu preferred; popover optional | Popover preferred | Popover preferred |
| Notifications | `UNUserNotificationCenter` via Tauri plugin | Windows Toast w/ app identity | `libnotify` (may not persist; dedup logic critical) |
| Autostart | `LaunchAgent` plist | Registry `Run` key | `.desktop` in autostart dir |
| Window chrome | Frameless, vibrancy (`NSVisualEffectView`) if available | Frameless, rounded via `DWM_WINDOW_CORNER_PREFERENCE` | Frameless, rounded via CSS only |
| Close-button | Hidden (Esc / click-outside dismisses) | Hidden | Hidden |
| Tray tooltip | "Dev Radio — All systems Ready" | Same | Same |

---

## 10. Accessibility Requirements

- **Contrast:** All text meets WCAG AA (4.5:1 for body, 3:1 for ≥18pt). Status badges use both color *and* icon — never color alone.
- **Focus:** Visible focus ring on every interactive element (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`).
- **ARIA:** `role="menu"` on tray popover list; `aria-live="polite"` on the status footer; every `Badge` includes visually-hidden text describing the state ("Deployment ready").
- **Reduced motion:** Respect `prefers-reduced-motion` — disable `Loader2` spinning (replace with static clock), disable slide-in panel transitions.
- **Screen readers:** Tray tooltip and every icon-only button have accessible labels (`aria-label`). VoiceOver rotor navigation tested on macOS.
- **Zoom:** Popover scales with OS text-size settings up to 150% without horizontal scroll.
- **Color-blind safety:** Every status also conveys meaning via icon shape (check, cross, clock, ban, spinner).

---

## 11. Dark / Light Mode Strategy

- Leverage `agmmnn/tauri-ui` existing `ThemeProvider` (stores `system | light | dark` in local storage).
- Default to **System** — listen to OS appearance via Tauri's `window.onThemeChanged`.
- All color tokens reference CSS variables defined in `src/index.css`; no hardcoded hex values in components.
- Tray icon color rules apply equally in light and dark — brightness/saturation slightly boosted in dark variants (see §3.2).
- Popover background uses `bg-background/95 backdrop-blur-md` on macOS to blend with menu-bar aesthetics.

---

## 12. Animation & Micro-interactions

All motion durations ≤ 200ms. Use Tailwind's built-in transitions; no external animation lib.

| Element | Motion | Duration | Easing |
|---|---|---|---|
| Popover appear | Scale 0.98 → 1.0 + fade | 140ms | `ease-out` |
| Row hover | `transition-colors` | 75ms | `ease-in-out` |
| Filter tab change | Underline slide | 120ms | `ease-out` |
| Detail panel slide-in | `translate-x-4` → 0 + fade | 180ms | `ease-out` |
| Status change pulse | One-shot ring ping on the row that just changed | 500ms (once) | `ease-out` |
| `Loader2` spinner | Continuous rotate | 1s linear | — |
| Toast | Slide-up + fade | 160ms | `ease-out` |

**Forbidden:** bouncy springs, parallax, decorative loops, color fades on passive status changes (use the one-shot ping only). Respect `prefers-reduced-motion` by collapsing all to instant transitions (`duration-0`).

---

## Next Steps for Developer

Recommended first five GitHub milestones / issues to bootstrap Dev Radio on top of the existing `agmmnn/tauri-ui` template, in strict order:

1. **Milestone #1 — Tray & IPC Foundation**
   Wire `tauri-plugin-tray` v2, ship a static green/yellow/red/gray tray icon switcher, a frameless popover window anchored to the tray, and a minimal `invoke('ping')` round-trip proving React↔Rust comms. Deliverable: a popover opens on tray click on all three OSes.

2. **Milestone #2 — Adapter Architecture & Vercel Client**
   Create `src-tauri/src/adapters/mod.rs` with the complete `DeploymentMonitor` trait (§8.2), domain models, `AdapterError`, and `AdapterRegistry`. Implement `VercelAdapter` with `validate`, `list_projects`, `list_deployments`, `redeploy`. Unit tests against recorded fixtures.

3. **Milestone #3 — Keychain, Settings, First-Run Onboarding**
   Integrate `tauri-plugin-stronghold` (or `keyring`) for token storage. Implement `tauri-plugin-store`-backed settings. Build the React `WelcomePopover` + `AddAccountDialog` with Vercel tab. Acceptance: user can add a Vercel account and see their real projects in the popover.

4. **Milestone #4 — Polling Engine, Cache, Tray State Machine, Notifications**
   Implement `Poller` (Tokio) with configurable interval + exponential backoff, in-memory `Cache`, diff-driven event emission, tray-color recomputation, and `tauri-plugin-notification` wiring with dedup. Acceptance: failing a deploy on Vercel turns the tray red within 20s and fires exactly one desktop notification.

5. **Milestone #5 — Railway Adapter, Design-System Pass, v1.0 Release Hardening**
   Implement `RailwayAdapter` using `graphql_client`. Complete the design-system components (Project Card, Deployment Row, Status Badge, Settings Dialog) to spec. Add launch-at-login, dark/light polish, accessibility audit, and packaging pipelines (DMG notarized, signed MSI, AppImage + .deb). Tag **v1.0.0**.