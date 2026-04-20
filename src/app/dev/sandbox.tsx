import { useCallback, useEffect, useState } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

// Install Tauri IPC mocks *before* any component does its first invoke().
import { installSandboxMocks, sandboxStore } from "./sandbox-mocks"
installSandboxMocks()

import { PopoverHeader } from "@/components/popover/popover-header"
import { PopoverFooter } from "@/components/popover/popover-footer"
import { FilterBar } from "@/components/popover/filter-bar"
import type { ProjectSelection } from "@/components/popover/project-filter"
import { DeployRow } from "@/components/popover/deploy-row"
import { AccountGroupHeader } from "@/components/popover/account-group-header"
import { PopoverLoading } from "@/components/popover/states/loading"
import { PopoverEmpty } from "@/components/popover/states/empty"
import { PopoverNoAccounts } from "@/components/popover/states/no-accounts"
import { OfflineBanner } from "@/components/popover/states/offline-banner"

import { OnboardingView } from "@/app/desktop/views/onboarding-view"
import { SettingsView } from "@/app/desktop/views/settings-view"
import { CloseHintDialog } from "@/app/desktop/components/close-hint-dialog"
import { AddAccountDialog } from "@/components/account/add-account-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RepoSelector } from "@/components/account/repo-selector"

import { accountsApi, type AccountRecord } from "@/lib/accounts"
import type { Deployment, Project } from "@/lib/deployments"

// ── local mock data for the popover preview ──────────────────────────────────
// (The popover preview is self-contained for simplicity; desktop scenarios
//  drive the mock store and read live state via accountsApi.)

const NOW = Date.now()
const ago = (ms: number) => NOW - ms

const POPOVER_ACCOUNTS: AccountRecord[] = [
  {
    id: "acc-vercel",
    platform: "vercel",
    display_name: "Personal",
    scope_id: null,
    enabled: true,
    created_at: ago(30 * 24 * 60 * 60 * 1000),
    health: "ok",
    monitored_repos: null,
  },
  {
    id: "acc-railway",
    platform: "railway",
    display_name: "My Team",
    scope_id: "team-123",
    enabled: true,
    created_at: ago(14 * 24 * 60 * 60 * 1000),
    health: "ok",
    monitored_repos: null,
  },
]

const POPOVER_PROJECTS: Project[] = [
  { id: "proj-acme", account_id: "acc-vercel", platform: "vercel", name: "acme-web", url: "acme-web.vercel.app", framework: "nextjs", latest_deployment: null },
  { id: "proj-docs", account_id: "acc-vercel", platform: "vercel", name: "docs-site", url: "docs.acme.com", framework: "astro", latest_deployment: null },
  { id: "proj-api", account_id: "acc-vercel", platform: "vercel", name: "api-gateway", url: "api.acme.com", framework: null, latest_deployment: null },
  { id: "proj-backend", account_id: "acc-railway", platform: "railway", name: "backend", url: null, framework: null, latest_deployment: null },
  { id: "proj-landing", account_id: "acc-railway", platform: "railway", name: "landing", url: "landing.acme.com", framework: null, latest_deployment: null },
]

