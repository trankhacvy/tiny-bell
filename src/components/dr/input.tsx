import type { InputHTMLAttributes } from "react"
import { forwardRef } from "react"
import { cn } from "@/lib/utils"

type DRInputProps = {
  mono?: boolean
  invalid?: boolean
} & InputHTMLAttributes<HTMLInputElement>

export const DRInput = forwardRef<HTMLInputElement, DRInputProps>(
  function DRInput({ mono, invalid, className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-8 w-full rounded-[6px] border bg-surface px-2.5 text-[13px]",
          "outline-none transition-colors",
          "placeholder:text-faint",
          "focus:border-foreground/40 focus:ring-2 focus:ring-ring/20",
          "disabled:cursor-not-allowed disabled:opacity-60",
          invalid ? "border-danger" : "border-border",
          mono && "font-mono-tabular",
          className,
        )}
        {...rest}
      />
    )
  },
)
