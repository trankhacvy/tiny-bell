import type { CSSProperties, ReactNode } from "react"
import { cn } from "@/lib/utils"

type DRWindowProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

export function DRWindow({ children, className, style }: DRWindowProps) {
  return (
    <div
      className={cn(
        "flex h-screen w-screen flex-col bg-surface text-foreground",
        className,
      )}
      style={style}
    >
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        {children}
      </div>
    </div>
  )
}
