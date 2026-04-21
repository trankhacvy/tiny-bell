import { forwardRef, type ButtonHTMLAttributes, type ComponentType } from "react"
import type { LucideProps } from "lucide-react"
import { cn } from "@/lib/utils"

type IconButtonProps = {
  icon: ComponentType<LucideProps>
  size?: number
  tooltip?: string
} & ButtonHTMLAttributes<HTMLButtonElement>

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { icon: Icon, size = 14, tooltip, className, type = "button", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        title={tooltip}
        aria-label={tooltip}
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-[5px] text-muted-foreground",
          "hover:bg-hover hover:text-foreground focus-visible:bg-hover focus-visible:text-foreground",
          "outline-none transition-colors",
          className,
        )}
        {...rest}
      >
        <Icon size={size} />
      </button>
    )
  },
)
