import type { SimpleIcon } from "simple-icons"

// Thin wrapper around a `simple-icons` icon object. Renders a 24×24 viewBox
// SVG using `fill="currentColor"` so the icon inherits the surrounding text
// color. Used by `ProviderMark` for connectable platforms and directly by
// the onboarding "Coming soon" list for roadmap providers that don't yet
// have a `Platform` enum variant.

type BrandMarkProps = {
  icon: SimpleIcon
  size?: number
  className?: string
}

export function BrandMark({ icon, size = 14, className }: BrandMarkProps) {
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
