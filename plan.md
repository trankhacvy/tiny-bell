# Dev Radio UI — Design Alignment Plan

This plan covers every gap between the current implementation and the design reference (`Dev Radio Design _standalone_.html`). Items are ordered by blast radius — biggest visual impact first.

---

## 1. Deploy Row — Complete Rebuild ✅

**Files:** `src/components/popover/deploy-row.tsx`

The row is the single most-repeated element in the app. The current layout is structurally wrong. The design specifies a strict 2-line layout; the current code renders a 1-title + 1-flat-meta structure.

### Design spec (exact)

```
Row: padding 9px 14px, border-b border-s, hover:bg-hover
  Left accent bar: 2px wide, top 4 / bottom 4, visible only when focused

Line 1 (flex row, items-center, gap 6):
  [StatusGlyph 12px]  [project-name fw-600 13px truncate]
  [EnvPill]  [DomainTag or ServiceBadge]  [flex-1]  [time mono 11px shrink-0]

Line 2 (flex row, items-center, gap 6, mt 3):
  [AuthorAvatar 13px]  [commit-message 12px text-2 truncate flex-1]
  [branch mono 10.5px text-3 max-w-[90px] truncate shrink-0]

Expand panel (visible when row is focused, indent paddingLeft 22):
  [Open site btn secondary sm]  [Logs btn ghost sm]  [flex-1]
  [↵ open hint]  [⇧↵ logs hint]
```

### New sub-components to add inside `deploy-row.tsx`

#### `EnvPill`
```tsx
function EnvPill({ env }: { env: string }) {
  const isProd = env === "production" || env === "prod"
  return (
    <span
      className={cn(
        "shrink-0 rounded-[3px] border px-[5px] py-[1px] text-[10px] font-semibold uppercase tracking-[0.5px]",
        isProd
          ? "border-border bg-surface-2 text-foreground"
          : "border-border bg-transparent text-faint"
      )}
    >
      {isProd ? "prod" : env}
    </span>
  )
}
```

#### `DomainTag` (Vercel only)
```tsx
function DomainTag({ domain }: { domain: string }) {
  return (
    <span className="max-w-[140px] truncate font-mono-tabular text-[10.5px] text-faint">
      {domain}
    </span>
  )
}
```

#### `ServiceBadge` (Railway only)
```tsx
function ServiceBadge({ name }: { name: string }) {
  // deterministic hue from service name
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  const bg = `oklch(0.93 0.035 ${hue})`
  const fg = `oklch(0.38 0.12 ${hue})`
  return (
    <span
      className="inline-flex max-w-[120px] shrink-0 items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-[3px] px-[6px] py-0 font-mono-tabular text-[10.5px] font-semibold"
      style={{ height: 17, background: bg, color: fg }}
    >
      <span className="size-[5px] shrink-0 rounded-[1px]" style={{ background: fg }} />
      {name}
    </span>
  )
}
```

#### Author avatar
```tsx
function AuthorAvatar({ name }: { name: string }) {
  // reuse InitialsAvatar at 13px
  return <InitialsAvatar name={name} size={13} />
}
```

### New `DeployRow` component

```tsx
export function DeployRow({ deployment, project, focused }: DeployRowProps) {
  const target = deployment.inspector_url ?? deployment.url
  const commitMsg = deployment.commit_message?.split("\n")[0]?.trim() ?? null
  const branch = deployment.branch ?? null
  const author = deployment.author_name ?? null
  const time = formatRelative(deployment.created_at)
  const isPlatform = (p: Platform) => project?.platform === p

  const meta = isPlatform("railway") && deployment.service_name ? (
    <>
      <ServiceBadge name={deployment.service_name} />
      <EnvPill env={deployment.environment} />
    </>
  ) : (
    <>
      <EnvPill env={deployment.environment} />
      {project?.url ? <DomainTag domain={stripProtocol(project.url)} /> : null}
    </>
  )

  return (
    <div
      role="button"
      tabIndex={0}
      data-deploy-row
      data-deploy-id={deployment.id}
      onClick={() => target && void openUrl(target)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); target && void openUrl(target) }
        if (e.key === "Enter" && e.shiftKey) {
          e.preventDefault()
          const logs = deployment.inspector_url ?? deployment.url
          if (logs) void openUrl(logs)
        }
      }}
      className={cn(
        "relative cursor-default border-b border-border-subtle px-[14px] py-[9px] outline-none last:border-b-0",
        focused ? "bg-hover" : "hover:bg-hover",
      )}
    >
      {focused && (
        <span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-[1px] bg-foreground" />
      )}

      {/* Line 1 */}
      <div className="flex min-w-0 items-center gap-[6px]">
        <StatusGlyph status={deployment.state} size={12} />
        <span className="truncate text-[13px] font-semibold leading-none text-foreground" style={{ letterSpacing: -0.1 }}>
          {project?.name ?? deployment.project_id}
        </span>
        {meta}
        <span className="flex-1" />
        <span className="shrink-0 font-mono-tabular text-[11px] text-faint">{time}</span>
      </div>

      {/* Line 2 */}
      <div className="mt-[3px] flex min-w-0 items-center gap-[6px]">
        {author && <AuthorAvatar name={author} />}
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
          {commitMsg ?? branch ?? "—"}
        </span>
        {branch && (
          <span className="max-w-[90px] shrink-0 truncate font-mono-tabular text-[10.5px] text-faint">
            {branch}
          </span>
        )}
      </div>

      {/* Expand panel */}
      {focused && (
        <div className="mt-[8px] flex items-center gap-[6px] pl-[22px]">
          <DRButton variant="secondary" size="sm" leading={<Icon name="external" size={11} />}
            className="h-6 px-[9px] text-[11.5px]"
            onClick={(e) => { e.stopPropagation(); target && void openUrl(target) }}>
            Open site
          </DRButton>
          <DRButton variant="ghost" size="sm" leading={<Icon name="external" size={11} />}
            className="h-6 px-2 text-[11.5px]"
            onClick={(e) => { e.stopPropagation(); deployment.inspector_url && void openUrl(deployment.inspector_url) }}>
            Logs
          </DRButton>
          <span className="flex-1" />
          <span className="flex items-center gap-1 text-[10.5px] text-faint">
            <Kbd className="h-[14px] min-w-[14px] text-[9px]">↵</Kbd>
            <span>open</span>
            <Kbd className="ml-1 h-[14px] min-w-[14px] text-[9px]">⇧↵</Kbd>
            <span>logs</span>
          </span>
        </div>
      )}
    </div>
  )
}
```

