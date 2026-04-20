import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

type InitialsAvatarProps = {
  name: string
  /** Optional image URL. When set, renders an <img>; falls back to initials
   *  on load error or when missing. */
  src?: string | null
  size?: number
  className?: string
}

function getInitials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return "?"
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const PALETTE = [
  "oklch(0.72 0.11 210)",
  "oklch(0.72 0.14 150)",
  "oklch(0.72 0.16 285)",
  "oklch(0.75 0.14 85)",
  "oklch(0.68 0.15 25)",
  "oklch(0.72 0.13 340)",
  "oklch(0.7 0.12 260)",
  "oklch(0.74 0.11 190)",
]

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function InitialsAvatar({
  name,
  src,
  size = 22,
  className,
}: InitialsAvatarProps) {
  const [failed, setFailed] = useState(false)
  // Reset the failed flag whenever a new URL comes in (e.g. when the
  // component is reused for a different row).
  useEffect(() => {
    setFailed(false)
  }, [src])

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn(
          "inline-block shrink-0 rounded-full bg-surface-2 object-cover",
          className,
        )}
        style={{ width: size, height: size }}
      />
    )
  }

  const initials = getInitials(name)
  const color = PALETTE[hashName(name) % PALETTE.length]
  const fontSize = Math.max(9, Math.round(size * 0.42))
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: color,
        fontSize,
        lineHeight: 1,
        letterSpacing: 0,
      }}
      aria-label={name}
      role="img"
    >
      {initials}
    </span>
  )
}
