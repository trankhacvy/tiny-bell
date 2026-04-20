import {
  siGithub,
  siRailway,
  siVercel,
  type SimpleIcon,
} from "simple-icons"

import type { Platform } from "@/lib/accounts"
import { BrandMark } from "./brand-mark"

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
  return <BrandMark icon={MARKS[platform]} size={size} className={className} />
}
