import { useEffect, useState } from "react"
import { Kbd } from "@/components/dr/kbd"
import { formatRelative } from "@/lib/format"

type PopoverFooterProps = {
  lastRefreshedAt: number | null
  offline?: boolean
  refreshing?: boolean
  intervalLabel?: string
}

export function PopoverFooter({
  lastRefreshedAt,
  offline,
  refreshing,
  intervalLabel = "30s",
}: PopoverFooterProps) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(t)
  }, [])

  return (
    <footer className="flex h-[36px] shrink-0 items-center gap-2 border-t border-border-subtle bg-surface px-[14px]">
      <span
        className="size-[5px] shrink-0 rounded-full opacity-80"
        style={{ background: offline ? "var(--amber)" : "var(--green)" }}
      />
      <span className="truncate text-[11px] text-faint">
        {offline
          ? "Offline"
          : refreshing
            ? "Checking…"
            : lastRefreshedAt
              ? `Updated ${formatRelative(lastRefreshedAt, now)}`
              : "Connecting…"}
      </span>
      {!offline && (
        <>
          <span className="text-[11px] text-faint/50">·</span>
          <span className="shrink-0 text-[11px] text-faint">Every {intervalLabel}</span>
        </>
      )}
      <span className="flex-1" />
      <span className="flex shrink-0 items-center gap-1 text-[10.5px] text-faint">
        <Kbd className="h-[14px] min-w-[14px] text-[9px]">⌘</Kbd>
        <Kbd className="h-[14px] min-w-[14px] text-[9px]">R</Kbd>
        <span className="ml-1">refresh</span>
      </span>
    </footer>
  )
}
