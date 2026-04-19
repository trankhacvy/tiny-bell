# Dev Radio — UI/UX Redesign Implementation Plan

This document is the step-by-step plan to migrate the existing Dev Radio desktop app from its current shadcn/lucide baseline to the new **Linear/Raycast/Spark** design system handed off at `/tmp/dev-radio-design/extracted/dev-radio/`. The design is already fully functional — accounts, OAuth, PAT, polling, dashboard state, popover routing. This plan is purely a **presentation-layer** migration. Backend additions are minimal.

> **Do not implement yet.** This is a written plan. Open questions are in §13.

---

## 0. TL;DR

- Replace shadcn grayscale tokens with the design's oklch-based warm-neutral/cool-charcoal pair in `src/index.css`.
- Rewrite three desktop views (`onboarding-view.tsx`, `settings-view.tsx`, `about-view.tsx`) to match the canvas layouts: flat 38px titlebar, Linear-density 13px body, JetBrains Mono for tokens, subtle per-provider accents only.
- Rewrite the popover shell and row template to match `popover.jsx`: status **glyph+disc** (never color alone), account group headers, compact 48px rows, keyboard-first navigation.
- Add four primitives: `StatusGlyph`, `ProviderChip`, `Kbd`, `InitialsAvatar`. Drop the heavy `provider-theme.ts` gradients entirely.
- Replace most lucide icons with the 1.5-stroke minimal glyph set from `primitives.jsx` (check, x, chevron, plus, dot, refresh, gear, arrow-up-right).
- Keep every existing Rust command, event name, and shape. Only touch React.

---

## 1. Design source of truth

The extracted bundle lives at `/tmp/dev-radio-design/extracted/dev-radio/`. Read in this order:

| File | Role | Maps to |
|---|---|---|
| `project/styles.css` | Design tokens (oklch + fonts) | `src/index.css` |
| `project/window-chrome.jsx` | `DRWindow`, `DRTabs`, `TrafficLights` | titlebar shell + tab nav |
| `project/primitives.jsx` | `DRButton`, `DRInput`, `DRBadge`, `DRKbd`, `DRCard`, `StatusDot`, `ProviderMark`, `Icon` | low-level components |
| `project/screens-onboarding.jsx` | 4-screen onboarding | desktop onboarding-view |
| `project/screens-settings.jsx` | Accounts / General / About + dialog + banners | desktop settings + about views |
| `project/popover.jsx` | Full popover + 6 states | popover-view |
| `project/Dev Radio Design.html` | Canvas composition (ordering only) | reference |
| `chats/chat1.md` | Design intent | rationale |

**Key rule from `chats/chat1.md`:** provider glyphs are original abstract marks (wedge for Vercel-like, rails for Railway-like). **Do not use real brand marks.** Current `public/assets/vercel.svg` / `railway.svg` are fine for the menubar tray icon only — inside the UI, use our abstract `ProviderMark`.

---

## 2. Current code map

### To replace wholesale
- `src/index.css` — token palette + `@theme inline` mapping
- `src/app/desktop/views/onboarding-view.tsx` — heavy gradient branded onboarding
- `src/app/desktop/views/settings-view.tsx` — card-based with pill buttons
- `src/app/desktop/views/about-view.tsx` — becomes a sub-tab
- `src/app/popover/views/deployments-view.tsx` — single-account header, no groups
- `src/components/account/add-account-form.tsx` — `layout="branded"` mode goes away
- `src/components/deployment/deployment-card.tsx` — becomes `<DeployRow />`
- `src/components/deployment/status-icon.tsx` — becomes `<StatusGlyph />`

### To add
- `src/components/dr/window.tsx` — `DRWindow` + `TrafficLights`
- `src/components/dr/tabs.tsx` — `DRTabs`
- `src/components/dr/status-glyph.tsx` — status disc + inner glyph + pulse
- `src/components/dr/provider-chip.tsx` — provider mark + label
- `src/components/dr/provider-mark.tsx` — abstract wedge/rails SVG
- `src/components/dr/kbd.tsx` — `⌘K` style keycap
- `src/components/dr/initials-avatar.tsx` — account initials disc
- `src/components/dr/icon.tsx` — minimal 1.5-stroke glyph set
- `src/components/popover/deploy-row.tsx`
- `src/components/popover/account-group.tsx`
- `src/components/popover/popover-header.tsx`
- `src/components/popover/popover-footer.tsx`

### To delete (after migration lands)
- `src/lib/provider-theme.ts`
- `src/components/account/add-account-form.tsx` `layout="branded"` branch
- All `lucide-react` imports inside UI components (keep available for menubar tray only if needed)

### Keep untouched
- Every file under `src-tauri/`
- `src/lib/accounts.ts`, `src/lib/deployments.ts`, `src/lib/time.ts`
- `src/hooks/use-dashboard.ts`, `src/hooks/use-accounts.ts`
- Tauri event names: `dashboard:update`, `accounts:changed`, `desktop:route`, `desktop:close-hint`, `oauth:complete`

---

## 3. Design token migration (`src/index.css`)

Current file uses the shadcn grayscale. Replace with the design's warm-neutral + cool-charcoal pair and expose them both as `@theme inline` (for Tailwind v4) **and** as raw `--l-*`/`--d-*` vars (so literal design snippets keep working).