**`focused` state management** — add to `popover-app.tsx`: track `focusedId` alongside the existing arrow-key `moveFocus` logic. When arrow keys move focus to a `[data-deploy-row]` element, set `focusedId` to its `data-deploy-id`. Pass `focused={deployment.id === focusedId}` to each `<DeployRow>`.

---

## 2. Account Group Headers in the Deployment List ✅

**Files:** `src/app/popover/popover-app.tsx`

Currently a flat `<ul>`. The design groups deployments by account with a sticky group header.

### New `AccountGroupHeader` component

Create `src/components/popover/account-group-header.tsx`:

```tsx
import { ProviderMark } from "@/components/dr/provider-mark"
import type { Platform } from "@/lib/accounts"

type Props = {
  label: string          // e.g. "Sundial Labs · Vercel"
  platform: Platform
  count: number
}

export function AccountGroupHeader({ label, platform, count }: Props) {
  return (
    <div className="flex items-center gap-[7px] px-[14px] pb-1 pt-[10px]">
      <ProviderMark platform={platform} size={11} className="shrink-0 text-faint" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
        {label}
      </span>
      <span className="font-mono-tabular text-[10px] font-medium text-faint opacity-70">
        · {count}
      </span>
    </div>
  )
}
```

### Grouping logic in `popover-app.tsx`

Replace the flat `<ul>` render with grouped sections:

```tsx
// Build groups: [{ account, deployments[] }]
const groups = useMemo(() => {
  const accountMap = new Map(accounts.map((a) => [a.id, a]))
  const byAccount = new Map<string, Deployment[]>()

  for (const d of filteredDeployments) {
    const project = projectsById.get(d.project_id)
    if (!project) continue
    const list = byAccount.get(project.account_id) ?? []
    list.push(d)
    byAccount.set(project.account_id, list)
  }

  return [...byAccount.entries()]
    .map(([accountId, deps]) => ({
      account: accountMap.get(accountId) ?? null,
      deployments: deps,
    }))
    .filter((g) => g.account !== null)
}, [filteredDeployments, accounts, projectsById])

// In JSX:
<div ref={listRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
  {/* ... state guards ... */}
  {groups.map(({ account, deployments }) => (
    <section key={account!.id}>
      <AccountGroupHeader
        label={account!.display_name}
        platform={account!.platform}
        count={deployments.length}
      />
      {deployments.map((d) => (
        <DeployRow
          key={`${d.project_id}:${d.id}`}
          deployment={d}
          project={projectsById.get(d.project_id) ?? null}
          focused={d.id === focusedId}
        />
      ))}
    </section>
  ))}
</div>
```

---

## 3. Popover Header — Health Summary Pill ✅

**Files:** `src/components/popover/popover-header.tsx`

The header must show a health summary pill (colored capsule with text) rather than account navigation. Account/project filtering moves to a separate `FilterBar` below it (see §4).

### New header structure

```tsx
type Tone = "healthy" | "building" | "broken"

function deriveHeaderTone(deployments: Deployment[]): Tone {
  if (deployments.some((d) => d.state === "error")) return "broken"
  if (deployments.some((d) => d.state === "building" || d.state === "queued")) return "building"
  return "healthy"
}

function buildSummary(deployments: Deployment[], tone: Tone): string {
  if (deployments.length === 0) return "All ready"
  const errors = deployments.filter((d) => d.state === "error").length
  const building = deployments.filter((d) => d.state === "building" || d.state === "queued").length
  const ready = deployments.filter((d) => d.state === "ready").length
  if (tone === "broken") return `${errors} error${errors > 1 ? "s" : ""} · ${ready} ready`
  if (tone === "building") return `${building} building · ${ready} ready`
  return "All ready"
}

export function PopoverHeader({ deployments, refreshing, onRefresh, onOpenDesktop }: Props) {
  const tone = deriveHeaderTone(deployments)

  const toneColor =
    tone === "broken" ? "var(--red)" :
    tone === "building" ? "var(--amber)" :
    "var(--green)"

  const toneBg =
    tone === "broken"   ? "color-mix(in oklch, var(--red) 14%, transparent)" :
    tone === "building" ? "color-mix(in oklch, var(--amber) 18%, transparent)" :
                          "color-mix(in oklch, var(--green) 14%, transparent)"

  return (
    <header className="flex h-[42px] shrink-0 items-center gap-2 border-b border-border-subtle bg-surface px-[14px] py-[10px]">
      {/* Health pill */}
      <div
        className="inline-flex h-[22px] items-center gap-[7px] rounded-full px-[8px] text-[11.5px] font-semibold"
        style={{ background: toneBg, color: toneColor }}
      >
        <span
          className="size-[7px] shrink-0 rounded-full"
          style={{
            background: toneColor,
            animation: tone === "building" ? "dr-pulse-dot 1.4s ease-in-out infinite" : "none",
          }}
        />
        {buildSummary(deployments, tone)}
      </div>
      <span className="flex-1" />
      {/* Refresh */}
      <IconButton
        name="refresh"
        size={13}
        tooltip="Refresh (⌘R)"
        className={refreshing ? "animate-spin" : undefined}
        onClick={onRefresh}
      />
      {/* Open desktop */}
      <IconButton
        name="external"
        size={12}
        tooltip="Open Dev Radio"
        onClick={onOpenDesktop}
      />
    </header>
  )
}
```

Add `dr-pulse-dot` keyframe to `index.css`:
```css
@keyframes dr-pulse-dot {
  0%, 100% { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
  50%       { box-shadow: 0 0 0 3px transparent; opacity: 0.7; }
}
```

**Update `popover-app.tsx`** to pass `deployments={filteredDeployments}` and remove the old `accounts`/`scope`/`projects` props from `PopoverHeader`. Those props move to `FilterBar`.

---

## 4. Separate Filter Bar Component ✅

**Files:** Create `src/components/popover/filter-bar.tsx`, update `popover-app.tsx`

The filter bar is a distinct row below the header, always visible when accounts exist.

