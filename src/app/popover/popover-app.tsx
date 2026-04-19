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
import { PopoverHeader } from "@/components/popover/popover-header"
import { PopoverFooter } from "@/components/popover/popover-footer"
import { DeployRow } from "@/components/popover/deploy-row"
import { PopoverLoading } from "@/components/popover/states/loading"
import { PopoverEmpty } from "@/components/popover/states/empty"
import { PopoverNoAccounts } from "@/components/popover/states/no-accounts"
import { PopoverOffline } from "@/components/popover/states/offline"

export function PopoverApp() {
  const [accounts, setAccounts] = useState<AccountRecord[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const { state, loading: dashLoading } = useDashboard()
  const [scope, setScope] = useScope()
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    () => new Set(),
  )
  const listRef = useRef<HTMLDivElement | null>(null)

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
    [state.projects, scopedAccountIds],
  )

  const projectsById = useMemo(() => {
    const m = new Map<string, Project>()
    for (const p of state.projects) m.set(p.id, p)
    return m
  }, [state.projects])

  useEffect(() => {
    if (selectedProjectIds.size === 0) return
    const valid = new Set<string>()
    for (const id of selectedProjectIds) {
      if (scopedProjects.some((p) => p.id === id)) valid.add(id)
    }
    if (valid.size !== selectedProjectIds.size) {
      setSelectedProjectIds(valid)
    }
  }, [scopedProjects, selectedProjectIds])

  const filteredDeployments = useMemo<Deployment[]>(() => {
    const scopedProjectIds = new Set(scopedProjects.map((p) => p.id))
    return state.deployments.filter((d) => {
      if (!scopedProjectIds.has(d.project_id)) return false
      if (selectedProjectIds.size === 0) return true
      return selectedProjectIds.has(d.project_id)
    })
  }, [state.deployments, scopedProjects, selectedProjectIds])

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const meta = event.metaKey || event.ctrlKey

    if (event.key === "Escape") {
      event.preventDefault()
      void windowApi.hidePopover()
      return
    }

    if (meta && event.key.toLowerCase() === "r") {
      event.preventDefault()
      void deploymentsApi.refreshNow()
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
      moveFocus(listRef.current, event.key === "ArrowDown" ? 1 : -1)
    }
  }

  const hasAccounts = accounts.length > 0
  const hasAnyScopedProjects = scopedProjects.length > 0

  return (
    <div
      className="flex h-screen w-screen flex-col bg-surface text-foreground outline-none"
      tabIndex={-1}
      onKeyDown={onRootKeyDown}
    >
      <PopoverHeader
        accounts={accounts}
        scope={scope}
        onScopeChange={setScope}
        projects={scopedProjects}
        selectedProjectIds={selectedProjectIds}
        onSelectedProjectIdsChange={setSelectedProjectIds}
        refreshing={state.polling}
      />
      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {accountsLoading ? null : !hasAccounts ? (
          <PopoverNoAccounts />
        ) : state.offline ? (
          <PopoverOffline />
        ) : dashLoading && state.deployments.length === 0 ? (
          <PopoverLoading />
        ) : !hasAnyScopedProjects || filteredDeployments.length === 0 ? (
          <PopoverEmpty />
        ) : (
          <ul>
            {filteredDeployments.map((deployment) => (
              <li key={`${deployment.project_id}:${deployment.id}`}>
                <DeployRow
                  deployment={deployment}
                  project={projectsById.get(deployment.project_id) ?? null}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <PopoverFooter
        lastRefreshedAt={state.last_refreshed_at}
        offline={state.offline}
      />
    </div>
  )
}

function moveFocus(root: HTMLElement | null, delta: number) {
  if (!root) return
  const rows = Array.from(
    root.querySelectorAll<HTMLElement>("[data-deploy-row]"),
  )
  if (rows.length === 0) return
  const active = document.activeElement as HTMLElement | null
  const idx = active ? rows.indexOf(active) : -1
  const next = idx < 0 ? (delta > 0 ? 0 : rows.length - 1) : idx + delta
  const clamped = Math.max(0, Math.min(rows.length - 1, next))
  rows[clamped]?.focus()
}
