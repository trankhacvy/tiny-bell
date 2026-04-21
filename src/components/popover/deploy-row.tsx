import { openUrl } from "@tauri-apps/plugin-opener"
import {
  ChevronDown,
  Clock,
  GitBranch,
  GitCommit,
  Globe,
  Link2,
  ScrollText,
  User,
} from "lucide-react"
import type { ComponentType } from "react"
import type { LucideProps } from "lucide-react"
import { StatusGlyph } from "@/components/dr/status-glyph"
import { DRButton } from "@/components/dr/button"
import { formatRelativeShort } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Deployment, Project } from "@/lib/deployments"
import type { Platform } from "@/lib/accounts"

type DeployRowProps = {
  deployment: Deployment
  project: Project | null
  focused?: boolean
  expanded?: boolean
  onToggleExpand?: () => void
}

const PLATFORM_ACCENT: Record<Platform, string> = {
  vercel: "var(--accent-vercel, currentColor)",
  railway: "var(--accent-railway, currentColor)",
  github: "var(--accent-github, currentColor)",
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "")
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
}

function shortSha(sha: string): string {
  return sha.length > 7 ? sha.slice(0, 7) : sha
}

function ProjectChip({
  platform,
  name,
}: {
  platform: Platform | undefined
  name: string
}) {
  const accent = platform ? PLATFORM_ACCENT[platform] : "currentColor"
  return (
    <span className="inline-flex min-w-0 max-w-[160px] shrink items-center gap-[5px] rounded-[4px] border border-border bg-surface-2 px-[6px] py-[1px]">
      <span
        aria-hidden
        className="size-[6px] shrink-0 rounded-full"
        style={{ background: accent }}
      />
      <span className="truncate text-[11px] font-medium text-foreground">
        {name}
      </span>
    </span>
  )
}

function MetaChip({
  icon: Icon,
  children,
  mono,
}: {
  icon: ComponentType<LucideProps>
  children: React.ReactNode
  mono?: boolean
}) {
  return (
    <span className="inline-flex min-w-0 shrink items-center gap-[4px] text-[11px] text-muted-foreground">
      <Icon size={11} className="shrink-0 text-faint" />
      <span
        className={cn(
          "max-w-[120px] truncate",
          mono ? "font-mono-tabular" : undefined,
        )}
      >
        {children}
      </span>
    </span>
  )
}

function EnvPill({ env }: { env: string }) {
  return (
    <span
      className="shrink-0 rounded-[3px] border border-border bg-transparent px-[5px] py-0 text-[9.5px] font-semibold uppercase tracking-[0.4px] text-faint"
      style={{ letterSpacing: 0.4 }}
    >
      {env}
    </span>
  )
}

