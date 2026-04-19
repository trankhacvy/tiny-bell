import { openUrl } from "@tauri-apps/plugin-opener"
import { StatusGlyph } from "@/components/dr/status-glyph"
import { InitialsAvatar } from "@/components/dr/initials-avatar"
import { DRButton } from "@/components/dr/button"
import { Icon } from "@/components/dr/icon"
import { Kbd } from "@/components/dr/kbd"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Deployment, Project } from "@/lib/deployments"

type DeployRowProps = {
  deployment: Deployment
  project: Project | null
  focused?: boolean
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "")
}

function EnvPill({ env }: { env: string }) {
  const isProd = env === "production" || env === "prod"
  return (
    <span
      className={cn(
        "shrink-0 rounded-[3px] border px-[5px] py-[1px] text-[10px] font-semibold uppercase tracking-[0.5px]",
        isProd
          ? "border-border bg-surface-2 text-foreground"
          : "border-border bg-transparent text-faint",
      )}
    >
      {isProd ? "prod" : env}
    </span>
  )
}

function DomainTag({ domain }: { domain: string }) {
  return (
    <span className="max-w-[140px] truncate font-mono-tabular text-[10.5px] text-faint">
      {domain}
    </span>
  )
}

function ServiceBadge({ name }: { name: string }) {
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

export function DeployRow({ deployment, project, focused }: DeployRowProps) {
  const target = deployment.inspector_url ?? deployment.url
  const commitMsg = deployment.commit_message?.split("\n")[0]?.trim() ?? null
  const branch = deployment.branch ?? null
  const author = deployment.author_name ?? null
  const time = formatRelative(deployment.created_at)

  const isRailway = project?.platform === "railway"

  const meta = isRailway && deployment.service_name ? (
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
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          if (target) void openUrl(target)
        }
        if (e.key === "Enter" && e.shiftKey) {
          e.preventDefault()
          if (deployment.inspector_url) void openUrl(deployment.inspector_url)
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

      <div className="flex min-w-0 items-center gap-[6px]">
        <StatusGlyph status={deployment.state} size={12} />
        <span
          className="truncate text-[13px] font-semibold leading-none text-foreground"
          style={{ letterSpacing: -0.1 }}
        >
          {project?.name ?? deployment.project_id}
        </span>
        {meta}
        <span className="flex-1" />
        <span className="shrink-0 font-mono-tabular text-[11px] text-faint">{time}</span>
      </div>

      <div className="mt-[3px] flex min-w-0 items-center gap-[6px]">
        {author && <InitialsAvatar name={author} size={13} />}
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
          {commitMsg ?? branch ?? "—"}
        </span>
        {branch && (
          <span className="max-w-[90px] shrink-0 truncate font-mono-tabular text-[10.5px] text-faint">
            {branch}
          </span>
        )}
      </div>

      {focused && (
        <div className="mt-[8px] flex items-center gap-[6px] pl-[22px]">
          <DRButton
            variant="secondary"
            size="sm"
            leading={<Icon name="external" size={11} />}
            className="h-6 px-[9px] text-[11.5px]"
            onClick={(e) => {
              e.stopPropagation()
              if (target) void openUrl(target)
            }}
          >
            Open site
          </DRButton>
          <DRButton
            variant="ghost"
            size="sm"
            leading={<Icon name="external" size={11} />}
            className="h-6 px-2 text-[11.5px]"
            onClick={(e) => {
              e.stopPropagation()
              if (deployment.inspector_url) void openUrl(deployment.inspector_url)
            }}
          >
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
