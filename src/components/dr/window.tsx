import type { CSSProperties, ReactNode } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { cn } from "@/lib/utils"

function TrafficLights() {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Close"
        className="size-3 rounded-full bg-[#ff5f57] ring-[0.5px] ring-black/20 hover:brightness-90 active:brightness-75"
        onClick={() => void getCurrentWindow().close()}
      />
      <span className="size-3 rounded-full bg-[#febc2e] ring-[0.5px] ring-black/20" />
      <span className="size-3 rounded-full bg-[#28c840] ring-[0.5px] ring-black/20" />
    </div>
  )
}

type DRWindowProps = {
  title?: string
  titleRight?: ReactNode
  children: ReactNode
  showChrome?: boolean
  className?: string
  style?: CSSProperties
}

export function DRWindow({
  title = "Dev Radio",
  titleRight,
  children,
  showChrome = true,
  className,
  style,
}: DRWindowProps) {
  return (
    <div
      className={cn(
        "flex h-screen w-screen flex-col bg-surface text-foreground",
        className,
      )}
      style={style}
    >
      {showChrome && (
        <div
          data-tauri-drag-region
          className="grid h-[38px] shrink-0 items-center border-b border-border-subtle bg-surface px-3"
          style={{ gridTemplateColumns: "1fr auto 1fr" }}
        >
          <div className="flex items-center">
            <TrafficLights />
          </div>
          <div className="text-[12px] font-medium tracking-[0.1px] text-muted-foreground">
            {title}
          </div>
          <div className="flex items-center justify-end gap-1.5">
            {titleRight}
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        {children}
      </div>
    </div>
  )
}