```tsx
// src/components/popover/filter-bar.tsx

type Props = {
  accounts: AccountRecord[]
  scope: Scope
  onScopeChange: (s: Scope) => void
  projects: Project[]
  selectedProjectIds: Set<string>
  onSelectedProjectIdsChange: (next: Set<string>) => void
}

export function FilterBar({ accounts, scope, onScopeChange, projects, selectedProjectIds, onSelectedProjectIdsChange }: Props) {
  const [accountOpen, setAccountOpen] = useState(false)
  const current = scope === "all" ? null : accounts.find((a) => a.id === scope) ?? null

  const allProjects = selectedProjectIds.size === 0 || selectedProjectIds.size === projects.length
  const projectLabel = allProjects
    ? "All projects"
    : selectedProjectIds.size === 1
      ? "1 project"
      : `${selectedProjectIds.size} projects`

  return (
    <div className="flex shrink-0 items-center gap-[6px] border-b border-border-subtle bg-surface px-[10px] py-[8px]">
      {/* Account picker — flex-1 */}
      <AccountPicker
        accounts={accounts}
        scope={scope}
        onScopeChange={onScopeChange}
        open={accountOpen}
        onOpenChange={setAccountOpen}
        current={current}
      />
      {/* Project multi-select — max-w-[140px] */}
      <ProjectFilter
        projects={projects}
        selected={selectedProjectIds}
        onChange={onSelectedProjectIdsChange}
        label={projectLabel}
        count={allProjects ? 0 : selectedProjectIds.size}
      />
    </div>
  )
}
```

### `AccountPicker` button inside `FilterBar`

```tsx
function AccountPicker({ accounts, scope, onScopeChange, open, onOpenChange, current }) {
  return (
    <DRMenu open={open} onOpenChange={onOpenChange} trigger={
      <button
        type="button"
        className={cn(
          "flex h-[28px] min-w-0 flex-1 items-center gap-[7px] rounded-[6px] border px-[8px] outline-none",
          open ? "border-faint bg-hover" : "border-border bg-transparent hover:bg-hover",
        )}
      >
        <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-[4px] border border-border bg-surface-2">
          <ProviderMark
            platform={current?.platform ?? (accounts[0]?.platform ?? "vercel")}
            size={10}
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-[12.5px] font-semibold text-foreground" style={{ letterSpacing: -0.1 }}>
          {current ? current.display_name : "All accounts"}
        </span>
        <Icon name="chevron-down" size={11} className="shrink-0 text-faint" />
      </button>
    }>
      {/* All accounts option */}
      <DRMenuItem onSelect={() => onScopeChange("all")}>
        <span className="flex items-center gap-[10px]">
          <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-[5px] border border-border bg-surface-2">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-muted-foreground">
              <circle cx="3.5" cy="3.5" r="1.5"/><circle cx="7.5" cy="3.5" r="1.5"/>
              <circle cx="3.5" cy="7.5" r="1.5"/><circle cx="7.5" cy="7.5" r="1.5"/>
            </svg>
          </span>
          <span className="flex flex-col">
            <span className="text-[12.5px] font-semibold">All accounts</span>
            <span className="text-[11px] text-faint">{accounts.length} connected · all deploys</span>
          </span>
        </span>
        {scope === "all" && <Icon name="check" size={13} className="ml-auto text-foreground" />}
      </DRMenuItem>
      <DRMenuSeparator />
      {/* Group by provider */}
      {(["vercel", "railway"] as Platform[]).map((p) => {
        const group = accounts.filter((a) => a.platform === p)
        if (group.length === 0) return null
        return (
          <React.Fragment key={p}>
            <DRMenuLabel>{p === "vercel" ? "Vercel" : "Railway"}</DRMenuLabel>
            {group.map((acc) => (
              <DRMenuItem key={acc.id} onSelect={() => onScopeChange(acc.id)}>
                <span className="flex items-center gap-[10px]">
                  <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-[5px] border border-border bg-surface-2">
                    <ProviderMark platform={acc.platform} size={11} />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[12.5px] font-medium">{acc.display_name}</span>
                    <span className="flex items-center gap-1 text-[11px] text-faint">
                      {acc.health === "needs_reauth" && <span className="size-[5px] shrink-0 rounded-full" style={{ background: "var(--amber)" }} />}
                      {acc.health === "revoked" && <span className="size-[5px] shrink-0 rounded-full" style={{ background: "var(--red)" }} />}
                    </span>
                  </span>
                </span>
                {scope === acc.id && <Icon name="check" size={13} className="ml-auto" />}
              </DRMenuItem>
            ))}
          </React.Fragment>
        )
      })}
      <DRMenuSeparator />
      <DRMenuItem onSelect={() => void windowApi.openDesktop("onboarding")}>
        <Icon name="plus" size={12} /> Add account…
      </DRMenuItem>
    </DRMenu>
  )
}
```

### Restyle `ProjectFilter` to match the design button

The current `ProjectFilter` uses a rounded pill. Replace trigger styling:
```tsx
// Change trigger button className from rounded-full pill to:
className={cn(
  "flex h-[28px] max-w-[140px] items-center gap-[6px] rounded-[6px] border px-[8px] outline-none",
  open ? "border-faint bg-hover" : "border-border bg-transparent hover:bg-hover",
)}
```

And change the icon from `filter` to the folder SVG from the design:
```tsx
<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className="shrink-0 text-muted-foreground">
  <path d="M1 3 h4 l1 1 h5 v6 h-10 z"/>
</svg>
```

Add count badge when projects are filtered:
```tsx
{!allProjects && (
  <span className="min-w-[14px] rounded-full bg-foreground px-[5px] py-0 text-center text-[9.5px] font-semibold text-surface">
    {selectedProjectIds.size}
  </span>
)}
```

### Wire everything in `popover-app.tsx`

```tsx
// After <PopoverHeader> and before the list:
{hasAccounts && (
  <FilterBar
    accounts={accounts}
    scope={scope}
    onScopeChange={setScope}
    projects={scopedProjects}
    selectedProjectIds={selectedProjectIds}
    onSelectedProjectIdsChange={setSelectedProjectIds}
  />
)}
```

---

## 5. Popover Footer ✅

**Files:** `src/components/popover/popover-footer.tsx`

### Changes

1. Add green status dot on the left
2. Add "Every {interval}" text
3. Remove `⌘,` and `⌘Q` shortcut hints (design only shows `⌘R`)

```tsx
type PopoverFooterProps = {
  lastRefreshedAt: number | null
  offline?: boolean
  intervalLabel?: string   // e.g. "30s", "1m" — pass from prefs
}

export function PopoverFooter({ lastRefreshedAt, offline, intervalLabel = "30s" }: PopoverFooterProps) {
  return (
    <footer className="flex h-[36px] shrink-0 items-center gap-2 border-t border-border-subtle bg-surface px-[14px]">
      {/* Status dot */}
      <span
        className="size-[5px] shrink-0 rounded-full opacity-80"
        style={{ background: offline ? "var(--amber)" : "var(--green)" }}
      />
      <span className="truncate text-[11px] text-faint">
        {offline
          ? "Offline"
          : lastRefreshedAt
            ? `Updated ${formatRelative(lastRefreshedAt)}`
            : "Connecting…"}
      </span>
      {!offline && (
        <>
          <span className="text-[11px] text-faint/50">·</span>
          <span className="shrink-0 text-[11px] text-faint">Every {intervalLabel}</span>
        </>
      )}
      <span className="flex-1" />
      <span className="flex shrink-0 items-center gap-1 text-[10.5px] text-faint">
        <Kbd className="h-[14px] min-w-[14px] text-[9px]">⌘</Kbd>
        <Kbd className="h-[14px] min-w-[14px] text-[9px]">R</Kbd>
        <span className="ml-1">refresh</span>
      </span>
    </footer>
  )
}
```

