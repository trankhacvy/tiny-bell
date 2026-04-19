import { windowApi } from "@/lib/deployments"
import { IconButton } from "./icon-button"
import type { Deployment } from "@/lib/deployments"

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

type PopoverHeaderProps = {
  deployments: Deployment[]
  onRefresh: () => void
}

export function PopoverHeader({ deployments, onRefresh }: PopoverHeaderProps) {
  const tone = deriveHeaderTone(deployments)

  const toneColor =
    tone === "broken"
      ? "var(--red)"
      : tone === "building"
        ? "var(--amber)"
        : "var(--green)"

  const toneBg =
    tone === "broken"
      ? "color-mix(in oklch, var(--red) 14%, transparent)"
      : tone === "building"
        ? "color-mix(in oklch, var(--amber) 18%, transparent)"
        : "color-mix(in oklch, var(--green) 14%, transparent)"

  return (
    <header className="flex h-[42px] shrink-0 items-center gap-2 border-b border-border-subtle bg-surface px-[14px]">
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
      <IconButton
        name="refresh"
        size={13}
        tooltip="Refresh (⌘R)"
        onClick={onRefresh}
      />
      <IconButton
        name="gear"
        size={13}
        tooltip="Settings"
        onClick={() => void windowApi.openDesktop("settings")}
      />
    </header>
  )
}
