import {
  Clock,
  ExternalLink,
  FolderClosed,
  GitBranch,
  GitCommit,
  Triangle,
} from "lucide-react"

import { StatusIcon, statusLabel } from "./status-icon"
import { cn } from "@/lib/utils"
import {
  deploymentUrl,
  deploymentsApi,
  type Deployment,
  type Project,
} from "@/lib/deployments"
import { formatRelative } from "@/lib/format"

type Props = {
  project: Project
  deployment: Deployment
}

export function DeploymentCard({ project, deployment }: Props) {
  const viewUrl = deploymentUrl(deployment)
  const inspector = deployment.inspector_url
  const platformLabel =
    project.platform === "vercel" ? "Inspector" : "Logs"

  function open(url: string | null) {
    if (!url) return
    void deploymentsApi.openExternal(url)
  }

  return (
    <div
      className={cn(
        "group flex gap-3 rounded-lg border bg-card p-3 transition-colors",
        "hover:border-accent-foreground/20",
      )}
    >
      <div className="pt-0.5">
        <StatusIcon state={deployment.state} size="md" />
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FolderClosed className="size-3.5" />
          <span className="truncate">{project.name}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <GitCommit className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">
            {deployment.commit_message ?? statusLabel(deployment.state)}
          </span>
        </div>

        {deployment.branch && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitBranch className="size-3.5 shrink-0" />
            <span className="truncate">{deployment.branch}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {formatRelative(deployment.created_at)}
            {deployment.author_name ? ` by ${deployment.author_name}` : ""}
          </span>

          {inspector && (
            <>
              <span aria-hidden>•</span>
              <button
                type="button"
                onClick={() => open(inspector)}
                className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
              >
                <Triangle className="size-3" />
                {platformLabel}
              </button>
            </>
          )}

          {viewUrl && (
            <>
              <span aria-hidden>•</span>
              <button
                type="button"
                onClick={() => open(viewUrl)}
                className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
              >
                View Site
                <ExternalLink className="size-3" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
