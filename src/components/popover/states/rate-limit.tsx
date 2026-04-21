import { Clock } from "lucide-react"

export function RateLimitBanner() {
  return (
    <div className="flex shrink-0 items-center gap-[8px] border-b border-border-subtle bg-surface-2 px-[14px] py-[9px]">
      <Clock size={12} className="shrink-0 text-muted-foreground" />
      <span className="flex-1 text-[11.5px] text-muted-foreground">
        Rate-limited by provider — backing off. Retry soon.
      </span>
    </div>
  )
}