**Pass `intervalLabel`** from `popover-app.tsx` by reading `prefs.refresh_interval_ms` and converting to a label string:
```tsx
function msToLabel(ms: number): string {
  if (ms < 60_000) return `${ms / 1000}s`
  return `${ms / 60_000}m`
}
```

---

## 6. Popover State Screens ✅

### 6a. Empty State — `src/components/popover/states/empty.tsx`

```tsx
export function PopoverEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
      <div className="mb-[14px] flex size-[44px] items-center justify-center rounded-full border border-dashed border-border text-faint">
        <Icon name="dot" size={14} />
      </div>
      <p className="mb-1 text-[13px] font-semibold text-foreground">
        Suspiciously quiet.
      </p>
      <p className="max-w-[240px] text-[12px] leading-[1.5] text-muted-foreground">
        Your accounts are connected but no deployments have landed yet. Push
        something and we'll start listening.
      </p>
    </div>
  )
}
```

### 6b. No Accounts State — `src/components/popover/states/no-accounts.tsx`

```tsx
export function PopoverNoAccounts() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
      <div className="mb-[14px]">
        {/* Dev Radio wordmark — radio wave SVG */}
        <svg width="32" height="32" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-faint">
          <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>
          <path d="M5 5 Q3 8 5 11" /><path d="M11 5 Q13 8 11 11" />
          <path d="M2.5 3 Q-0.5 8 2.5 13" opacity="0.5"/>
          <path d="M13.5 3 Q16.5 8 13.5 13" opacity="0.5"/>
        </svg>
      </div>
      <p className="mb-[6px] text-[16px] font-semibold text-foreground" style={{ letterSpacing: -0.2 }}>
        Nothing to listen to.
      </p>
      <p className="mb-[16px] max-w-[260px] text-[12px] leading-[1.5] text-muted-foreground">
        Connect a Vercel or Railway account and Dev Radio will start tracking
        your deploys.
      </p>
      <DRButton
        variant="primary"
        size="sm"
        leading={<Icon name="external" size={12} />}
        onClick={() => void windowApi.openDesktop("onboarding")}
      >
        Open Dev Radio
      </DRButton>
    </div>
  )
}
```

### 6c. Offline State — `src/components/popover/states/offline.tsx`

The offline state must **not** replace the list. Instead it renders an amber banner at the top while showing stale deployments below at reduced opacity. This requires lifting the pattern into `popover-app.tsx`.

**Change `popover-app.tsx`** render logic:

```tsx
// Instead of: state.offline ? <PopoverOffline /> : ...
// Do:
<div ref={listRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
  {state.offline && <OfflineBanner lastRefreshedAt={state.last_refreshed_at} />}
  <div className={state.offline ? "opacity-65 pointer-events-none" : ""}>
    {/* normal grouped list */}
  </div>
</div>
```

Create `src/components/popover/states/offline-banner.tsx`:

```tsx
export function OfflineBanner({ lastRefreshedAt }: { lastRefreshedAt: number | null }) {
  const ago = lastRefreshedAt ? formatRelative(lastRefreshedAt) : null
  return (
    <div
      className="flex shrink-0 items-start gap-[8px] border-b px-[14px] py-[10px]"
      style={{
        background: "color-mix(in oklch, var(--amber) 14%, transparent)",
        borderColor: "color-mix(in oklch, var(--amber) 30%, transparent)",
      }}
    >
      <Icon name="warning" size={13} className="mt-px shrink-0 text-warning" />
      <div className="flex-1">
        <p className="text-[12px] font-semibold text-foreground">Can't reach the provider</p>
        <p className="mt-0.5 text-[11.5px] leading-[1.4] text-muted-foreground">
          {ago
            ? `Showing last-known snapshot from ${ago}.`
            : "Network unavailable."}
        </p>
      </div>
      <DRButton
        variant="ghost"
        size="sm"
        className="h-[22px] px-[6px] text-[11px]"
        onClick={() => void deploymentsApi.refreshNow()}
      >
        Retry
      </DRButton>
    </div>
  )
}
```

### 6d. Rate Limit State — `src/components/popover/states/rate-limit.tsx`

Same banner-not-replacement pattern. Change from full-screen to a thin banner at top:

```tsx
export function RateLimitBanner() {
  return (
    <div className="flex shrink-0 items-center gap-[8px] border-b border-border-subtle bg-surface-2 px-[14px] py-[9px]">
      <Icon name="clock" size={12} className="shrink-0 text-muted-foreground" />
      <span className="flex-1 text-[11.5px] text-muted-foreground">
        Rate-limited by provider — backing off. Retry soon.
      </span>
    </div>
  )
}
```

### 6e. Loading State — `src/components/popover/states/loading.tsx`

Add the "Tuning in…" header row and expand to 6 skeleton rows:

```tsx
export function PopoverLoading() {
  const SkeletonRow = () => (
    <div className="flex items-center gap-[10px] border-b border-border-subtle px-[14px] py-[10px]">
      <span className="size-3 shrink-0 rounded-full bg-surface-2" />
      <div className="flex flex-1 flex-col gap-[5px]">
        <span className="h-[10px] w-[55%] rounded-[3px] bg-surface-2" />
        <span className="h-[8px] w-[80%] rounded-[3px] bg-surface-2/70" />
      </div>
      <span className="h-[8px] w-[30px] rounded-[3px] bg-surface-2/70" />
    </div>
  )

  return (
    <div className="flex flex-1 flex-col animate-pulse">
      <div className="flex items-center gap-[8px] border-b border-border-subtle bg-surface px-[14px] py-[10px]">
        <span
          className="size-[10px] rounded-full border-[1.5px] border-border"
          style={{ borderTopColor: "var(--text)", animation: "dr-spin 0.8s linear infinite" }}
        />
        <span className="text-[12px] text-faint">Tuning in…</span>
      </div>
      <SkeletonRow /><SkeletonRow /><SkeletonRow />
      <SkeletonRow /><SkeletonRow /><SkeletonRow />
    </div>
  )
}
```

