import type { ReactNode } from "react"
import { DropdownMenu as DM } from "radix-ui"
import { cn } from "@/lib/utils"

type DRMenuProps = {
  trigger: ReactNode
  children: ReactNode
  align?: "start" | "center" | "end"
  side?: "top" | "bottom" | "left" | "right"
  sideOffset?: number
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DRMenu({
  trigger,
  children,
  align = "start",
  side = "bottom",
  sideOffset = 6,
  className,
  open,
  onOpenChange,
}: DRMenuProps) {
  return (
    <DM.Root open={open} onOpenChange={onOpenChange}>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content
          align={align}
          side={side}
          sideOffset={sideOffset}
          className={cn(
            "z-50 min-w-[200px] overflow-hidden rounded-[8px] border border-border bg-surface p-1 text-foreground",
            "shadow-[0_8px_24px_rgba(20,20,30,0.12),0_0_0_0.5px_rgba(0,0,0,0.05)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
            "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
            className,
          )}
        >
          {children}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}

type DRMenuItemProps = {
  onSelect?: () => void
  disabled?: boolean
  accel?: ReactNode
  left?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
}

export function DRMenuItem({
  onSelect,
  disabled,
  accel,
  left,
  right,
  children,
  className,
}: DRMenuItemProps) {
  return (
    <DM.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex h-7 items-center gap-2 rounded-[5px] px-2 text-[12.5px] text-foreground outline-none",
        "data-[highlighted]:bg-hover data-[disabled]:opacity-50",
        className,
      )}
    >
      {left ? <span className="flex w-4 justify-center">{left}</span> : null}
      <span className="flex-1 truncate">{children}</span>
      {right ? <span className="text-muted-foreground">{right}</span> : null}
      {accel ? (
        <span className="font-mono-tabular text-[10.5px] text-muted-foreground">
          {accel}
        </span>
      ) : null}
    </DM.Item>
  )
}

export function DRMenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-border-subtle" />
}

export function DRMenuLabel({ children }: { children: ReactNode }) {
  return (
    <DM.Label className="px-2 pt-1.5 pb-1 text-[10.5px] font-medium tracking-wide text-faint uppercase">
      {children}
    </DM.Label>
  )
}