```css
/* src/index.css */
@import "tailwindcss";

:root {
  /* Fonts */
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-display: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Helvetica Neue", sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace;

  /* Light — warm neutral */
  --l-bg:        oklch(0.985 0.003 85);
  --l-surface:   oklch(1 0 0);
  --l-surface-2: oklch(0.975 0.004 85);
  --l-border:    oklch(0.92 0.004 85);
  --l-border-s:  oklch(0.955 0.003 85);
  --l-text:      oklch(0.21 0.006 260);
  --l-text-2:    oklch(0.48 0.006 260);
  --l-text-3:    oklch(0.62 0.006 260);
  --l-hover:     oklch(0.965 0.004 85);
  --l-selected:  oklch(0.945 0.006 240);

  /* Dark — cool charcoal */
  --d-bg:        oklch(0.18 0.006 260);
  --d-surface:   oklch(0.205 0.006 260);
  --d-surface-2: oklch(0.235 0.006 260);
  --d-border:    oklch(0.28 0.006 260);
  --d-border-s:  oklch(0.24 0.006 260);
  --d-text:      oklch(0.96 0.003 260);
  --d-text-2:    oklch(0.7 0.006 260);
  --d-text-3:    oklch(0.55 0.006 260);
  --d-hover:     oklch(0.255 0.006 260);
  --d-selected:  oklch(0.28 0.02 250);

  /* Status — never use color alone; always paired with a glyph */
  --green: oklch(0.68 0.14 150);
  --amber: oklch(0.78 0.14 85);
  --red:   oklch(0.64 0.19 25);

  /* Provider accents (one per provider per tone) */
  --accent-neutral-l: oklch(0.55 0.09 210);
  --accent-neutral-d: oklch(0.72 0.11 210);
  --accent-vercel-l:  oklch(0.21 0.006 260);
  --accent-vercel-d:  oklch(0.96 0.003 260);
  --accent-railway-l: oklch(0.52 0.17 285);
  --accent-railway-d: oklch(0.72 0.16 285);
}

/* Semantic tokens resolved per mode. The app sets data-theme on <html>. */
:root,
[data-theme="light"] {
  --bg:        var(--l-bg);
  --surface:   var(--l-surface);
  --surface-2: var(--l-surface-2);
  --border:    var(--l-border);
  --border-s:  var(--l-border-s);
  --text:      var(--l-text);
  --text-2:    var(--l-text-2);
  --text-3:    var(--l-text-3);
  --hover:     var(--l-hover);
  --selected:  var(--l-selected);
}

[data-theme="dark"] {
  --bg:        var(--d-bg);
  --surface:   var(--d-surface);
  --surface-2: var(--d-surface-2);
  --border:    var(--d-border);
  --border-s:  var(--d-border-s);
  --text:      var(--d-text);
  --text-2:    var(--d-text-2);
  --text-3:    var(--d-text-3);
  --hover:     var(--d-hover);
  --selected:  var(--d-selected);
}

@theme inline {
  --font-sans: var(--font-sans);
  --font-display: var(--font-display);
  --font-mono: var(--font-mono);

  --color-background: var(--bg);
  --color-surface:    var(--surface);
  --color-surface-2:  var(--surface-2);
  --color-border:     var(--border);
  --color-border-subtle: var(--border-s);
  --color-foreground: var(--text);
  --color-muted:      var(--text-2);
  --color-faint:      var(--text-3);
  --color-hover:      var(--hover);
  --color-selected:   var(--selected);

  --color-success: var(--green);
  --color-warning: var(--amber);
  --color-danger:  var(--red);

  --radius-input: 6px;
  --radius-card:  10px;
  --radius-window: 10px;
}

* { box-sizing: border-box; }
html, body, #root { margin: 0; padding: 0; height: 100%; }
html { color-scheme: light dark; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}
```

**Theme wiring:** a thin hook sets `data-theme="dark|light"` on `<html>` from `prefers-color-scheme` + a persisted override. Drop any remaining `.dark` class usage.

---

## 4. Window chrome (`DRWindow`)

The canvas uses a **38px flat titlebar** with traffic lights left, centered title, optional right-side actions. No blur. No Liquid Glass. One 0.5px border below.

```tsx
// src/components/dr/window.tsx
import type { CSSProperties, ReactNode } from "react";

function TrafficLights() {
  return (
    <div className="flex items-center gap-2">
      <span className="size-3 rounded-full bg-[#ff5f57]" />
      <span className="size-3 rounded-full bg-[#febc2e]" />
      <span className="size-3 rounded-full bg-[#28c840]" />
    </div>
  );
}

export function DRWindow({
  title = "Dev Radio",
  titleRight,
  children,
  style,
}: {
  title?: string;
  titleRight?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className="flex h-screen w-screen flex-col bg-surface text-foreground"
      style={style}
    >
      <div
        className="grid h-[38px] shrink-0 items-center border-b border-border-subtle px-3"
        style={{ gridTemplateColumns: "1fr auto 1fr" }}
        data-tauri-drag-region
      >
        <div className="flex items-center"><TrafficLights /></div>
        <div className="text-[12px] font-medium text-muted tracking-[0.1px]">{title}</div>
        <div className="flex items-center justify-end gap-1.5">{titleRight}</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-background">{children}</div>
    </div>
  );
}
```

In Tauri the system still draws the real traffic lights at the OS level. We hide the system buttons (`titleBarStyle: "overlay"` on macOS already in `tauri.conf.json`) and render our own via `DRWindow` so the layout matches on all OSes.

`DRTabs` is a nearly-direct port of `window-chrome.jsx:69-88` — 10px/8px padding, 12px 500-weight labels, 1.5px underline on active, `marginBottom: -0.5` so the underline overlaps the container border.

---

## 5. Onboarding rewrite

Replace `src/app/desktop/views/onboarding-view.tsx`. The design breaks onboarding into four screens rendered in sequence, with a tiny step dot row at the bottom:

1. **Welcome** — pick Vercel or Railway (or both)
2. **Connect provider** — OAuth button for Vercel, PAT field for Railway
3. **(repeat for second provider if chosen)**
4. **Success** — `You're all set.` + summary

Flat layout, generous whitespace, no gradients, no cards — just a 40px-padded flex column.

