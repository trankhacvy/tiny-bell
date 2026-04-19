import type { KeyboardEvent } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { StatusGlyph, statusLabel } from "@/components/dr/status-glyph"
import { ProviderMark } from "@/components/dr/provider-mark"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import type {
  Deployment,
  DeploymentState,
  Project,
} from "@/lib/deployments"

type DeployRowProps = {
  deployment: Deployment
  project: Project | null
}

export function DeployRow({ deployment, project }: DeployRowProps) {
  const target = deployment.inspector_url ?? deployment.url

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
      if (target) void openUrl(target)
    }
  }

  const onClick = () => {
    if (target) void openUrl(target)
  }

  const title =
    deployment.commit_message?.split("\n")[0]?.trim() ||
    deployment.branch ||
    project?.name ||
    "Deployment"

  const projectLabel = project?.name ?? deployment.project_id
  const sha = deployment.commit_sha?.slice(0, 7) ?? null
  const ageLabel = formatRelative(deployment.created_at)

  return (
    <div
      role="button"
      tabIndex={0}
      data-deploy-row
      data-deploy-id={deployment.id}
      data-project-id={deployment.project_id}
      onKeyDown={onKeyDown}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 outline-none transition-colors",
        "hover:bg-hover focus-visible:bg-selected",
        "h-14 border-b border-border-subtle last:border-b-0",
      )}
    >
      <StatusGlyph status={deployment.state} size={16} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-foreground">
            {title}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground">
          {project ? (
            <ProviderMark
              platform={project.platform}
              size={10}
              className="shrink-0 text-muted-foreground"
            />
          ) : null}
          <span className="truncate">{projectLabel}</span>
          {deployment.service_name ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate font-medium text-foreground/80">
                {deployment.service_name}
              </span>
            </>
          ) : null}
          {sha ? (
            <>
              <span aria-hidden>·</span>
              <span className="font-mono-tabular text-[10.5px]">{sha}</span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span className="shrink-0">{ageLabel}</span>
        </span>
      </div>
      <StatusLabel state={deployment.state} />
    </div>
  )
}

function StatusLabel({ state }: { state: DeploymentState }) {
  const color =
    state === "error"
      ? "var(--red)"
      : state === "building" || state === "queued"
        ? "var(--amber)"
        : state === "ready"
          ? "var(--green)"
          : "var(--text-3)"
  return (
    <span
      className="shrink-0 text-[11px] font-medium tabular-nums"
      style={{ color }}
    >
      {statusLabel(state)}
    </span>
  )
}
