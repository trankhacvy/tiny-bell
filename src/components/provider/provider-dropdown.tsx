import type { CSSProperties } from "react"
import { ChevronDown, Check } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { ProviderLogo } from "@/components/provider/provider-logo"
import { cn } from "@/lib/utils"
import type { Platform } from "@/lib/accounts"
import { PROVIDER_ORDER, PROVIDER_THEMES } from "@/lib/provider-theme"

type Props = {
  platform: Platform
  onChange: (platform: Platform) => void
  size?: "sm" | "md"
  triggerClassName?: string
  triggerStyle?: CSSProperties
}

export function ProviderDropdown({
  platform,
  onChange,
  size = "md",
  triggerClassName,
  triggerStyle,
}: Props) {
  const theme = PROVIDER_THEMES[platform]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={size === "sm" ? "sm" : "default"}
          className={cn("gap-2", triggerClassName)}
          style={triggerStyle}
        >
          <ProviderLogo platform={platform} className="size-4" />
          <span>{theme.label}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {PROVIDER_ORDER.map((p) => {
          const t = PROVIDER_THEMES[p]
          const active = p === platform
          return (
            <DropdownMenuItem
              key={p}
              onSelect={() => onChange(p)}
              className="gap-2"
            >
              <ProviderLogo platform={p} className="size-4" />
              <span className="flex-1">{t.label}</span>
              {active && <Check className="size-3.5" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