```tsx
// src/app/desktop/views/onboarding-view.tsx
import { useState } from "react";
import { DRWindow } from "@/components/dr/window";
import { OnboardingWelcome } from "./onboarding/welcome-step";
import { OnboardingConnect } from "./onboarding/connect-step";
import { OnboardingSuccess } from "./onboarding/success-step";
import type { Platform } from "@/lib/accounts";

type Step =
  | { name: "welcome" }
  | { name: "connect"; platform: Platform; remaining: Platform[] }
  | { name: "success"; connected: Platform[] };

export function OnboardingView() {
  const [step, setStep] = useState<Step>({ name: "welcome" });
  const [connected, setConnected] = useState<Platform[]>([]);

  return (
    <DRWindow title="Dev Radio">
      <div className="flex flex-1 flex-col px-10 py-10">
        {step.name === "welcome" && (
          <OnboardingWelcome
            onPick={(picks) => {
              const [first, ...rest] = picks;
              setStep({ name: "connect", platform: first, remaining: rest });
            }}
          />
        )}
        {step.name === "connect" && (
          <OnboardingConnect
            platform={step.platform}
            onDone={(profile) => {
              const next = [...connected, step.platform];
              setConnected(next);
              if (step.remaining.length > 0) {
                const [first, ...rest] = step.remaining;
                setStep({ name: "connect", platform: first, remaining: rest });
              } else {
                setStep({ name: "success", connected: next });
              }
            }}
            onSkip={() => {
              if (step.remaining.length > 0) {
                const [first, ...rest] = step.remaining;
                setStep({ name: "connect", platform: first, remaining: rest });
              } else {
                setStep({ name: "success", connected });
              }
            }}
          />
        )}
        {step.name === "success" && <OnboardingSuccess connected={step.connected} />}
      </div>
      <StepDots current={step.name} />
    </DRWindow>
  );
}
```

**`welcome-step.tsx`** — centered H1 (`font-display`, 24px, 600), 15px muted subtitle (`"Let's get you connected."`), two large tappable `<ProviderChip>` tiles side-by-side, a `Continue` button that stays disabled until at least one provider is picked. Exactly the treatment in `screens-onboarding.jsx`.

**`connect-step.tsx`** — header shows the picked provider via `<ProviderChip>`, then either a single large `Connect with Vercel` primary button (OAuth) or a mono-font `<DRInput />` for the Railway PAT plus helper link to `railway.app/account/tokens`. Reuse the existing `accountsApi.startOAuth` / `connectWithToken` calls verbatim — no backend change.

**`success-step.tsx`** — big green `<StatusGlyph status="ready" size={40} />`, title `"You're all set."`, list of connected accounts with `<InitialsAvatar>`, `Open menubar` hint with `⌥⌘D` `<Kbd>`.

---

## 6. Settings rewrite

Replace `src/app/desktop/views/settings-view.tsx` and fold `about-view.tsx` into it as a tab. Three tabs: **Accounts · General · About**.

```tsx
// src/app/desktop/views/settings-view.tsx
import { useState } from "react";
import { DRWindow } from "@/components/dr/window";
import { DRTabs } from "@/components/dr/tabs";
import { SettingsAccounts } from "./settings/accounts-tab";
import { SettingsGeneral } from "./settings/general-tab";
import { SettingsAbout } from "./settings/about-tab";

const TABS = ["Accounts", "General", "About"] as const;
type Tab = typeof TABS[number];

export function SettingsView() {
  const [tab, setTab] = useState<Tab>("Accounts");
  return (
    <DRWindow title="Dev Radio — Settings">
      <DRTabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === "Accounts" && <SettingsAccounts />}
        {tab === "General" && <SettingsGeneral />}
        {tab === "About" && <SettingsAbout />}
      </div>
    </DRWindow>
  );
}
```

**Accounts tab** (`screens-settings.jsx:AccountsTab` — lines referenced in design bundle):
- Top row: a mini `ProviderChip` legend + a single `Add account` primary button (opens existing `AddAccountDialog`).
- List of account rows — each row: `<InitialsAvatar>` / display name / muted scope (team, personal) / status dot (green=OK, amber=re-auth needed, red=revoked) / `⋯` overflow (Rename, Sign out).
- Re-auth banner (`ReauthBanner` in design) renders above the list if any account has `needs_reauth`.

**General tab**:
- Section: **Start at login** — a `<Switch>`.
- Section: **Refresh interval** — a tight `<Select>` with values `10s / 30s / 60s / 5m`, wired to the existing polling command.
- Section: **Dock icon** — `<Switch>` for "Show in Dock" wired to the existing `set_activation_policy` command.
- Section: **Theme** — segmented control `System / Light / Dark`.
- Section: **Global shortcut** — `⌥⌘D` shown as a recorder-style `<Kbd>` cluster (recording capture is §9 backend).

**About tab**: app icon, version (from `package.json`), GitHub/docs links, two-line acknowledgement. Replace the current lucide icons with `<Icon name="external" />` from the new minimal set.

**Hide-to-menubar dialog** (`screens-settings.jsx:HideToMenubarDialog`) — shown on first window-close. Port:

```tsx
<DRDialog>
  <h3 className="font-display text-[17px] font-semibold">Dev Radio keeps running</h3>
  <p className="mt-1 text-muted text-[13px]">
    It lives in your menubar. Click the <InlineBarIcon /> icon anytime.
    To quit fully, right-click it and choose <em>Quit</em>.
  </p>
  <div className="mt-4 flex items-center justify-between">
    <Checkbox checked={dontShow} onChange={setDontShow}>Don't show this again</Checkbox>
    <DRButton variant="primary" onClick={onClose}>Got it</DRButton>
  </div>
</DRDialog>
```

Wire `dontShow` to an existing or new `prefs.hide_to_menubar_shown` value via `tauri-plugin-store` (see §9).

---

## 7. Popover rewrite

This is the biggest visible change. Replace `src/app/popover/views/deployments-view.tsx` with a tight 380×600 shell that exactly matches `popover.jsx`.

### 7.1 Shell

```tsx
// src/app/popover/popover-app.tsx
import { useAccounts } from "@/hooks/use-accounts";
import { useDashboard } from "@/hooks/use-dashboard";
import { PopoverHeader } from "@/components/popover/popover-header";
import { PopoverFooter } from "@/components/popover/popover-footer";
import { AccountGroup } from "@/components/popover/account-group";
import { PopoverEmpty } from "@/components/popover/states/empty";
import { PopoverNoAccounts } from "@/components/popover/states/no-accounts";
import { PopoverOffline } from "@/components/popover/states/offline";
import { PopoverRateLimit } from "@/components/popover/states/rate-limit";
import { PopoverLoading } from "@/components/popover/states/loading";

export function PopoverApp() {
  const accounts = useAccounts();
  const { state, status } = useDashboard();

  return (
    <div className="flex h-screen w-screen flex-col bg-surface text-foreground">
      <PopoverHeader />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {accounts.length === 0 && <PopoverNoAccounts />}
        {accounts.length > 0 && status === "loading" && <PopoverLoading />}
        {status === "offline" && <PopoverOffline />}
        {status === "rate_limited" && <PopoverRateLimit />}
        {status === "ok" && state.accounts.length === 0 && <PopoverEmpty />}
        {status === "ok" &&
          state.accounts.map((acc) => <AccountGroup key={acc.id} account={acc} />)}
      </div>
      <PopoverFooter />
    </div>
  );
}
```