Add `dr-spin` to `index.css` (may already exist; if not):
```css
@keyframes dr-spin { to { transform: rotate(360deg); } }
```

---

## 7. Onboarding — Welcome Step ✅

**Files:** `src/app/desktop/views/onboarding-view.tsx`, `WelcomeStep`

The current `WelcomeStep` uses a 2-column card grid. The design uses a vertical list with "Available now" / "Coming soon" sections, left-aligned layout, and a sticky bottom footer bar.

### Restructure `WelcomeStep`

```tsx
const AVAILABLE: { platform: Platform; desc: string }[] = [
  { platform: "vercel", desc: "OAuth or personal access token · Teams supported" },
  { platform: "railway", desc: "Personal access token · Projects & environments" },
]

const COMING_SOON = [
  { label: "Netlify", desc: "On the roadmap" },
  { label: "Render", desc: "On the roadmap" },
  { label: "GitHub Actions", desc: "On the roadmap" },
]

function WelcomeStep({ onPick }: WelcomeStepProps) {
  const [selected, setSelected] = useState<Platform | null>(null)

  return (
    // Remove px-10 pt-10 from parent — use full-bleed layout
    <div className="flex flex-1 flex-col">
      {/* Content area */}
      <div className="flex-1 overflow-auto px-8 pt-7 pb-4">
        <h1 className="mb-[6px] font-display text-[22px] font-semibold text-foreground" style={{ letterSpacing: -0.4, lineHeight: 1.2 }}>
          Let's get you connected.
        </h1>
        <p className="mb-6 max-w-[380px] text-[13px] leading-[1.5] text-muted-foreground">
          Dev Radio watches your deploys so you don't have to. Pick a provider
          to start — you can add more later.
        </p>

        {/* Available now */}
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
          Available now
        </p>
        <div className="mb-6 flex flex-col gap-2">
          {AVAILABLE.map(({ platform, desc }) => {
            const isSelected = selected === platform
            return (
              <button
                key={platform}
                type="button"
                onClick={() => setSelected(platform)}
                className={cn(
                  "flex items-center gap-3 rounded-[8px] border p-[12px_14px] text-left transition-colors",
                  isSelected
                    ? "border-foreground bg-surface-2"
                    : "border-border hover:bg-hover",
                )}
                style={{
                  boxShadow: isSelected ? "inset 0 0 0 0.5px rgba(0,0,0,0.08)" : "none",
                }}
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-border bg-surface-2">
                  <ProviderMark platform={platform} size={18} />
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-semibold text-foreground">{PLATFORM_LABEL[platform]}</span>
                  <span className="block text-[12px] text-faint">{desc}</span>
                </span>
                {isSelected && <Icon name="check" size={14} className="shrink-0 text-foreground" />}
              </button>
            )
          })}
        </div>

        {/* Coming soon */}
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
          Coming soon
        </p>
        <div className="flex flex-col gap-2">
          {COMING_SOON.map(({ label, desc }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-[8px] border border-border p-[12px_14px] opacity-50"
            >
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-border bg-surface-2 text-[11px] font-semibold text-faint">
                {label[0]}
              </span>
              <span className="flex-1">
                <span className="block text-[13px] font-semibold text-foreground">{label}</span>
                <span className="block text-[12px] text-faint">{desc}</span>
              </span>
              <DRBadge tone="neutral">Soon</DRBadge>
            </div>
          ))}
        </div>
      </div>

      {/* Sticky footer */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-subtle px-8 py-4">
        <span className="text-[12px] text-faint">Step 1 of 3</span>
        <div className="flex gap-2">
          <DRButton variant="ghost" size="sm" onClick={() => onPick(["vercel"])}>
            Skip for now
          </DRButton>
          <DRButton
            variant="primary"
            size="sm"
            disabled={!selected}
            trailing={<Icon name="chevron-right" size={13} />}
            onClick={() => selected && onPick([selected])}
          >
            Continue with {selected ? PLATFORM_LABEL[selected] : "…"}
          </DRButton>
        </div>
      </div>
    </div>
  )
}
```

---

## 8. Onboarding — Connect Steps ✅

**Files:** `src/app/desktop/views/onboarding-view.tsx`, `ConnectStep` + `src/components/account/add-account-form.tsx`

### Hero strip

Wrap the `ConnectStep` content with a provider-tinted hero strip at the top:

```tsx
function ConnectStep({ platform, onConnected, onSkip }: ConnectStepProps) {
  const heroGradient = platform === "vercel"
    ? "linear-gradient(180deg, oklch(0.97 0.003 85) 0%, var(--bg) 100%)"
    : "linear-gradient(180deg, oklch(0.97 0.022 285) 0%, var(--bg) 100%)"

  return (
    <div className="flex flex-1 flex-col">
      {/* Hero strip */}
      <div
        className="shrink-0 border-b border-border-subtle px-8 pb-[22px] pt-7"
        style={{ background: heroGradient }}
      >
        <div className="mb-4 flex items-center gap-[10px]">
          <DRButton variant="ghost" size="sm" className="h-[22px] px-[6px]"
            leading={<Icon name="chevron-right" size={12} className="rotate-180" />}
            onClick={onSkip}
          >
            Back
          </DRButton>
          <span className="text-[12px] text-faint">Step 2 of 3</span>
        </div>
        <div className="flex items-center gap-[14px]">
          <span
            className="inline-flex size-[44px] shrink-0 items-center justify-center rounded-[10px] border border-border"
            style={{ background: platform === "vercel" ? "oklch(0.98 0 0)" : "oklch(0.96 0.02 285)" }}
          >
            <ProviderMark platform={platform} size={22} />
          </span>
          <div>
            <h1 className="font-display text-[18px] font-semibold text-foreground" style={{ letterSpacing: -0.3 }}>
              Connect {PLATFORM_LABEL[platform]}
            </h1>
            <p className="mt-[2px] text-[12px] text-muted-foreground">
              {platform === "vercel"
                ? "Read-only access to your projects and deployments."
                : "Paste a token. OAuth isn't supported by Railway yet."}
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto px-8 py-5">
        <AddAccountForm platform={platform} onConnected={onConnected} />
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-8 py-[14px]">
        <DRButton variant="ghost" size="sm" onClick={onSkip}>Cancel</DRButton>
        {/* The form's submit is handled internally; this is a hint button only */}
      </div>
    </div>
  )
}
```

### Token validation inline state in `AddAccountForm`

**File:** `src/components/account/add-account-form.tsx`

After successful token validation (before the form is submitted), show an inline green indicator in the input suffix:

