import { Kbd } from "@/components/dr/kbd"
import { formatRelative } from "@/lib/format"

type PopoverFooterProps = {
  lastRefreshedAt: number | null
  offline?: boolean
}

export function PopoverFooter({
  lastRefreshedAt,
  offline,
}: PopoverFooterProps) {
  return (
    <footer className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-border-subtle bg-surface px-3">
      <span className="truncate text-[11px] text-muted-foreground">
        {offline
          ? "Offline"
          : lastRefreshedAt
            ? `Updated ${formatRelative(lastRefreshedAt)}`
            : "Connecting…"}
      </span>
      <div className="flex items-center gap-2 text-[10.5px] text-faint">
        <span className="flex items-center gap-1">
          <Kbd>⌘R</Kbd>refresh
        </span>
        <span className="flex items-center gap-1">
          <Kbd>⌘,</Kbd>settings
        </span>
        <span className="flex items-center gap-1">
          <Kbd>⌘Q</Kbd>quit
        </span>
      </div>
    </footer>
  )
}
