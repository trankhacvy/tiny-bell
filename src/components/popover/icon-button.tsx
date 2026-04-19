import { forwardRef, type ButtonHTMLAttributes } from "react"
import { Icon, type IconName } from "@/components/dr/icon"
import { cn } from "@/lib/utils"

type IconButtonProps = {
  name: IconName
  size?: number
  tooltip?: string
} & ButtonHTMLAttributes<HTMLButtonElement>

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { name, size = 14, tooltip, className, type = "button", ...rest },
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
        <Icon name={name} size={size} />
      </button>
    )
  },
)