```tsx
// In the token input row, add a suffix slot:
<div className="relative">
  <input ... className="... pr-20" />
  {validState === "valid" && (
    <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
      <span className="size-[6px] rounded-full" style={{ background: "var(--green)" }} />
      <span className="text-[11px] font-medium text-success">Valid</span>
    </span>
  )}
</div>
{validState === "valid" && tokenOwner && (
  <p className="mt-1.5 text-[11.5px] text-faint">
    Token looks good — workspace <span className="text-muted-foreground">{tokenOwner}</span>.
  </p>
)}
```

### "How to get one" block for Railway

```tsx
{platform === "railway" && (
  <div className="mt-[18px] rounded-[8px] border border-border bg-surface-2 p-[14px]">
    <p className="mb-2 text-[12px] font-semibold text-foreground">How to get one</p>
    <ol className="list-decimal pl-[18px] text-[12px] leading-[1.7] text-muted-foreground marker:text-faint">
      <li>Open <code className="font-mono-tabular text-[11.5px]">railway.app/account/tokens</code></li>
      <li>Create a token named <strong className="font-medium text-foreground">Dev Radio</strong></li>
      <li>Paste it above. Stored in Keychain.</li>
    </ol>
  </div>
)}
```

---

## 9. Onboarding — Success Step ✅

**Files:** `src/app/desktop/views/onboarding-view.tsx`, `SuccessStep`

```tsx
function SuccessStep({ connected, projects, onDone }: SuccessStepProps) {
  // projects is the DashboardState.projects fetched after connect
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-auto px-8 pt-10 pb-4">
        <div className="mb-[16px] flex size-[52px] items-center justify-center rounded-full"
          style={{ background: "color-mix(in oklch, var(--green) 18%, transparent)", margin: "0 auto 16px" }}>
          <Icon name="check" size={22} className="text-success" />
        </div>
        <h1 className="mb-1 text-center font-display text-[20px] font-semibold text-foreground" style={{ letterSpacing: -0.3 }}>
          You're on the air.
        </h1>
        <p className="mx-auto mb-5 max-w-[360px] text-center text-[13px] text-muted-foreground">
          Found <strong className="font-semibold text-foreground">{projects.length} project{projects.length !== 1 ? "s" : ""}</strong> across your accounts.
          Dev Radio will check them every 30 seconds.
        </p>

        {/* Project preview card */}
        {connected.length > 0 && (
          <div className="mx-auto max-w-[420px] rounded-[8px] border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-[9px]">
              <ProviderMark platform={connected[0].platform} size={12} className="text-muted-foreground" />
              <span className="text-[11.5px] font-semibold text-muted-foreground">
                {connected[0].display_name}
              </span>
              <span className="flex-1" />
              <span className="font-mono-tabular text-[11px] text-faint">
                {projects.length} projects
              </span>
            </div>
            {projects.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center gap-[10px] border-b border-border-subtle px-3 py-[9px] last:border-b-0">
                <span className="size-[7px] shrink-0 rounded-full" style={{
                  background: p.latest_deployment?.state === "error" ? "var(--red)"
                    : p.latest_deployment?.state === "building" ? "var(--amber)"
                    : "var(--green)"
                }} />
                <span className="flex-1 truncate text-[12.5px] font-medium text-foreground">{p.name}</span>
                <span className="font-mono-tabular text-[11px] text-faint">
                  {p.latest_deployment ? formatRelative(p.latest_deployment.created_at) : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-border-subtle px-8 py-[14px]">
        <DRButton variant="ghost" size="sm" leading={<Icon name="plus" size={12} />}
          onClick={() => { /* reset to connect step */ }}>
          Add another account
        </DRButton>
        <DRButton variant="primary" size="sm" onClick={onDone}
          trailing={<Kbd className="ml-1 bg-white/15 text-inherit border-white/20">⌃⌥R</Kbd>}>
          Open menubar
        </DRButton>
      </div>
    </div>
  )
}
```

**Note:** To populate `projects` in `SuccessStep`, fetch `deploymentsApi.getDashboard()` after `onConnected` resolves and pass `state.projects` down.

---

## 10. Settings — Accounts Tab ✅

**Files:** `src/app/desktop/views/settings/accounts-tab.tsx`

### Changes

1. Subtitle shows "N accounts · polling every 30s"
2. Account rows use `DRBadge` instead of a plain dot
3. Row adds "last sync X ago"
4. "Add another" 2-column grid of provider buttons at the bottom

```tsx
// Header
<header className="flex items-baseline justify-between">
  <div>
    <h2 className="text-[14px] font-semibold text-foreground" style={{ letterSpacing: -0.1 }}>
      Connected accounts
    </h2>
    <p className="mt-0.5 text-[12px] text-faint">
      {accounts.length} account{accounts.length !== 1 ? "s" : ""} · polling every 30s
    </p>
  </div>
  <DRButton variant="secondary" size="sm" leading={<Icon name="plus" size={12} />}
    onClick={() => setDialogOpen(true)}>
    Add account
  </DRButton>
</header>

// Account row — 4-column grid
<li
  key={acc.id}
  className="grid items-center gap-3 border-b border-border-subtle px-[14px] py-[11px] last:border-b-0"
  style={{ gridTemplateColumns: "28px 1fr auto auto" }}
>
  <span className="inline-flex size-7 items-center justify-center rounded-[6px] border border-border bg-surface-2">
    <ProviderMark platform={acc.platform} size={14} />
  </span>
  <div className="min-w-0">
    <span className="block truncate text-[12.5px] font-semibold text-foreground">
      {acc.display_name}
    </span>
    <span className="block text-[11.5px] text-faint">
      {acc.email ?? PLATFORM_LABEL[acc.platform]}
      {" · "}{/* project count if available */}
      last sync {acc.last_synced_at ? formatRelative(acc.last_synced_at) : "—"}
    </span>
  </div>
  <HealthBadge health={acc.health} />
  <DRButton variant="ghost" size="sm" className="size-6 p-0"
    onClick={() => openContextMenu(acc)}>
    <Icon name="chevron-right" size={12} />
  </DRButton>
</li>

// HealthBadge replaces HealthDot
function HealthBadge({ health }: { health: AccountHealth }) {
  if (health === "ok") return (
    <DRBadge tone="success">
      <span className="size-[6px] shrink-0 rounded-full" style={{ background: "var(--green)" }} />
      Healthy
    </DRBadge>
  )
  if (health === "needs_reauth") return (
    <DRBadge tone="warning">
      <span className="size-[6px] shrink-0 rounded-full" style={{ background: "var(--amber)" }} />
      Token expiring
    </DRBadge>
  )
  return (
    <DRBadge tone="danger">
      <span className="size-[6px] shrink-0 rounded-full" style={{ background: "var(--red)" }} />
      Re-auth
    </DRBadge>
  )
}

// "Add another" section at the bottom
<p className="mt-[22px] mb-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
  Add another
</p>
<div className="grid grid-cols-2 gap-2">
  <DRButton variant="secondary" size="sm" fullWidth
    leading={<ProviderMark platform="vercel" size={13} />}
    onClick={() => setDialogOpen(true)}>
    Vercel team
  </DRButton>
  <DRButton variant="secondary" size="sm" fullWidth
    leading={<ProviderMark platform="railway" size={13} />}
    onClick={() => setDialogOpen(true)}>
    Railway account
  </DRButton>
</div>
```