const POPOVER_DEPLOYMENTS: Deployment[] = [
  {
    id: "d-acme-1",
    project_id: "proj-acme",
    service_id: null,
    service_name: null,
    state: "error",
    environment: "production",
    url: "acme-web.vercel.app",
    inspector_url: "https://vercel.com/logs/d-acme-1",
    branch: "main",
    commit_sha: "a1b2c3d",
    commit_message: "feat: redesign homepage hero section",
    author_name: "Alex Kim",
    author_avatar: null,
    created_at: ago(8 * 60 * 1000),
    finished_at: ago(6 * 60 * 1000),
    duration_ms: 120_000,
    progress: null,
  },
  {
    id: "d-docs-1",
    project_id: "proj-docs",
    service_id: null,
    service_name: null,
    state: "building",
    environment: "production",
    url: "docs.acme.com",
    inspector_url: "https://vercel.com/logs/d-docs-1",
    branch: "main",
    commit_sha: "e4f5a6b",
    commit_message: "docs: update API reference for v2 endpoints",
    author_name: "Sam Lee",
    author_avatar: null,
    created_at: ago(2 * 60 * 1000),
    finished_at: null,
    duration_ms: null,
    progress: 0.6,
  },
  {
    id: "d-api-1",
    project_id: "proj-api",
    service_id: null,
    service_name: null,
    state: "ready",
    environment: "production",
    url: "api.acme.com",
    inspector_url: null,
    branch: "main",
    commit_sha: "c7d8e9f",
    commit_message: "fix: rate limiting on /auth endpoint",
    author_name: "Jordan Park",
    author_avatar: null,
    created_at: ago(45 * 60 * 1000),
    finished_at: ago(43 * 60 * 1000),
    duration_ms: 89_000,
    progress: null,
  },
  {
    id: "d-backend-api",
    project_id: "proj-backend",
    service_id: "svc-api",
    service_name: "api",
    state: "ready",
    environment: "production",
    url: null,
    inspector_url: "https://railway.com/logs/d-backend-api",
    branch: "main",
    commit_sha: "f0a1b2c",
    commit_message: "chore: bump dependencies",
    author_name: "Riley Chen",
    author_avatar: null,
    created_at: ago(3 * 60 * 60 * 1000),
    finished_at: ago(3 * 60 * 60 * 1000 - 95_000),
    duration_ms: 95_000,
    progress: null,
  },
  {
    id: "d-backend-worker",
    project_id: "proj-backend",
    service_id: "svc-worker",
    service_name: "worker",
    state: "ready",
    environment: "production",
    url: null,
    inspector_url: "https://railway.com/logs/d-backend-worker",
    branch: "main",
    commit_sha: "f0a1b2c",
    commit_message: "chore: bump dependencies",
    author_name: "Riley Chen",
    author_avatar: null,
    created_at: ago(3 * 60 * 60 * 1000),
    finished_at: ago(3 * 60 * 60 * 1000 - 110_000),
    duration_ms: 110_000,
    progress: null,
  },
  {
    id: "d-landing-1",
    project_id: "proj-landing",
    service_id: null,
    service_name: "web",
    state: "queued",
    environment: "production",
    url: "landing.acme.com",
    inspector_url: null,
    branch: "feat/new-pricing",
    commit_sha: "3e4f5a6",
    commit_message: "feat: new pricing page layout",
    author_name: "Alex Kim",
    author_avatar: null,
    created_at: ago(30 * 1000),
    finished_at: null,
    duration_ms: null,
    progress: null,
  },
]

// ── scenarios ────────────────────────────────────────────────────────────────

type Scenario =
  // Popover
  | "popover-normal"
  | "popover-loading"
  | "popover-empty"
  | "popover-no-accounts"
  | "popover-offline"
  // Desktop
  | "desktop-onboarding"
  | "desktop-onboarding-with-accounts"
  | "desktop-settings-accounts"
  | "desktop-settings-accounts-reauth"
  | "desktop-settings-accounts-empty"
  | "desktop-settings-general"
  | "desktop-settings-about"
  // Dialogs on top of desktop
  | "dialog-add-account"
  | "dialog-repo-selector"
  | "dialog-close-hint"

type ScenarioGroup = {
  title: string
  items: { id: Scenario; label: string }[]
}

const SCENARIO_GROUPS: ScenarioGroup[] = [
  {
    title: "Popover",
    items: [
      { id: "popover-normal", label: "Normal" },
      { id: "popover-loading", label: "Loading" },
      { id: "popover-empty", label: "Empty" },
      { id: "popover-no-accounts", label: "No accounts" },
      { id: "popover-offline", label: "Offline" },
    ],
  },
  {
    title: "Desktop",
    items: [
      { id: "desktop-onboarding", label: "Onboarding · fresh" },
      { id: "desktop-onboarding-with-accounts", label: "Onboarding · has accounts" },
      { id: "desktop-settings-accounts", label: "Settings · Accounts" },
      { id: "desktop-settings-accounts-reauth", label: "· Re-auth warning" },
      { id: "desktop-settings-accounts-empty", label: "· Empty" },
      { id: "desktop-settings-general", label: "Settings · General" },
      { id: "desktop-settings-about", label: "Settings · About" },
    ],
  },
  {
    title: "Dialogs",
    items: [
      { id: "dialog-add-account", label: "Add account" },
      { id: "dialog-repo-selector", label: "GitHub repo selector" },
      { id: "dialog-close-hint", label: "Close hint" },
    ],
  },
]

