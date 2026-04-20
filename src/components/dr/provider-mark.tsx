import {
  siGithub,
  siRailway,
  siVercel,
  type SimpleIcon,
} from "simple-icons"

import type { Platform } from "@/lib/accounts"

// simple-icons publishes canonical 24×24 monochrome brand marks, already
// normalized for `fill="currentColor"`. The package is `sideEffects: false`
// so Vite tree-shakes to just the icons we import below.
const MARKS: Record<Platform, SimpleIcon> = {
  vercel: siVercel,
  railway: siRailway,
  github: siGithub,
}

type ProviderMarkProps = {
  platform: Platform
  size?: number
  className?: string
}

export function ProviderMark({
  platform,
  size = 14,
  className,
}: ProviderMarkProps) {
  const icon = MARKS[platform]
  return (
    <svg
      role="img"
      aria-label={icon.title}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      style={{ display: "inline-block", flexShrink: 0 }}
    >
      <path d={icon.path} />
    </svg>
  )
}