The six states are all provided as light+dark pairs in the design canvas; port the specific copy verbatim from `popover.jsx`.

### 7.2 Header + account switcher

**Decision (Q4): implement both the grouped list AND the header switcher.** The switcher doesn't replace grouping — it scopes it. When `All accounts` is selected (default), the popover body shows one `<AccountGroup>` per account. When a specific account is selected, the body shows only that account's rows (no redundant group header, since the selected account is already visible in the popover header).

`PopoverHeader` — 44px tall, 0.5px bottom border:

- Left: scope selector. When scoped to `All accounts`, shows a small stacked `<InitialsAvatar>` cluster + label "All accounts" + chevron. When scoped to a single account, shows that account's `<InitialsAvatar>` + its display name + provider mark + chevron. Clicking opens a popover menu (`DRMenu`).
- Right: a 20px refresh ghost-button + a 20px gear ghost-button (opens desktop settings via `desktop:route`).

Menu contents (`DRMenu`):

```
All accounts                          ⌘0
────────────────────────────────
(Vercel)  [V] trankhacvy             ⌘1
(Vercel)  [V] acme-team              ⌘2
(Railway) [R] khac.vy@gmail.com      ⌘3
────────────────────────────────
Add account…                         ⌘N
```

The `⌘N` row routes to the desktop onboarding via `desktop:route = "onboarding"`. `⌘0`–`⌘9` select scopes from the keyboard.

```tsx
// src/components/popover/popover-header.tsx
import { useAccounts } from "@/hooks/use-accounts";
import { useScope } from "@/hooks/use-scope";
import { InitialsAvatar } from "@/components/dr/initials-avatar";
import { ProviderMark } from "@/components/dr/provider-mark";
import { Icon } from "@/components/dr/icon";
import { DRMenu, DRMenuItem, DRMenuSeparator } from "@/components/dr/menu";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

export function PopoverHeader() {
  const accounts = useAccounts();
  const [scope, setScope] = useScope();

  const current = scope === "all" ? null : accounts.find((a) => a.id === scope);

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
      <DRMenu
        trigger={
          <button className="flex h-8 items-center gap-2 rounded-md px-2 hover:bg-hover">
            {current ? (
              <>
                <InitialsAvatar name={current.display_name} size={22} />
                <span className="text-[13px] font-medium text-foreground">
                  {current.display_name}
                </span>
                <ProviderMark platform={current.platform} size={12} />
              </>
            ) : (
              <>
                <StackedAvatars accounts={accounts.slice(0, 3)} />
                <span className="text-[13px] font-medium text-foreground">All accounts</span>
              </>
            )}
            <Icon name="chevron-down" size={12} className="text-muted" />
          </button>
        }
      >
        <DRMenuItem accel="⌘0" onSelect={() => setScope("all")}>All accounts</DRMenuItem>
        <DRMenuSeparator />
        {accounts.map((a, i) => (
          <DRMenuItem
            key={a.id}
            accel={i < 9 ? `⌘${i + 1}` : undefined}
            onSelect={() => setScope(a.id)}
            left={<InitialsAvatar name={a.display_name} size={16} />}
            right={<ProviderMark platform={a.platform} size={11} />}
          >
            {a.display_name}
          </DRMenuItem>
        ))}
        <DRMenuSeparator />
        <DRMenuItem accel="⌘N" onSelect={() => emit("desktop:route", "onboarding")}>
          Add account…
        </DRMenuItem>
      </DRMenu>
      <div className="ml-auto flex items-center gap-0.5">
        <IconButton name="refresh" onClick={() => invoke("refresh_now")} tooltip="Refresh (⌘R)" />
        <IconButton name="gear" onClick={() => emit("desktop:route", "settings")} tooltip="Settings (⌘,)" />
      </div>
    </header>
  );
}
```

`PopoverFooter` — 36px tall. Left: muted `Updated 12s ago` timestamp (`formatRelative()` from `src/lib/time.ts`). Right: three `<Kbd>` clusters: `⌘R` refresh, `⌘,` settings, `⌘Q` quit.

### 7.3 Account group + project with expandable deployments

**Decision (Q5):** each project shows its latest deployment as the primary row; a chevron on the right expands the project to reveal the **previous 4 deployments** (total 5 visible when expanded). Expansion state is per-project, lives in component state, and persists for the popover session (not across app restarts — cheap; if users ask we can add).

```tsx
// src/components/popover/account-group.tsx
import { ProviderMark } from "@/components/dr/provider-mark";
import { ProjectBlock } from "./project-block";
import type { AccountDashboard } from "@/lib/deployments";

export function AccountGroup({
  account,
  hideHeader = false,
}: { account: AccountDashboard; hideHeader?: boolean }) {
  return (
    <section>
      {!hideHeader && (
        <header
          className="sticky top-0 z-10 flex items-center gap-2 bg-surface/95 px-4 py-2 backdrop-blur"
        >
          <ProviderMark platform={account.platform} size={12} />
          <span className="text-[12px] font-medium text-muted">{account.display_name}</span>
          <span className="ml-auto text-[11px] text-faint">
            {account.projects.length} {account.projects.length === 1 ? "project" : "projects"}
          </span>
        </header>
      )}
      <ul className="border-t border-border-subtle">
        {account.projects.map((p) => <ProjectBlock key={p.id} project={p} />)}
      </ul>
    </section>
  );
}
```