export function DeployRow({
  deployment,
  project,
  focused,
  expanded,
  onToggleExpand,
}: DeployRowProps) {
  const inspectTarget = deployment.inspector_url?.trim() || null
  const visitTarget = deployment.url?.trim() || null
  const enterTarget = inspectTarget ?? visitTarget
  const commitMsg = deployment.commit_message?.split("\n")[0]?.trim() ?? null
  const projectName = project?.name ?? deployment.project_id
  const primary = commitMsg ?? deployment.branch ?? projectName
  const time = formatRelativeShort(deployment.created_at)

  const isProd =
    deployment.environment === "production" ||
    deployment.environment === "prod"
  const serviceDifferent =
    !!deployment.service_name && deployment.service_name !== projectName
  const displayUrl = deployment.url
    ? stripProtocol(deployment.url)
    : project?.url
      ? stripProtocol(project.url)
      : null

  function visit() {
    if (visitTarget) void openUrl(visitTarget)
  }

  function inspect() {
    if (inspectTarget) void openUrl(inspectTarget)
  }

  function openPrimary() {
    if (enterTarget) void openUrl(enterTarget)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded ?? false}
      data-deploy-row
      data-deploy-id={deployment.id}
      onClick={() => onToggleExpand?.()}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          openPrimary()
        } else if (e.key === "Enter" && e.shiftKey) {
          e.preventDefault()
          visit()
        } else if (e.key === " ") {
          e.preventDefault()
          onToggleExpand?.()
        }
      }}
      className={cn(
        "group relative cursor-default border-b border-border-subtle px-[14px] py-[10px] outline-none last:border-b-0",
        focused ? "bg-hover" : "hover:bg-hover",
      )}
    >
      {focused && (
        <span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-[1px] bg-foreground" />
      )}

      <div
        className="grid min-w-0 gap-x-[10px]"
        style={{ gridTemplateColumns: "16px 1fr auto" }}
      >
        <div className="row-span-2 flex items-start pt-[1px]">
          <StatusGlyph status={deployment.state} size={14} />
        </div>

        <span
          className="min-w-0 truncate text-[12.5px] font-semibold leading-[1.35] text-foreground"
          style={{ letterSpacing: -0.1 }}
        >
          {primary}
        </span>

        <div className="flex shrink-0 items-center gap-[6px] self-start pt-[2px]">
          <span className="font-mono-tabular text-[10.5px] text-faint">
            {time}
          </span>
          <ChevronDown
            size={12}
            className={cn(
              "shrink-0 text-faint transition-transform",
              expanded ? "rotate-180" : undefined,
            )}
          />
        </div>

        <div className="col-span-2 mt-[3px] flex min-w-0 items-center gap-[8px] overflow-hidden">
          <ProjectChip platform={project?.platform} name={projectName} />
          {deployment.branch ? (
            <MetaChip icon={GitBranch} mono>
              {deployment.branch}
            </MetaChip>
          ) : null}
          {!isProd ? <EnvPill env={deployment.environment} /> : null}
        </div>
      </div>

      {expanded && (
        <div className="mt-[12px] grid gap-y-[6px] pl-[26px]">
          {deployment.author_name ? (
            <DetailItem icon={User} label="Author" value={deployment.author_name} />
          ) : null}
          {deployment.commit_sha ? (
            <DetailItem
              icon={GitCommit}
              label="Commit"
              value={shortSha(deployment.commit_sha)}
              mono
            />
          ) : null}
          {deployment.duration_ms !== null &&
          deployment.duration_ms !== undefined ? (
            <DetailItem
              icon={Clock}
              label="Duration"
              value={formatDuration(deployment.duration_ms)}
            />
          ) : null}
          {serviceDifferent && deployment.service_name ? (
            <DetailItem
              icon={GitBranch}
              label="Service"
              value={deployment.service_name}
            />
          ) : null}
          {displayUrl ? (
            <DetailItem icon={Link2} label="URL" value={displayUrl} mono />
          ) : null}

          <div className="mt-[8px] flex items-center gap-[6px]">
            {visitTarget ? (
              <DRButton
                variant="secondary"
                size="sm"
                leading={<Globe size={11} />}
                className="h-[24px] px-[9px] text-[11.5px]"
                onClick={(e) => {
                  e.stopPropagation()
                  visit()
                }}
              >
                Visit
              </DRButton>
            ) : null}
            {inspectTarget ? (
              <DRButton
                variant="ghost"
                size="sm"
                leading={<ScrollText size={11} />}
                className="h-[24px] px-2 text-[11.5px]"
                onClick={(e) => {
                  e.stopPropagation()
                  inspect()
                }}
              >
                Inspect
              </DRButton>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

type DetailItemProps = {
  icon: ComponentType<LucideProps>
  label: string
  value: string
  mono?: boolean
}

function DetailItem({ icon: Icon, label, value, mono }: DetailItemProps) {
  return (
    <div className="flex min-w-0 items-center gap-[8px] text-[11.5px]">
      <Icon size={11} className="shrink-0 text-faint" />
      <span className="w-[64px] shrink-0 text-faint">{label}</span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-foreground",
          mono ? "font-mono-tabular" : undefined,
        )}
      >
        {value}
      </span>
    </div>
  )
}
