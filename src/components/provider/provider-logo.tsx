import { cn } from "@/lib/utils"
import type { Platform } from "@/lib/accounts"

type Props = {
  platform: Platform
  className?: string
  color?: string
}

export function ProviderLogo({ platform, className, color }: Props) {
  if (platform === "vercel") {
    return (
      <svg
        viewBox="0 0 76 65"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("size-6", className)}
        aria-hidden
      >
        <path d="M37.527 0 75.054 65H0z" fill={color ?? "currentColor"} />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-6", className)}
      aria-hidden
    >
      <path
        fill={color ?? "currentColor"}
        d="M12 3L3 8.5V15.5L12 21L21 15.5V8.5L12 3Z M12 5.2L18.8 9L12 12.8L5.2 9L12 5.2Z M5 10.9L11.2 14.5V19.3L5 15.7V10.9Z M12.8 14.5L19 10.9V15.7L12.8 19.3V14.5Z"
      />
    </svg>
  )
}