```tsx
// src/components/popover/project-block.tsx
import { useState } from "react";
import { DeployRow } from "./deploy-row";
import type { Project } from "@/lib/deployments";

const EXPANDED_LIMIT = 5;

export function ProjectBlock({ project }: { project: Project }) {
  const [expanded, setExpanded] = useState(false);
  const deployments = project.deployments.slice(0, expanded ? EXPANDED_LIMIT : 1);
  const canExpand = project.deployments.length > 1;

  return (
    <li className="border-b border-border-subtle last:border-b-0">
      <DeployRow
        project={project}
        deployment={deployments[0]}
        role="primary"
        expandable={canExpand}
        expanded={expanded}
        onToggleExpand={canExpand ? () => setExpanded((v) => !v) : undefined}
      />
      {expanded && deployments.slice(1).map((d) => (
        <DeployRow key={d.id} project={project} deployment={d} role="history" />
      ))}
      {expanded && project.deployments.length > EXPANDED_LIMIT && (
        <div className="px-4 py-1.5 text-[11px] text-faint">
          Showing {EXPANDED_LIMIT} of {project.deployments.length} deployments
        </div>
      )}
    </li>
  );
}
```

```tsx
// src/components/popover/deploy-row.tsx
import { openUrl } from "@tauri-apps/plugin-opener";
import { StatusGlyph } from "@/components/dr/status-glyph";
import { Icon } from "@/components/dr/icon";
import { formatRelative } from "@/lib/time";
import type { Project, Deployment, DeploymentState } from "@/lib/deployments";

export function DeployRow({
  project,
  deployment,
  role = "primary",
  expandable = false,
  expanded = false,
  onToggleExpand,
}: {
  project: Project;
  deployment: Deployment;
  role?: "primary" | "history";
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const isHistory = role === "history";
  return (
    <div
      tabIndex={0}
      data-deploy-row
      data-deploy-id={deployment.id}
      className={`flex items-center gap-3 px-4 outline-none hover:bg-hover focus:bg-selected
                  ${isHistory ? "h-10 pl-12 bg-surface-2/40" : "h-12"}`}
      onKeyDown={(e) => {
        if (e.key === "Enter") openUrl(deployment.inspector_url);
        if (e.key === "ArrowRight" && expandable && !expanded) onToggleExpand?.();
        if (e.key === "ArrowLeft" && expandable && expanded) onToggleExpand?.();
      }}
      onClick={() => openUrl(deployment.inspector_url)}
    >
      <StatusGlyph status={deployment.state} size={isHistory ? 12 : 16} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium text-foreground">
          {isHistory ? deployment.commit_message?.split("\n")[0] ?? deployment.branch : project.name}
        </span>
        <span className="truncate text-[11px] text-muted">
          <span className="font-mono text-[10.5px]">{deployment.sha?.slice(0, 7) ?? "—"}</span>
          {" · "}
          {deployment.branch}
          {" · "}
          {formatRelative(deployment.created_at)}
        </span>
      </div>
      <StatusLabel state={deployment.state} />
      {expandable && !isHistory && (
        <button
          className="flex size-6 items-center justify-center rounded hover:bg-hover"
          onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
          aria-label={expanded ? "Collapse deployments" : "Expand deployments"}
        >
          <Icon name={expanded ? "chevron-up" : "chevron-down"} size={12} className="text-muted" />
        </button>
      )}
    </div>
  );
}

function StatusLabel({ state }: { state: DeploymentState }) {
  const LABEL: Record<DeploymentState, string> = {
    ready: "Ready", building: "Building", queued: "Queued",
    canceled: "Canceled", error: "Error", unknown: "Unknown",
  };
  return (
    <span
      className="shrink-0 text-[11px] font-medium tabular-nums"
      style={{
        color: state === "error" ? "var(--red)"
             : state === "building" || state === "queued" ? "var(--amber)"
             : state === "ready" ? "var(--green)"
             : "var(--text-3)",
      }}
    >
      {LABEL[state]}
    </span>
  );
}
```

> **Data shape note.** `Deployment.commit_message` may not exist on the current `Deployment` type in `src/lib/deployments.ts`. If absent, fall back to `deployment.branch`. If we want richer history rows, plumb `commit_message` through the Rust adapters (Vercel: `meta.githubCommitMessage`; Railway: `deployment.meta.commitMessage` via GraphQL). Prefer adding the field only if the UI commits to showing it.

### 7.4 StatusGlyph — the single most important primitive

Never communicate status with color alone. A filled disc sized `size` with an inner 1.5-stroke glyph:

| State      | Color    | Glyph     | Animation |
|---|---|---|---|
| ready      | `--green`| check     | none |
| building   | `--amber`| dot       | pulse (scale 1→1.15, opacity 1→0.4, 1.2s ease-in-out infinite) |
| queued     | `--amber`| ellipsis  | none |
| canceled   | `--text-3`| x        | none |
| error      | `--red`  | exclaim   | none |
| unknown    | `--text-3`| ?        | none |

```tsx
// src/components/dr/status-glyph.tsx
const MAP = {
  ready:     { color: "var(--green)", d: "M5 8.5 L7.3 10.8 L11 6.5" },
  building:  { color: "var(--amber)", d: "M8 8 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0" },
  queued:    { color: "var(--amber)", d: "M5 8 h.01 M8 8 h.01 M11 8 h.01" },
  canceled:  { color: "var(--text-3)", d: "M5.5 5.5 L10.5 10.5 M10.5 5.5 L5.5 10.5" },
  error:     { color: "var(--red)",   d: "M8 5 V9 M8 10.5 h.01" },
  unknown:   { color: "var(--text-3)", d: "M6.5 6.5 a1.5 1.5 0 1 1 2.5 1.2 L8 9 M8 10.5 h.01" },
} as const;

export function StatusGlyph({
  status,
  size = 16,
}: { status: keyof typeof MAP; size?: number }) {
  const { color, d } = MAP[status];
  return (
    <span
      className="relative inline-flex items-center justify-center rounded-full"
      style={{ width: size, height: size, background: color }}
      data-animate={status === "building" ? "pulse" : undefined}
    >
      <svg viewBox="0 0 16 16" className="size-full">
        <path d={d} stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </span>
  );
}
```

Pulse is one CSS animation declared globally (`@keyframes dr-pulse`).

### 7.5 Keyboard map