**Note:** `last_synced_at` is not currently on `AccountRecord`. Either add it to the Rust `AccountRecord` type and expose it, or approximate it using `state.last_refreshed_at`.

---

## 11. Settings — General Tab ✅

**Files:** `src/app/desktop/views/settings/general-tab.tsx`

### Changes

1. Restructure into 3 named sections with card-style rows (matching design)
2. Add "Notify on failed deploy" and "Notify on recovery" toggles
3. Add "Quit Dev Radio" danger-ghost button at the bottom
4. Change Section pattern to card rows (bordered box, not `border-b` separator)

```tsx
// New Section pattern — card with rows
function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-border bg-surface">
      {children}
    </div>
  )
}

function SettingsRow({ title, desc, control, last }: SettingsRowProps) {
  return (
    <div className={cn(
      "flex items-center gap-4 px-[14px] py-[12px]",
      !last && "border-b border-border-subtle",
    )}>
      <div className="flex-1">
        <p className="text-[12.5px] font-medium text-foreground">{title}</p>
        {desc && <p className="mt-0.5 text-[11.5px] leading-[1.4] text-faint">{desc}</p>}
      </div>
      {control}
    </div>
  )
}

// Full layout:
return (
  <div className="flex flex-1 flex-col gap-[22px] overflow-auto px-5 py-5">
    <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">Monitoring</p>
    <SettingsCard>
      <SettingsRow title="Polling interval"
        desc="How often to check each provider. Lower values may hit rate limits."
        control={<Segmented ... />}/>
      <SettingsRow title="Notify on failed deploy"
        desc="Native notification when a deploy goes red."
        control={<Switch checked={prefs.notify_on_failure} onChange={(v) => void update("notify_on_failure", v)}/>}/>
      <SettingsRow title="Notify on recovery"
        desc="Ping me when red turns back to green."
        control={<Switch checked={prefs.notify_on_recovery} onChange={(v) => void update("notify_on_recovery", v)}/>}
        last/>
    </SettingsCard>

    <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">Application</p>
    <SettingsCard>
      <SettingsRow title="Launch at login" control={<Switch .../>}/>
      <SettingsRow title="Show dock icon" desc="Off by default — Dev Radio lives in the menubar." control={<Switch .../>}/>
      <SettingsRow title="Appearance" control={<Segmented .../>} last/>
    </SettingsCard>

    <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">Menubar shortcut</p>
    <SettingsCard>
      <SettingsRow title="Open menubar"
        desc="Global hotkey to show the deploy list from anywhere."
        control={<ShortcutRecorder .../>}
        last/>
    </SettingsCard>

    <div className="flex justify-end mt-[18px]">
      <DRButton variant="ghost" size="sm"
        leading={<Icon name="warning" size={12} className="text-danger" />}
        className="text-danger hover:text-danger"
        onClick={() => void windowApi.quit()}>
        Quit Dev Radio
      </DRButton>
    </div>
  </div>
)
```

**Prefs type update:** Add `notify_on_failure: boolean` and `notify_on_recovery: boolean` to `src/lib/prefs.ts` and the Rust `Prefs` struct in `src-tauri/src/prefs.rs`. Wire them up to the notifications module.

---

## 12. Settings — About Tab ✅

**Files:** `src/app/desktop/views/settings/about-tab.tsx`

### Changes

1. Replace flat layout with centered column layout
2. Use the radio SVG icon instead of app icon
3. Show architecture string
4. Add DRCard-style link rows
5. Add "Check for updates" row with `DRBadge`
6. Add copyright footer

```tsx
export function SettingsAbout() {
  const [version, setVersion] = useState("")
  useEffect(() => { getVersion().then(setVersion).catch(() => {}) }, [])

  return (
    <div className="flex flex-1 flex-col items-center overflow-auto px-6 pt-7 pb-5">
      {/* Icon */}
      <div className="mb-[14px] flex size-[64px] items-center justify-center rounded-[14px] border border-border bg-surface-2">
        <svg width="34" height="34" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-foreground">
          <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>
          <path d="M5 5 Q3 8 5 11"/><path d="M11 5 Q13 8 11 11"/>
          <path d="M2.5 3 Q-0.5 8 2.5 13" opacity="0.5"/>
          <path d="M13.5 3 Q16.5 8 13.5 13" opacity="0.5"/>
        </svg>
      </div>

      {/* Name + version */}
      <h1 className="font-display text-[19px] font-semibold text-foreground" style={{ letterSpacing: -0.3 }}>
        Dev Radio
      </h1>
      {version && (
        <p className="mt-[3px] font-mono-tabular text-[12px] text-faint">
          {version} · Apple Silicon
        </p>
      )}
      <p className="mx-auto mt-[14px] max-w-[360px] text-center text-[12.5px] leading-[1.55] text-muted-foreground">
        A quiet menubar radio for your deploys. Made by one person who
        deploys too often.
      </p>

      {/* Link card */}
      <div className="mt-[22px] w-full max-w-[420px] overflow-hidden rounded-[8px] border border-border bg-surface">
        {[
          { label: "Documentation" },
          { label: "Release notes" },
          { label: "Privacy statement" },
          { label: "Send feedback" },
        ].map((item, i, arr) => (
          <button key={item.label} type="button"
            onClick={() => open(item.label)}
            className={cn(
              "flex w-full items-center justify-between px-[14px] py-[10px] text-[12.5px] text-foreground hover:bg-hover",
              i < arr.length - 1 && "border-b border-border-subtle",
            )}>
            {item.label}
            <Icon name="external" size={12} className="text-faint" />
          </button>
        ))}
        <div className="flex items-center justify-between border-t border-border-subtle px-[14px] py-[10px]">
          <span className="text-[12.5px] text-foreground">Check for updates</span>
          <DRBadge tone="success">
            <span className="size-[6px] shrink-0 rounded-full" style={{ background: "var(--green)" }} />
            Up to date
          </DRBadge>
        </div>
      </div>

      <p className="mt-auto pt-6 text-[11px] text-faint">
        © {new Date().getFullYear()} Dev Radio. All your deploys are belong to you.
      </p>
    </div>
  )
}
```