// ── popover preview (self-contained — not driven by mock store) ──────────────

function PopoverPreview({
  scenario,
}: {
  scenario: Extract<Scenario, `popover-${string}`>
}) {
  const [selectedProjectIds, setSelectedProjectIds] = useState<ProjectSelection>(null)
  const [scope, setScope] = useState<string>("all")
  const [focusedId] = useState<string | null>(null)

  const scopedProjects =
    scope === "all"
      ? POPOVER_PROJECTS
      : POPOVER_PROJECTS.filter((p) => p.account_id === scope)

  const scopedDeployments = POPOVER_DEPLOYMENTS.filter((d) =>
    scopedProjects.some((p) => p.id === d.project_id),
  )

  const filteredDeployments =
    selectedProjectIds === null
      ? scopedDeployments
      : scopedDeployments.filter((d) => selectedProjectIds.has(d.project_id))

  const projectsById = new Map(POPOVER_PROJECTS.map((p) => [p.id, p]))

  const groups = (() => {
    const accountMap = new Map(POPOVER_ACCOUNTS.map((a) => [a.id, a]))
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
  })()

  const isOffline = scenario === "popover-offline"
  const lastRefreshed = ago(25 * 1000)

  return (
    <div
      className="flex flex-col bg-surface text-foreground"
      style={{ width: 380, height: 600, overflow: "hidden" }}
    >
      <PopoverHeader
        deployments={scenario === "popover-loading" ? [] : filteredDeployments}
        onRefresh={() => {}}
      />

      {scenario !== "popover-no-accounts" && scenario !== "popover-loading" && (
        <FilterBar
          accounts={POPOVER_ACCOUNTS}
          scope={scope}
          onScopeChange={setScope}
          projects={scopedProjects}
          selectedProjectIds={selectedProjectIds}
          onSelectedProjectIdsChange={setSelectedProjectIds}
          deployments={scopedDeployments}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {scenario === "popover-loading" ? (
          <PopoverLoading />
        ) : scenario === "popover-no-accounts" ? (
          <PopoverNoAccounts />
        ) : (
          <>
            {isOffline && <OfflineBanner lastRefreshedAt={lastRefreshed} />}
            <div className={isOffline ? "pointer-events-none opacity-65" : undefined}>
              {scenario === "popover-empty" || filteredDeployments.length === 0 ? (
                <PopoverEmpty />
              ) : (
                groups.map(({ account, deployments }) => (
                  <section key={account!.id}>
                    <AccountGroupHeader
                      label={account!.display_name}
                      platform={account!.platform}
                      count={deployments.length}
                    />
                    {deployments.map((d) => (
                      <DeployRow
                        key={d.id}
                        deployment={d}
                        project={projectsById.get(d.project_id) ?? null}
                        focused={d.id === focusedId}
                      />
                    ))}
                  </section>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <PopoverFooter
        lastRefreshedAt={scenario === "popover-loading" ? null : lastRefreshed}
        offline={isOffline}
        refreshing={false}
        intervalLabel="30s"
      />
    </div>
  )
}

// ── desktop preview (driven by mock store) ───────────────────────────────────

function useMockAccounts() {
  const [accounts, setAccounts] = useState<AccountRecord[]>([])

  const load = useCallback(async () => {
    try {
      const list = await accountsApi.list()
      setAccounts(list)
    } catch {
      /* swallow */
    }
  }, [])

  useEffect(() => {
    void load()
    let un: UnlistenFn | undefined
    listen("accounts:changed", () => void load()).then((fn) => {
      un = fn
    })
    return () => {
      un?.()
    }
  }, [load])

  return { accounts, reload: load }
}

function DesktopPreview({
  scenario,
}: {
  scenario: Extract<Scenario, `desktop-${string}`>
}) {
  const { accounts, reload } = useMockAccounts()

  // Re-seed the mock store whenever the scenario changes.
  useEffect(() => {
    switch (scenario) {
      case "desktop-onboarding":
        sandboxStore.applyAccountPreset("empty")
        break
      case "desktop-onboarding-with-accounts":
      case "desktop-settings-accounts":
      case "desktop-settings-general":
      case "desktop-settings-about":
        sandboxStore.applyAccountPreset("seed")
        break
      case "desktop-settings-accounts-reauth":
        sandboxStore.applyAccountPreset("reauth")
        break
      case "desktop-settings-accounts-empty":
        sandboxStore.applyAccountPreset("empty")
        break
    }
  }, [scenario])

  const hasAccounts = accounts.length > 0

  // Wrap the view in a fixed-size frameless "window" so the sandbox preview
  // matches the real desktop window geometry (560 × 680).
  const frame = (content: React.ReactNode, key?: string) => (
    <div
      key={key}
      className="overflow-hidden rounded-[12px] border border-border bg-surface shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      style={{ width: '100%', height: 680 }}
    >
      <div className="flex h-full flex-col">{content}</div>
    </div>
  )

  if (scenario === "desktop-onboarding" || scenario === "desktop-onboarding-with-accounts") {
    return frame(
      <OnboardingView
        hasAccounts={hasAccounts}
        onRouteChange={() => {}}
        onConnected={async () => {
          await reload()
        }}
        onDone={() => {
          // In the sandbox, "Open menubar" is a no-op. Reload accounts in case
          // the user connected any from the success step.
          void reload()
        }}
      />,
      scenario,
    )
  }

  if (
    scenario === "desktop-settings-accounts" ||
    scenario === "desktop-settings-accounts-reauth" ||
    scenario === "desktop-settings-accounts-empty"
  ) {
    return frame(
      <SettingsView
        accounts={accounts}
        onAccountsChange={reload}
        initialTab="Accounts"
      />,
      scenario,
    )
  }

  if (scenario === "desktop-settings-general") {
    return frame(
      <SettingsView
        accounts={accounts}
        onAccountsChange={reload}
        initialTab="General"
      />,
      scenario,
    )
  }

  if (scenario === "desktop-settings-about") {
    return frame(
      <SettingsView
        accounts={accounts}
        onAccountsChange={reload}
        initialTab="About"
      />,
      scenario,
    )
  }

  return null
}

// ── dialog previews ──────────────────────────────────────────────────────────

function DialogPreview({
  scenario,
}: {
  scenario: Extract<Scenario, `dialog-${string}`>
}) {
  const { accounts, reload } = useMockAccounts()
  const [addOpen, setAddOpen] = useState(true)
  const [repoOpen, setRepoOpen] = useState(true)
  const [closeHintOpen, setCloseHintOpen] = useState(true)

  useEffect(() => {
    sandboxStore.applyAccountPreset("single-github")
    setAddOpen(scenario === "dialog-add-account")
    setRepoOpen(scenario === "dialog-repo-selector")
    setCloseHintOpen(scenario === "dialog-close-hint")
  }, [scenario])

  const githubAccount = accounts.find((a) => a.platform === "github")

  return (
    <div
      className="relative overflow-hidden rounded-[12px] border border-border bg-surface-2 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      style={{ width: 560, height: 680 }}
    >
      <div className="flex h-full items-center justify-center text-[12px] text-faint">
        (dialog overlay on top of the desktop window)
      </div>

      {scenario === "dialog-add-account" && (
        <AddAccountDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onConnected={() => {
            void reload()
          }}
        />
      )}

      {scenario === "dialog-repo-selector" && githubAccount && (
        <Dialog
          open={repoOpen}
          onOpenChange={(open) => {
            setRepoOpen(open)
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Manage repositories</DialogTitle>
              <DialogDescription>
                Select which repositories to monitor for workflow runs.
              </DialogDescription>
            </DialogHeader>
            <RepoSelector
              accountId={githubAccount.id}
              initialRepos={githubAccount.monitored_repos ?? undefined}
              onSave={() => {
                setRepoOpen(false)
                void reload()
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {scenario === "dialog-close-hint" && (
        <CloseHintDialog
          open={closeHintOpen}
          onOpenChange={setCloseHintOpen}
        />
      )}
    </div>
  )
}

// ── sandbox root ─────────────────────────────────────────────────────────────

export function DevSandbox() {
  const [scenario, setScenario] = useState<Scenario>("popover-normal")

  const helper = useScenarioHelper(scenario)

  return (
    <div className="min-h-screen bg-[#1a1a1a] p-6 pb-10">
      <header className="mb-5 flex items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-white/40">
          Tiny Bell · Dev Sandbox
        </span>
        <span className="text-white/20">·</span>
        <button
          type="button"
          onClick={() => sandboxStore.resetAll()}
          className="rounded-[5px] px-2.5 py-1 text-[11px] text-white/50 underline underline-offset-2 hover:text-white/80"
        >
          Reset mock state
        </button>
      </header>

      <div className="mb-5 flex flex-wrap items-start gap-x-6 gap-y-3">
        {SCENARIO_GROUPS.map((group) => (
          <div key={group.title} className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-white/35">
              {group.title}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScenario(item.id)}
                  className={
                    scenario === item.id
                      ? "rounded-[5px] bg-white/15 px-2.5 py-1 text-[11.5px] font-medium text-white"
                      : "rounded-[5px] px-2.5 py-1 text-[11.5px] text-white/50 hover:text-white/80"
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {helper && (
        <div className="mb-4 max-w-[760px] rounded-[8px] border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[11.5px] leading-[1.55] text-white/60">
          {helper}
        </div>
      )}

      <div className="inline-block">
        {scenario.startsWith("popover-") ? (
          <PopoverPreview scenario={scenario as Extract<Scenario, `popover-${string}`>} />
        ) : scenario.startsWith("desktop-") ? (
          <DesktopPreview scenario={scenario as Extract<Scenario, `desktop-${string}`>} />
        ) : (
          <DialogPreview scenario={scenario as Extract<Scenario, `dialog-${string}`>} />
        )}
      </div>
    </div>
  )
}

function useScenarioHelper(scenario: Scenario): string | null {
  switch (scenario) {
    case "desktop-onboarding":
      return "Click a provider to try the connect flow. OAuth buttons simulate a ~1.2s browser trip; the 'Paste token' tab accepts any value. Type the literal word 'bad' to trigger the error state."
    case "desktop-onboarding-with-accounts":
      return "Onboarding when the user already has accounts — the 'Settings' button appears in the window header."
    case "desktop-settings-accounts":
      return "Full Accounts tab with four healthy accounts. Try the row menus (rename, sign out, manage repos for GitHub) and the 'Add account' button."
    case "desktop-settings-accounts-reauth":
      return "One Railway account is in 'needs_reauth' state and one Vercel team is 'revoked' — the warning banner and badges should render."
    case "desktop-settings-accounts-empty":
      return "The Accounts tab with zero connected accounts — only the add-account affordances."
    case "desktop-settings-general":
      return "Polling interval, notification toggles, theme, and the global shortcut recorder. All changes write through the mocked prefs store and emit 'prefs:changed'."
    case "desktop-settings-about":
      return "Mocked version is '0.1.0-sandbox'. External links are logged to the console (no-op)."
    case "dialog-add-account":
      return "The shared Add-account dialog. Switch platforms, try OAuth or paste-token. 'bad' as a token triggers the invalid-token error UI."
    case "dialog-repo-selector":
      return "The GitHub repo selector populated with 8 mock repos; first-setup auto-selects 10. Saving persists to the mock account and closes the dialog."
    case "dialog-close-hint":
      return "The one-time 'we tucked into the menubar' dialog users see on their first desktop close."
    default:
      return null
  }
}
