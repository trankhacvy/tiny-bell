import { Ban, CheckCircle2, Circle, Clock, Loader2, XCircle } from "lucide-react"

import type { DeploymentState } from "@/lib/deployments"
import { cn } from "@/lib/utils"

type Props = {
  state: DeploymentState
  size?: "sm" | "md"
  className?: string
}

export function StatusIcon({ state, size = "md", className }: Props) {
  const sizeClass = size === "sm" ? "size-4" : "size-5"
  const base = cn(sizeClass, className)

  switch (state) {
    case "ready":
      return <CheckCircle2 className={cn(base, "text-green-600 dark:text-green-500")} />
    case "building":
      return (
        <Loader2
          className={cn(base, "animate-spin text-amber-600 dark:text-amber-500")}
        />
      )
    case "queued":
      return <Clock className={cn(base, "text-slate-500 dark:text-slate-400")} />
    case "error":
      return <XCircle className={cn(base, "text-red-600 dark:text-red-500")} />
    case "canceled":
      return <Ban className={cn(base, "text-gray-500 dark:text-gray-400")} />
    default:
      return <Circle className={cn(base, "text-muted-foreground")} />
  }
}

export function statusLabel(state: DeploymentState): string {
  switch (state) {
    case "ready":
      return "Ready"
    case "building":
      return "Building"
    case "queued":
      return "Queued"
    case "error":
      return "Error"
    case "canceled":
      return "Canceled"
    default:
      return "Unknown"
  }
}
