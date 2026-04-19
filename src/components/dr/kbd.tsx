import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type KbdProps = {
  children: ReactNode
  className?: string
}

export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex min-w-[18px] items-center justify-center rounded-[4px] border border-border px-1 py-[0.5px]",
        "bg-surface font-mono-tabular text-[10.5px] font-medium text-muted-foreground",
        "shadow-[inset_0_-0.5px_0_rgba(0,0,0,0.06)]",
        className,
      )}
    >
      {children}
    </kbd>
  )
}
