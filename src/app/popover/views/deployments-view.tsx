import { useEffect, useMemo } from "react"
import { Radio, Settings } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { DeploymentCard } from "@/components/deployment/deployment-card"
import { useDashboard } from "@/hooks/use-dashboard"
import { formatRelative } from "@/lib/format"
import {
  deploymentsApi,
  windowApi,
  type Deployment,
  type Project,
} from "@/lib/deployments"
import { PLATFORM_LABEL, type AccountRecord } from "@/lib/accounts"

type Props = {
  accounts: AccountRecord[]
}

type Row = {
  project: Project
  deployment: Deployment
}

export function DeploymentsView({ accounts }: Props) {
  const { state, loading } = useDashboard()

  useEffect(() => {
    void deploymentsApi.hydrateAdapters()
  }, [])

  const primary = accounts[0]
  const remaining = accounts.length - 1

  const rows: Row[] = useMemo(() => {
    const out: Row[] = []
    for (const project of state.projects) {
      const deployments = state.deployments_by_project[project.id] ?? []
      const latest = deployments[0]
      if (latest) out.push({ project, deployment: latest })
    }
    out.sort((a, b) => b.deployment.created_at - a.deployment.created_at)
    return out
  }, [state])

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2.5">
        <Avatar className="size-8">
          <AvatarImage src={undefined} alt={primary?.display_name} />
          <AvatarFallback>
            {primary?.display_name?.slice(0, 1).toUpperCase() ?? "D"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {primary?.display_name ?? "Dev Radio"}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {primary ? PLATFORM_LABEL[primary.platform] : ""}
            {remaining > 0 ? ` + ${remaining} more` : ""}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void windowApi.openDesktop("settings")}
          aria-label="Open settings"
        >
          <Settings className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && rows.length === 0 ? (
          <LoadingSkeleton />
        ) : rows.length === 0 ? (
          <EmptyDeployments />
        ) : (
          <div className="flex flex-col gap-2 p-3">
            <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Deployments
            </h2>
            {rows.map(({ project, deployment }) => (
              <DeploymentCard
                key={`${project.id}-${deployment.id}`}
                project={project}
                deployment={deployment}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="truncate">
          {state.last_refreshed_at
            ? `Updated ${formatRelative(state.last_refreshed_at)}`
            : "Connecting…"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void deploymentsApi.refreshNow()}
          aria-label="Refresh"
        >
          <Radio className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
  )
}

function EmptyDeployments() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Radio className="size-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">
        No deployments yet. Push some code!
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void deploymentsApi.refreshNow()}
      >
        Refresh now
      </Button>
    </div>
  )
}