- `↑` / `↓` — move focus between visible deploy rows (includes expanded history rows)
- `→` — expand the focused project (if it has history)
- `←` — collapse the focused project
- `Enter` — open deployment inspector in browser
- `⌘R` — force refresh (invokes existing refresh command)
- `⌘,` — open desktop settings
- `⌘0` — scope to "All accounts"
- `⌘1` … `⌘9` — scope to the Nth account in the header menu
- `⌘N` — open onboarding (add account)
- `⌘Q` — quit app
- `Esc` — close popover (or close the header menu if open)

Implementation: attach a single delegated `onKeyDown` to the popover root, enumerate `[data-deploy-row]` elements in DOM order for `↑/↓`. Shortcut handling for `⌘R/⌘,/⌘0-9/⌘N/⌘Q` goes in the same handler so they work regardless of focus.

### 7.6 Scope hook (`useScope`)

The scope is popover-local state, not a Rust-backed pref. Persisted to `sessionStorage` so it survives popover open/close within one app session but resets on app restart.

```ts
// src/hooks/use-scope.ts
import { useEffect, useState } from "react";

const KEY = "dr:popover:scope";
export type Scope = "all" | string; // "all" or an account id

export function useScope(): [Scope, (s: Scope) => void] {
  const [scope, setScope] = useState<Scope>(() => {
    try { return (sessionStorage.getItem(KEY) as Scope) || "all"; } catch { return "all"; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(KEY, scope); } catch {}
  }, [scope]);
  return [scope, setScope];
}
```

Consumer in `PopoverApp`:

```tsx
const [scope] = useScope();
const visibleAccounts = scope === "all"
  ? state.accounts
  : state.accounts.filter((a) => a.id === scope);

{visibleAccounts.map((acc) => (
  <AccountGroup key={acc.id} account={acc} hideHeader={scope !== "all"} />
))}
```

When scoped to one account, suppress the group header (the selected account is already shown in the popover header — duplicating it wastes vertical space).

### 7.7 Interaction details for expanded rows

- First focus into the list lands on the first project's primary row.
- `→` on an unexpanded project expands it and leaves focus on the primary row.
- `↓` after expansion moves focus into the first history row.
- Collapsing via `←` moves focus back to the primary row before removing history rows from the DOM (prevents focus loss).
- History rows use a 12px status glyph (vs 16px on primary) and a 40px height (vs 48px). Indent via `pl-12`. Slight `bg-surface-2/40` wash to group them visually.
- Clicking a primary row opens the inspector; the expand chevron is a separate hit target with `stopPropagation`.

---

## 8. Provider marks — real brand marks

**Decision (Q1):** use real Vercel + Railway brand marks.

