import { cn } from "@/lib/utils"
import type { DeploymentState } from "@/lib/deployments"

type StatusGlyphProps = {
  status: DeploymentState
  size?: number
  className?: string
}

type Glyph = {
  color: string
  d: string
  label: string
  fillDot?: boolean
  animate?: boolean
}

const GLYPHS: Record<DeploymentState, Glyph> = {
  ready: {
    color: "var(--green)",
    d: "M4.5 8.5 L7 11 L11.5 5.5",
    label: "Ready",
  },
  building: {
    color: "var(--amber)",
    d: "",
    fillDot: true,
    animate: true,
    label: "Building",
  },
  queued: {
    color: "var(--amber)",
    d: "M4.5 8 h0.5 M7.75 8 h0.5 M11 8 h0.5",
    label: "Queued",
  },
  canceled: {
    color: "var(--text-3)",
    d: "M5.5 5.5 L10.5 10.5 M10.5 5.5 L5.5 10.5",
    label: "Canceled",
  },
  error: {
    color: "var(--red)",
    d: "M8 4.5 V9 M8 10.75 V10.9",
    label: "Error",
  },
  unknown: {
    color: "var(--text-3)",
    d: "M6.5 6.5 a1.5 1.5 0 1 1 3 0 c0 1 -1.5 1 -1.5 2 M8 10.75 V10.9",
    label: "Unknown",
  },
}

export function StatusGlyph({ status, size = 16, className }: StatusGlyphProps) {
  const g = GLYPHS[status]
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full",
        className,
      )}
      style={{ width: size, height: size, background: g.color }}
      data-animate={g.animate ? "pulse" : undefined}
      role="img"
      aria-label={g.label}
    >
      {g.fillDot ? (
        <span
          className="block rounded-full bg-white"
          style={{ width: Math.round(size * 0.3), height: Math.round(size * 0.3) }}
        />
      ) : (
        <svg viewBox="0 0 16 16" width={size} height={size} fill="none">
          <path
            d={g.d}
            stroke="white"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  )
}

export function statusLabel(state: DeploymentState): string {
  return GLYPHS[state].label
}

export function statusColor(state: DeploymentState): string {
  return GLYPHS[state].color
}
