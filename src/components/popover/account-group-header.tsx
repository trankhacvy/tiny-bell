import { ProviderMark } from "@/components/dr/provider-mark"
import type { Platform } from "@/lib/accounts"

type Props = {
  label: string
  platform: Platform
  count: number
}

export function AccountGroupHeader({ label, platform, count }: Props) {
  return (
    <div className="flex items-center gap-[7px] px-[14px] pb-1 pt-[10px]">
      <ProviderMark platform={platform} size={11} className="shrink-0 text-faint" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
        {label}
      </span>
      <span className="font-mono-tabular text-[10px] font-medium text-faint opacity-70">
        · {count}
      </span>
    </div>
  )
}
