import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"

import { accountsApi, type AccountRecord } from "@/lib/accounts"
import {
  deploymentsApi,
  windowApi,
  type Deployment,
  type Project,
} from "@/lib/deployments"
import { useDashboard } from "@/hooks/use-dashboard"
import { useScope } from "@/hooks/use-scope"
import { DEFAULT_PREFS, prefsApi, type Prefs } from "@/lib/prefs"
import { formatInterval } from "@/lib/format"
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
import { RateLimitBanner } from "@/components/popover/states/rate-limit"

export function PopoverApp() {
  const [accounts, setAccounts] = useState<AccountRecord[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const { state, loading: dashLoading } = useDashboard()
  const [scope, setScope] = useScope()
  const [selectedProjectIds, setSelectedProjectIds] =
    useState<ProjectSelection>(null)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setIsChecking(false)
  }, [state])

  function handleRefresh() {
    setIsChecking(true)
    void deploymentsApi.refreshNow()
  }

  const reloadAccounts = useCallback(async () => {
    try {
      const list = await accountsApi.list()
      setAccounts(list)
    } catch {
      /* swallow */
    } finally {
      setAccountsLoading(false)
    }
  }, [])

  useEffect(() => {
    void reloadAccounts()
    void deploymentsApi.hydrateAdapters()
    prefsApi
      .get()
      .then(setPrefs)
      .catch(() => {})
  }, [reloadAccounts])

  useEffect(() => {
    const unlisten: (UnlistenFn | undefined)[] = []
    listen("accounts:changed", () => void reloadAccounts()).then((fn) => {
      unlisten.push(fn)
    })
    listen("popover:show", () => void reloadAccounts()).then((fn) => {
      unlisten.push(fn)
    })
    const w = getCurrentWindow()
    w.onFocusChanged(({ payload: focused }) => {
      if (focused) void reloadAccounts()
    }).then((fn) => unlisten.push(fn))
    return () => {
      for (const fn of unlisten) fn?.()
    }
  }, [reloadAccounts])

  const scopedAccountIds = useMemo(() => {
    if (scope === "all") return new Set(accounts.map((a) => a.id))
    return new Set([scope])
  }, [accounts, scope])

  const scopedProjects = useMemo<Project[]>(
    () => state.projects.filter((p) => scopedAccountIds.has(p.account_id)),
    [state.projects, scopedAccountIds]
  )

  const projectsById = useMemo(() => {
    const m = new Map<string, Project>()
    for (const p of state.projects) m.set(p.id, p)
    return m
  }, [state.projects])

  useEffect(() => {
    if (selectedProjectIds === null) return
    const valid = new Set<string>()
    for (const id of selectedProjectIds) {
      if (scopedProjects.some((p) => p.id === id)) valid.add(id)
    }
    if (valid.size !== selectedProjectIds.size) {
      setSelectedProjectIds(valid.size === 0 ? null : valid)
    }
  }, [scopedProjects, selectedProjectIds])

  const scopedProjectIds = useMemo(
    () => new Set(scopedProjects.map((p) => p.id)),
    [scopedProjects]
  )

  const scopedDeployments = useMemo<Deployment[]>(
    () => state.deployments.filter((d) => scopedProjectIds.has(d.project_id)),
    [state.deployments, scopedProjectIds]
  )

  const filteredDeployments = useMemo<Deployment[]>(() => {
    if (selectedProjectIds === null) return scopedDeployments
    return scopedDeployments.filter((d) => selectedProjectIds.has(d.project_id))
  }, [scopedDeployments, selectedProjectIds])

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

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const meta = event.metaKey || event.ctrlKey

    if (event.key === "Escape") {
      event.preventDefault()
      void windowApi.hidePopover()
      return
    }

    if (meta && event.key.toLowerCase() === "r") {
      event.preventDefault()
      handleRefresh()
      return
    }
    if (meta && event.key === ",") {
      event.preventDefault()
      void windowApi.openDesktop("settings")
      return
    }
    if (meta && event.key.toLowerCase() === "q") {
      event.preventDefault()
      void windowApi.quit()
      return
    }
    if (meta && event.key.toLowerCase() === "n") {
      event.preventDefault()
      void windowApi.openDesktop("onboarding")
      return
    }
    if (meta && /^[0-9]$/.test(event.key)) {
      event.preventDefault()
      const idx = Number.parseInt(event.key, 10)
      if (idx === 0) setScope("all")
      else {
        const target = accounts[idx - 1]
        if (target) setScope(target.id)
      }
      return
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const nextId = moveFocus(
        listRef.current,
        event.key === "ArrowDown" ? 1 : -1
      )
      if (nextId) setFocusedId(nextId)
    }
  }

  const hasAccounts = accounts.length > 0
  const hasAnyScopedProjects = scopedProjects.length > 0
  const intervalLabel = formatInterval(prefs.refresh_interval_ms)

  return (
    <div
      className="flex h-screen w-screen flex-col bg-surface text-foreground outline-none"
      tabIndex={-1}
      onKeyDown={onRootKeyDown}
    >
      <PopoverHeader
        deployments={filteredDeployments}
        onRefresh={handleRefresh}
      />
      {hasAccounts && (
        <FilterBar
          accounts={accounts}
          scope={scope}
          onScopeChange={setScope}
          projects={scopedProjects}
          selectedProjectIds={selectedProjectIds}
          onSelectedProjectIdsChange={setSelectedProjectIds}
          deployments={scopedDeployments}
        />
      )}
      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {accountsLoading ? null : !hasAccounts ? (
          <PopoverNoAccounts />
        ) : dashLoading && state.deployments.length === 0 ? (
          <PopoverLoading />
        ) : (
          <>
            {state.offline && (
              <OfflineBanner lastRefreshedAt={state.last_refreshed_at} />
            )}
            {!state.offline && state.rate_limited && <RateLimitBanner />}
            <div
              className={
                state.offline ? "pointer-events-none opacity-65" : undefined
              }
            >
              {!hasAnyScopedProjects || filteredDeployments.length === 0 ? (
                <PopoverEmpty
                  dormantGitHubRepos={
                    scopedProjects.filter((p) => p.platform === "github").length
                  }
                />
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
                        key={`${d.project_id}:${d.id}`}
                        deployment={d}
                        project={projectsById.get(d.project_id) ?? null}
                        focused={d.id === focusedId}
                        expanded={d.id === expandedId}
                        onToggleExpand={() =>
                          setExpandedId((prev) =>
                            prev === d.id ? null : d.id,
                          )
                        }
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
        lastRefreshedAt={state.last_refreshed_at}
        offline={state.offline}
        refreshing={isChecking}
        intervalLabel={intervalLabel}
      />
    </div>
  )
}

function moveFocus(root: HTMLElement | null, delta: number): string | null {
  if (!root) return null
  const rows = Array.from(
    root.querySelectorAll<HTMLElement>("[data-deploy-row]")
  )
  if (rows.length === 0) return null
  const active = document.activeElement as HTMLElement | null
  const idx = active ? rows.indexOf(active) : -1
  const next = idx < 0 ? (delta > 0 ? 0 : rows.length - 1) : idx + delta
  const clamped = Math.max(0, Math.min(rows.length - 1, next))
  const row = rows[clamped]
  row?.focus()
  return row?.dataset.deployId ?? null
}