**Prerequisite (the repo doesn't currently have them — I checked):** add two files. Use the official mark SVGs from each brand's guidelines page:

- Vercel: https://vercel.com/design/brands — take the "Logomark" (triangle). Single-path, black on transparent. Commit as `src/assets/providers/vercel.svg`.
- Railway: https://railway.com/brand — take the "Glyph" mark. Commit as `src/assets/providers/railway.svg`.

Both files should be hand-cleaned to:
- A single `viewBox="0 0 16 16"` (or `0 0 24 24`; be consistent between the two).
- No hardcoded `width`/`height` (sizing is done by the consumer).
- All fill colors replaced with `currentColor` so the parent `ProviderChip` drives the tone.

Remove `src/lib/provider-theme.ts` entirely. Replace with:

```tsx
// src/components/dr/provider-mark.tsx
import vercelSvg from "@/assets/providers/vercel.svg?raw";
import railwaySvg from "@/assets/providers/railway.svg?raw";

const RAW: Record<"vercel" | "railway", string> = {
  vercel: vercelSvg,
  railway: railwaySvg,
};

// Defense-in-depth: if a freshly-copied SVG still has a hardcoded fill, rewrite at
// module load so the parent's color wins. Applied once; cheap.
function currentColorize(svg: string): string {
  return svg
    .replace(/\sfill="(?!none)[^"]*"/g, ' fill="currentColor"')
    .replace(/\sstroke="(?!none)[^"]*"/g, ' stroke="currentColor"');
}

const PROCESSED: Record<"vercel" | "railway", string> = {
  vercel: currentColorize(RAW.vercel),
  railway: currentColorize(RAW.railway),
};

export function ProviderMark({
  platform,
  size = 14,
}: { platform: "vercel" | "railway"; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ display: "inline-flex", width: size, height: size, lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: PROCESSED[platform] }}
    />
  );
}
```

Vite supports the `?raw` suffix out of the box. If the project's TS config lacks module decls for `*.svg?raw`, add `src/vite-env.d.ts`:

```ts
declare module "*.svg?raw" { const s: string; export default s; }
```

**Tray icons:** the existing `src-tauri/icons/tray/*.png` set is status-only (gray/green/amber/red) and doesn't need provider glyphs. No change there.

```tsx
// src/components/dr/provider-chip.tsx
import { ProviderMark } from "./provider-mark";
import type { Platform } from "@/lib/accounts";

const ACCENT_LIGHT: Record<Platform, string> = {
  vercel:  "var(--accent-vercel-l)",
  railway: "var(--accent-railway-l)",
};
const ACCENT_DARK: Record<Platform, string> = {
  vercel:  "var(--accent-vercel-d)",
  railway: "var(--accent-railway-d)",
};

const LABEL: Record<Platform, string> = {
  vercel: "Vercel",
  railway: "Railway",
};

export function ProviderChip({
  platform,
  size = "md",
  showLabel = true,
}: { platform: Platform; size?: "sm" | "md" | "lg"; showLabel?: boolean }) {
  const px = size === "sm" ? 12 : size === "lg" ? 22 : 14;
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{ color: `light-dark(${ACCENT_LIGHT[platform]}, ${ACCENT_DARK[platform]})` }}
    >
      <ProviderMark platform={platform} size={px} />
      {showLabel && (
        <span className="font-display text-[12px] font-medium text-foreground">
          {LABEL[platform]}
        </span>
      )}
    </span>
  );
}
```

Note: `light-dark()` is supported everywhere Tauri ships (modern WebKit/WebView2). If you prefer to stay explicit, branch on a `data-theme` attribute via a small hook instead.

---

## 9. Backend additions

Three of these (prefs, global shortcut, theme plumbing) are load-bearing for the redesign and must ship with it. The health-enum + `validate_token` pair is a smaller follow-up that fixes a pre-existing gap.

### 9.1 Prefs store

Add a `prefs` bucket to the existing `tauri-plugin-store`. One file (`store/prefs.json`) holds a single flat object:

- `prefs.theme`: `"system" | "light" | "dark"` (default `"system"`)
- `prefs.refresh_interval_ms`: `number` (default `30_000`; options `10_000 / 30_000 / 60_000 / 300_000`)
- `prefs.hide_to_menubar_shown`: `boolean` (default `false`)
- `prefs.start_at_login`: `boolean` (default `false`)
- `prefs.global_shortcut`: `string` (default `"Alt+Command+D"`; user-editable)
- `prefs.show_in_dock`: `boolean` (default `true`)

```rust
// src-tauri/src/commands/prefs.rs
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Prefs {
    pub theme: String,                    // "system" | "light" | "dark"
    pub refresh_interval_ms: u64,
    pub hide_to_menubar_shown: bool,
    pub start_at_login: bool,
    pub global_shortcut: String,
    pub show_in_dock: bool,
}

#[tauri::command]
pub fn get_prefs(app: AppHandle) -> Prefs { /* load from store, fill defaults */ }

#[tauri::command]
pub fn set_pref(app: AppHandle, key: String, value: serde_json::Value) -> Result<(), String> {
    // validate key & value type, persist, emit "prefs:changed"
}
```

On `set_pref` for any of `refresh_interval_ms`, `global_shortcut`, `show_in_dock`, `start_at_login`, run the corresponding side-effect (restart polling, re-register shortcut, flip activation policy, install/uninstall login item) before returning.

Typed wrapper:

```ts
// src/lib/prefs.ts
export type Theme = "system" | "light" | "dark";
export interface Prefs {
  theme: Theme;
  refreshIntervalMs: number;
  hideToMenubarShown: boolean;
  startAtLogin: boolean;
  globalShortcut: string;
  showInDock: boolean;
}
export const prefs = {
  get: () => invoke<Prefs>("get_prefs"),
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) =>
    invoke<void>("set_pref", { key: camelToSnake(key), value }),
};
```

### 9.2 Global shortcut

**Decision (Q3):** implement. Default `⌥⌘D`. User-rebindable via a recorder in General tab.

Add `tauri-plugin-global-shortcut` (v2-compatible). Register on app boot:

```rust
// src-tauri/src/lib.rs
use tauri_plugin_global_shortcut::GlobalShortcutExt;

tauri::Builder::default()
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .setup(|app| {
        let prefs = load_prefs(app.handle())?;
        register_shortcut(app.handle(), &prefs.global_shortcut)?;
        Ok(())
    })
```

```rust
// src-tauri/src/shortcut.rs
pub fn register_shortcut(app: &AppHandle, accel: &str) -> Result<(), ShortcutError> {
    let gs = app.global_shortcut();
    gs.unregister_all().ok();
    let parsed = Shortcut::from_str(accel).map_err(|_| ShortcutError::Invalid)?;
    gs.on_shortcut(parsed, move |app, _sc, event| {
        if event.state() == ShortcutState::Pressed {
            toggle_popover(app);
        }
    })?;
    Ok(())
}
```

Recorder UI lives in the General tab. Keystrokes are captured client-side via a `keydown` handler that produces the Tauri accelerator string (`"Alt+Command+D"`, `"Control+Shift+K"`, etc.) and calls `prefs.set("globalShortcut", …)`. The `set_pref` handler unregisters the old accelerator and registers the new one; on failure it rolls back and returns an error (surface as a toast in the recorder).

Reserved combos that the recorder refuses: `⌘Q`, `⌘W`, `⌘,`, `⌘Tab`, bare function keys.

### 9.3 Account health enum

Replace the current ad-hoc 401 string with a typed enum on `AccountRecord`:

```rust
#[derive(Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum AccountHealth { Ok, NeedsReauth, Revoked }
```

Persist alongside the account. Update on every dashboard-refresh cycle: `200` → `Ok`, `401` → `NeedsReauth`, `403` with known "revoked" marker → `Revoked`. The Settings `ReauthBanner` and the popover account chip read this enum; never parse error strings in UI code again.

### 9.4 `validate_token` command

For the Settings "Re-verify" button and for boot-time sanity checks.

```rust
#[tauri::command]
pub async fn validate_token(app: AppHandle, account_id: String) -> Result<AccountHealth, String> {
    let acc = store::get_account(&app, &account_id).ok_or("no such account")?;
    let token = keychain::get_token(acc.platform.key(), &account_id)
        .map_err(|_| AccountHealth::Revoked.to_string())?;
    let health = match acc.platform {
        Platform::Vercel  => fetch_vercel_profile(&token, acc.scope_id.as_deref()).await,
        Platform::Railway => fetch_railway_profile(&token).await,
    }.map(|_| AccountHealth::Ok).unwrap_or(AccountHealth::NeedsReauth);
    store::update_health(&app, &account_id, health)?;
    app.emit("accounts:changed", ()).ok();
    Ok(health)
}
```

### 9.5 Theme plumbing

**Decision (Q2):** implement a full `System / Light / Dark` toggle.

Two layers:

1. **OS-level.** Tauri 2 window theme API:

   ```rust
   #[tauri::command]
   pub fn set_window_theme(app: AppHandle, theme: String) -> Result<(), String> {
       let t = match theme.as_str() {
           "light" => Some(tauri::Theme::Light),
           "dark"  => Some(tauri::Theme::Dark),
           _ => None, // "system"
       };
       for w in app.webview_windows().values() {
           let _ = w.set_theme(t);
       }
       Ok(())
   }
   ```

   Called from `set_pref("theme", …)`.

2. **Web-level.** A small hook drives `data-theme` on `<html>`:

   ```ts
   // src/hooks/use-theme.ts
   import { useEffect } from "react";
   import { prefs } from "@/lib/prefs";
   import { listen } from "@tauri-apps/api/event";

   export function useTheme() {
     useEffect(() => {
       const mql = window.matchMedia("(prefers-color-scheme: dark)");
       let current: "system" | "light" | "dark" = "system";

       const apply = () => {
         const resolved =
           current === "system" ? (mql.matches ? "dark" : "light") : current;
         document.documentElement.dataset.theme = resolved;
       };

       prefs.get().then((p) => { current = p.theme; apply(); });
       const unlisten = listen<{ theme: typeof current }>("prefs:changed", (e) => {
         if (e.payload?.theme) { current = e.payload.theme; apply(); }
       });
       mql.addEventListener("change", apply);
       return () => { mql.removeEventListener("change", apply); unlisten.then((f) => f()); };
     }, []);
   }
   ```

   Both desktop and popover windows invoke `useTheme()` at their roots. The `data-theme` attribute drives the `:root { --* : … }` cascades from §3.

The General tab renders this as a segmented control that writes through `prefs.set("theme", …)`; no extra wiring needed in consumers.

---

## 10. Rollout plan

Six PRs, merged in order. Each is independently shippable.

1. **[x] Tokens + primitives + brand assets** — `src/index.css` rewrite with oklch tokens + `data-theme` mapping, `src/hooks/use-theme.ts` + refactored `ThemeProvider`, `src/components/dr/*` (window, tabs, icon, kbd, initials-avatar, status-glyph, provider-mark, provider-chip, menu, button, input, badge), `src/assets/providers/{vercel,railway}.svg`, `src/lib/prefs.ts` typed wrapper, `src/vite-env.d.ts` for `*.svg?raw`.
2. **[x] Prefs + theme toggle backend** — `src-tauri/src/prefs.rs` module, `get_prefs` / `set_pref` / `set_window_theme` commands registered, `prefs:changed` event emission, side-effects wiring (poll interval, dock policy, OS theme). Startup applies persisted prefs.
3. **[x] Popover rewrite** — `PopoverHeader` with account switcher, `AccountGroup`, `ProjectBlock` with expandable history, `DeployRow`, footer, 6 states, keyboard handler, `useScope`. Delete `deployment-card.tsx` and `status-icon.tsx` here.
4. **[x] Onboarding + Settings rewrite** — onboarding 3-step, `SettingsView` with Accounts/General/About tabs (General wired to the prefs commands from PR 2), hide-to-menubar dialog, re-auth banner. Delete `provider-theme.ts` here.
5. **[x] Global shortcut + dock policy wiring** — `tauri-plugin-global-shortcut` plugin, recorder UI in General, `set_activation_policy` bridge for the "Show in Dock" switch, start-at-login install.
6. **[x] Account health + validate_token** — enum on `AccountRecord`, `validate_token` command, `accounts:changed` diff, banner wiring.

---

## 11. Testing checklist

- [ ] Light + dark pass visually against the canvas (`Dev Radio Design.html`) — side-by-side screenshot diff.
- [ ] Popover row truncation: long project names, long branch names, emoji branch names.
- [ ] Status glyph renders for every `DeploymentState` variant (simulate via a `__debug/seed` command).
- [ ] Keyboard-only traversal of popover: ↑/↓, Enter, ⌘R, Esc — no focus trap.
- [ ] Re-auth banner appears when `validate_token` returns 401.
- [ ] Switching provider theme in General tab only touches the accent color — chrome stays neutral.
- [ ] Hide-to-menubar dialog appears exactly once, then never.
- [ ] High-contrast mode: status communicated by glyph even with color filters.
- [ ] VoiceOver: each status glyph announces its label (aria-label on the disc).

---

## 12. Files to delete after migration

```
src/lib/provider-theme.ts
src/components/deployment/deployment-card.tsx
src/components/deployment/status-icon.tsx
src/components/account/add-account-form.tsx       # if branded layout is fully replaced
```

**Decision (Q6):** keep `lucide-react` as a dependency. The new `Icon` primitive ships alongside for the design's 1.5-stroke glyph set, but existing lucide imports stay in place until they're organically replaced. Don't do a dep-removal sweep in this redesign PR series.

Search to confirm no orphan references after the migration:
```
grep -R "provider-theme" src/
grep -R "PROVIDER_THEMES" src/
grep -R "add-account-form" src/
```

---

## 13. Decisions (locked in)

1. **Brand marks — use real.** Ship real Vercel + Railway marks. See §8 for the updated implementation (uses the existing `public/assets/vercel.svg` and `public/assets/railway.svg`).
2. **Theme toggle — implement fully.** Segmented `System / Light / Dark` in General tab, persisted in prefs. See §9.1 + §9.5.
3. **Global shortcut — implement.** `⌥⌘D` (default) toggles the popover. User-rebindable in General tab. See §9.2.
4. **Popover header + account switcher — implement both.** The popover always groups deployments under their account header (so multi-account users see everything at a glance). The header chevron opens a menu with `All accounts` (default) plus one entry per account — picking one *filters* the list to just that account. See §7.2 + §7.6.
5. **Multiple deployments per project — expandable rows.** Each project shows its latest deployment as the primary row. A chevron on the right expands to reveal the previous 4 deployments of that project. See §7.3 + §7.7.
6. **Keep `lucide-react`.** Don't remove it. New `Icon` primitive ships alongside; existing lucide imports stay until organically replaced. §12 updated accordingly.

---

## 14. Appendix — mental model for implementers

- **Chrome stays neutral.** Provider color only tints provider marks and the single large OAuth CTA on the Connect step. Everything else uses `--text` / `--muted` / `--faint`.
- **Density is compact.** 13px body, 12px meta, 11px faint. Row heights: 40/44/48. Padding: 4/8/12/16.
- **Monospace is earned.** Use JetBrains Mono only for SHAs, tokens, URLs, shortcuts. Never for prose.
- **No gradients. No shadows other than the window drop-shadow.** Borders are 0.5px via `--border-subtle`.
- **Animations are disciplined.** One pulse for `building`. One fade-in for popover mount. Nothing else.
- **The dashboard state shape does not change.** Types in `src/lib/deployments.ts` are the contract between Rust and the UI. If the UI wants a derived field, compute it in the component, not in Rust.
