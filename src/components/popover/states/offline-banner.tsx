import { DRButton } from "@/components/dr/button"
import { TriangleAlert } from "lucide-react"
import { deploymentsApi } from "@/lib/deployments"
import { formatRelative } from "@/lib/format"

type Props = {
  lastRefreshedAt: number | null
}

export function OfflineBanner({ lastRefreshedAt }: Props) {
  const ago = lastRefreshedAt ? formatRelative(lastRefreshedAt) : null
  return (
    <div
      className="flex shrink-0 items-start gap-[8px] border-b px-[14px] py-[10px]"
      style={{
        background: "color-mix(in oklch, var(--amber) 14%, transparent)",
        borderColor: "color-mix(in oklch, var(--amber) 30%, transparent)",
      }}
    >
      <TriangleAlert size={13} className="mt-px shrink-0 text-warning" />
      <div className="flex-1">
        <p className="text-[12px] font-semibold text-foreground">Can't reach the provider</p>
        <p className="mt-0.5 text-[11.5px] leading-[1.4] text-muted-foreground">
          {ago
            ? `Showing last-known snapshot from ${ago}.`
            : "Network unavailable."}
        </p>
      </div>
      <DRButton
        variant="ghost"
        size="sm"
        className="h-[22px] px-[6px] text-[11px]"
        onClick={() => void deploymentsApi.refreshNow()}
      >
        Retry
      </DRButton>
    </div>
  )
}
