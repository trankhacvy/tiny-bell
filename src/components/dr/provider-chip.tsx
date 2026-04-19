import { ProviderMark } from "./provider-mark"
import type { Platform } from "@/lib/accounts"
import { PLATFORM_LABEL } from "@/lib/accounts"
import { cn } from "@/lib/utils"

type ProviderChipProps = {
  platform: Platform
  size?: "sm" | "md" | "lg"
  showLabel?: boolean
  className?: string
}

const MARK_PX: Record<"sm" | "md" | "lg", number> = {
  sm: 12,
  md: 14,
  lg: 22,
}

const ACCENT_VAR: Record<Platform, string> = {
  vercel: "var(--accent-vercel)",
  railway: "var(--accent-railway)",
}

export function ProviderChip({
  platform,
  size = "md",
  showLabel = true,
  className,
}: ProviderChipProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      style={{ color: ACCENT_VAR[platform] }}
    >
      <ProviderMark platform={platform} size={MARK_PX[size]} />
      {showLabel && (
        <span className="text-[12px] font-medium text-foreground">
          {PLATFORM_LABEL[platform]}
        </span>
      )}
    </span>
  )
}
