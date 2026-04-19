import { useState } from "react"
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
import type { AccountRecord } from "@/lib/accounts"
import type { Deployment, Project } from "@/lib/deployments"

// ── mock data ────────────────────────────────────────────────────────────────

const NOW = Date.now()
const ago = (ms: number) => NOW - ms

const ACCOUNTS: AccountRecord[] = [
  {
    id: "acc-vercel",
    platform: "vercel",
    display_name: "Personal",
    scope_id: null,
    enabled: true,
    created_at: ago(30 * 24 * 60 * 60 * 1000),
    health: "ok",
  },
  {
    id: "acc-railway",
    platform: "railway",
    display_name: "My Team",
    scope_id: "team-123",
    enabled: true,
    created_at: ago(14 * 24 * 60 * 60 * 1000),
    health: "ok",
  },
]

const PROJECTS: Project[] = [
  {
    id: "proj-acme",
    account_id: "acc-vercel",
    platform: "vercel",
    name: "acme-web",
    url: "acme-web.vercel.app",
    framework: "nextjs",
    latest_deployment: null,
  },
  {
    id: "proj-docs",
    account_id: "acc-vercel",
    platform: "vercel",
    name: "docs-site",
    url: "docs.acme.com",
    framework: "astro",
    latest_deployment: null,
  },
  {
    id: "proj-api",
    account_id: "acc-vercel",
    platform: "vercel",
    name: "api-gateway",
    url: "api.acme.com",
    framework: null,
    latest_deployment: null,
  },
  {
    id: "proj-backend",
    account_id: "acc-railway",
    platform: "railway",
    name: "backend",
    url: null,
    framework: null,
    latest_deployment: null,
  },
  {
    id: "proj-landing",
    account_id: "acc-railway",
    platform: "railway",
    name: "landing",
    url: "landing.acme.com",
    framework: null,
    latest_deployment: null,
  },
]

const DEPLOYMENTS: Deployment[] = [
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

// ── scenario types ────────────────────────────────────────────────────────────

type Scenario = "normal" | "loading" | "empty" | "no-accounts" | "offline"

const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "loading", label: "Loading" },
  { id: "empty", label: "Empty" },
  { id: "no-accounts", label: "No Accounts" },
  { id: "offline", label: "Offline" },
]

// ── popover preview ───────────────────────────────────────────────────────────

function PopoverPreview({ scenario }: { scenario: Scenario }) {
  const [selectedProjectIds, setSelectedProjectIds] = useState<ProjectSelection>(null)
  const [scope, setScope] = useState<string>("all")
  const [focusedId, setFocusedId] = useState<string | null>(null)

  const scopedProjects =
    scope === "all"
      ? PROJECTS
      : PROJECTS.filter((p) => p.account_id === scope)

  const scopedDeployments = DEPLOYMENTS.filter((d) =>
    scopedProjects.some((p) => p.id === d.project_id),
  )

  const filteredDeployments =
    selectedProjectIds === null
      ? scopedDeployments
      : scopedDeployments.filter((d) => selectedProjectIds.has(d.project_id))

  const projectsById = new Map(PROJECTS.map((p) => [p.id, p]))

  const groups = (() => {
    const accountMap = new Map(ACCOUNTS.map((a) => [a.id, a]))
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

  const isOffline = scenario === "offline"
  const lastRefreshed = ago(25 * 1000)

  return (
    <div
      className="flex flex-col bg-surface text-foreground"
      style={{ width: 380, height: 600, overflow: "hidden" }}
    >
      <PopoverHeader
        deployments={scenario === "loading" ? [] : filteredDeployments}
        onRefresh={() => {}}
      />

      {scenario !== "no-accounts" && scenario !== "loading" && (
        <FilterBar
          accounts={ACCOUNTS}
          scope={scope}
          onScopeChange={setScope}
          projects={scopedProjects}
          selectedProjectIds={selectedProjectIds}
          onSelectedProjectIdsChange={setSelectedProjectIds}
          deployments={scopedDeployments}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {scenario === "loading" ? (
          <PopoverLoading />
        ) : scenario === "no-accounts" ? (
          <PopoverNoAccounts />
        ) : (
          <>
            {isOffline && <OfflineBanner lastRefreshedAt={lastRefreshed} />}
            <div className={isOffline ? "pointer-events-none opacity-65" : undefined}>
              {filteredDeployments.length === 0 ? (
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
        lastRefreshedAt={scenario === "loading" ? null : lastRefreshed}
        offline={isOffline}
        refreshing={false}
        intervalLabel="30s"
      />
    </div>
  )
}

// ── sandbox root ──────────────────────────────────────────────────────────────

export function DevSandbox() {
  const [scenario, setScenario] = useState<Scenario>("normal")

  return (
    <div className="min-h-screen bg-[#1a1a1a] p-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-white/40">
          Dev Sandbox
        </span>
        <span className="text-white/20">·</span>
        <div className="flex items-center gap-1">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScenario(s.id)}
              className={
                scenario === s.id
                  ? "rounded-[5px] bg-white/15 px-3 py-1 text-[12px] font-medium text-white"
                  : "rounded-[5px] px-3 py-1 text-[12px] text-white/50 hover:text-white/80"
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="inline-block overflow-hidden rounded-[12px] shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
        <PopoverPreview scenario={scenario} />
      </div>
    </div>
  )
}
