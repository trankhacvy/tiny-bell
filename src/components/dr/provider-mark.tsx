import vercelSvg from "@/assets/providers/vercel.svg?raw"
import railwaySvg from "@/assets/providers/railway.svg?raw"
import githubSvg from "@/assets/providers/github.svg?raw"
import type { Platform } from "@/lib/accounts"

const RAW: Record<Platform, string> = {
  vercel: vercelSvg,
  railway: railwaySvg,
  github: githubSvg,
}

function currentColorize(svg: string): string {
  return svg
    .replace(/\sfill="(?!none)[^"]*"/g, ' fill="currentColor"')
    .replace(/\sstroke="(?!none)[^"]*"/g, ' stroke="currentColor"')
}

const PROCESSED: Record<Platform, string> = {
  vercel: currentColorize(RAW.vercel),
  railway: currentColorize(RAW.railway),
  github: currentColorize(RAW.github),
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
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "inline-flex",
        width: size,
        height: size,
        lineHeight: 0,
      }}
      dangerouslySetInnerHTML={{ __html: PROCESSED[platform] }}
    />
  )
}
