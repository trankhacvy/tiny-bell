import type { CSSProperties, ReactNode } from "react"
import { HelpCircle, Radio, Settings } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { DesktopRoute } from "../desktop-app"

type Props = {
  route: DesktopRoute
  onRouteChange: (route: DesktopRoute) => void
  hasAccounts: boolean
  right?: ReactNode
  tone?: "default" | "dark"
  foreground?: string
  borderColor?: string
}

export function Topbar({
  route,
  onRouteChange,
  hasAccounts,
  right,
  tone = "default",
  foreground,
  borderColor,
}: Props) {
  const containerStyle: CSSProperties | undefined =
    tone === "dark"
      ? {
          color: foreground ?? "#FFFFFF",
          borderColor: borderColor ?? "rgba(255,255,255,0.1)",
          backgroundColor: "transparent",
        }
      : undefined

  return (
    <header
      data-tauri-drag-region
      className={cn(
        "flex h-12 shrink-0 items-center gap-2 border-b px-3",
        tone === "dark" ? "border-transparent" : "border-border bg-background",
      )}
      style={containerStyle}
    >
      <div data-tauri-drag-region className="flex w-20 shrink-0 items-center gap-2 pl-16">
        <Radio className="size-4" />
        <span className="font-heading text-sm font-semibold tracking-tight">
          Dev Radio
        </span>
      </div>

      <div className="flex-1" data-tauri-drag-region />

      <div className="flex items-center gap-1.5">
        {right}
        {hasAccounts && route !== "settings" && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onRouteChange("settings")}
            aria-label="Settings"
            style={tone === "dark" ? { color: foreground } : undefined}
          >
            <Settings className="size-4" />
          </Button>
        )}
        {route !== "about" && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onRouteChange("about")}
            aria-label="About"
            style={tone === "dark" ? { color: foreground } : undefined}
          >
            <HelpCircle className="size-4" />
          </Button>
        )}
      </div>
    </header>
  )
}
