import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/utils"

type Tone = "neutral" | "success" | "warning" | "danger" | "info"

type DRBadgeProps = {
  tone?: Tone
  children: ReactNode
} & HTMLAttributes<HTMLSpanElement>

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted-foreground border-border",
  success: "bg-[color-mix(in_oklab,var(--green)_15%,transparent)] text-[color:var(--green)] border-[color-mix(in_oklab,var(--green)_30%,transparent)]",
  warning: "bg-[color-mix(in_oklab,var(--amber)_15%,transparent)] text-[color:var(--amber)] border-[color-mix(in_oklab,var(--amber)_30%,transparent)]",
  danger: "bg-[color-mix(in_oklab,var(--red)_15%,transparent)] text-[color:var(--red)] border-[color-mix(in_oklab,var(--red)_30%,transparent)]",
  info: "bg-surface-2 text-foreground border-border",
}

export function DRBadge({
  tone = "neutral",
  children,
  className,
  ...rest
}: DRBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[11px] font-medium",
        TONE[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  )
}
