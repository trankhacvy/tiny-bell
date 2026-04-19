import type { ButtonHTMLAttributes, ReactNode } from "react"
import { forwardRef } from "react"
import { cn } from "@/lib/utils"

type Variant = "primary" | "secondary" | "ghost" | "danger"
type Size = "sm" | "md" | "lg"

type DRButtonProps = {
  variant?: Variant
  size?: Size
  leading?: ReactNode
  trailing?: ReactNode
  fullWidth?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-[6px] font-medium " +
  "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring " +
  "disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap"

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-foreground text-background hover:opacity-90 active:opacity-80",
  secondary:
    "bg-surface-2 text-foreground border border-border hover:bg-hover",
  ghost:
    "text-foreground hover:bg-hover",
  danger:
    "bg-danger text-white hover:opacity-90",
}

const SIZE: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12px]",
  md: "h-8 px-3 text-[13px]",
  lg: "h-10 px-4 text-[13.5px]",
}

export const DRButton = forwardRef<HTMLButtonElement, DRButtonProps>(
  function DRButton(
    {
      variant = "secondary",
      size = "md",
      leading,
      trailing,
      fullWidth,
      className,
      children,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          BASE,
          VARIANT[variant],
          SIZE[size],
          fullWidth && "w-full",
          className,
        )}
        {...rest}
      >
        {leading}
        {children}
        {trailing}
      </button>
    )
  },
)