---

## 13. Close Hint Dialog ✅

**Files:** `src/app/desktop/components/close-hint-dialog.tsx`

### Changes

1. Replace the generic `Dialog` with a custom overlay + card to match the dimmed-settings-behind aesthetic
2. Add inline menubar SVG icon in the body text
3. Rename "Quit now" → "Quit instead" (matches design copy)
4. Dialog title: "Dev Radio is still listening."

```tsx
export function CloseHintDialog({ open, onOpenChange }: Props) {
  const [dontShow, setDontShow] = useState(true)

  async function handleClose() {
    await windowApi.markCloseHintSeen()
    if (dontShow) await prefsApi.set("hide_to_menubar_shown", true).catch(() => {})
    onOpenChange(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Dimmed backdrop */}
      <div className="absolute inset-0 bg-black/20" />

      {/* Card */}
      <div className="relative w-[380px] overflow-hidden rounded-[12px] border border-border bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
        <div className="p-[22px]">
          {/* Icon */}
          <div className="mb-[10px] inline-flex size-7 items-center justify-center rounded-[7px]"
            style={{ background: "color-mix(in oklch, var(--accent-neutral) 15%, transparent)" }}>
            {/* menubar icon SVG */}
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className="text-foreground">
              <rect x="1" y="2" width="14" height="3" rx="1"/><rect x="1" y="7" width="14" height="7" rx="1"/>
            </svg>
          </div>

          <h2 className="font-display text-[15px] font-semibold text-foreground" style={{ letterSpacing: -0.2 }}>
            Dev Radio is still listening.
          </h2>
          <p className="mt-[6px] text-[12.5px] leading-[1.55] text-muted-foreground">
            Closing this window doesn't quit the app — it just tucks back into
            the menubar. Look for the{" "}
            <span className="inline-flex items-center rounded-[4px] border border-border bg-surface-2 px-1 py-[1px] align-middle">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className="text-foreground">
                <rect x="1" y="2" width="14" height="3" rx="1"/><rect x="1" y="7" width="14" height="7" rx="1"/>
              </svg>
            </span>{" "}
            icon near your clock.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-[10px] border-t border-border-subtle bg-surface-2 px-[14px] py-[10px]">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-faint">
            <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(v === true)} />
            Don't show this again
          </label>
          <div className="flex gap-[6px]">
            <DRButton variant="ghost" size="sm" onClick={handleQuit}>
              Quit instead
            </DRButton>
            <DRButton variant="primary" size="sm" onClick={() => void handleClose()}>
              Got it
            </DRButton>
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## 14. StatusGlyph — Size & Glyph Corrections ✅

**Files:** `src/components/dr/status-glyph.tsx`

The design uses `size={12}` for popover rows (not `16`). The inner icon paths scale to the viewBox.

1. Change `default size = 16` → keep 16 as default for general use, but pass `size={12}` explicitly from `DeployRow`
2. The `building` pulse ring in the design uses an absolutely-positioned full-bleed ring:

```tsx
// Add pulse ring for building state
{status === "building" && (
  <span
    className="absolute rounded-full"
    style={{
      inset: -3,
      background: "var(--amber)",
      opacity: 0.25,
      animation: "dr-pulse 1.6s ease-out infinite",
    }}
  />
)}
```

Replace the current `dr-pulse` keyframe (which does scale) with the design's outward-ring pulse:

```css
/* index.css — replace existing dr-pulse */
@keyframes dr-pulse {
  0%   { transform: scale(0.8); opacity: 0.5; }
  100% { transform: scale(1.8); opacity: 0; }
}
```

---

## 15. Icon additions ✅

**Files:** `src/components/dr/icon.tsx`

Add missing icon names referenced in the plan:

```tsx
// Add to IconName union:
| "power"
| "menubar"

// Add to PATHS:
power: "M8 3 V8 M5 5.5 A4 4 0 1 0 11 5.5",
menubar: "M1 2 H15 V5 H1 Z M1 7 H15 V14 H1 Z",
```

---

## 16. CSS additions to `index.css` ✅

```css
/* Pulse-dot for header pill (building state) */
@keyframes dr-pulse-dot {
  0%, 100% { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
  50%       { box-shadow: 0 0 0 3px transparent; opacity: 0.7; }
}

/* Spin for loading state */
@keyframes dr-spin {
  to { transform: rotate(360deg); }
}
```

---

## 17. Prefs additions ✅

**Files:** `src/lib/prefs.ts` + `src-tauri/src/prefs.rs`

Add two notification prefs:

```ts
// src/lib/prefs.ts
export type Prefs = {
  // ... existing ...
  notify_on_failure: boolean
  notify_on_recovery: boolean
}

export const DEFAULT_PREFS: Prefs = {
  // ... existing ...
  notify_on_failure: true,
  notify_on_recovery: true,
}
```

```rust
// src-tauri/src/prefs.rs — add to Prefs struct
pub notify_on_failure: bool,
pub notify_on_recovery: bool,

// In default impl:
notify_on_failure: true,
notify_on_recovery: true,
```

---

## Implementation Order

| Priority | Item | Status |
|---|---|---|
| 1 | Deploy row — 2-line layout + env pill + domain/service | ✅ Done |
| 2 | Account group headers | ✅ Done |
| 3 | Header health pill + filter bar split | ✅ Done |
| 4 | Footer — dot + interval + remove extra shortcuts | ✅ Done |
| 5 | Offline — banner + stale list | ✅ Done |
| 6 | Loading, empty, no-accounts copy + structure | ✅ Done |
| 7 | Rate limit — banner pattern | ✅ Done |
| 8 | Onboarding welcome — provider list + coming soon + footer | ✅ Done |
| 9 | Onboarding connect — hero strip + railway instructions | ✅ Done |
| 10 | Onboarding success — project list preview + kbd in button | ✅ Done |
| 11 | Settings accounts — DRBadge + last sync + add-another | ✅ Done |
| 12 | Settings general — card rows + notification toggles + Quit | ✅ Done |
| 13 | Settings about — radio icon + update row + footer | ✅ Done |
| 14 | Close hint dialog — overlay + "Quit instead" + inline icon | ✅ Done |
| 15 | StatusGlyph — building pulse ring | ✅ Done |
| 16 | Icon additions (power, menubar) | ✅ Done |
| 17 | CSS keyframes (dr-pulse-dot, dr-spin) | ✅ Done |
