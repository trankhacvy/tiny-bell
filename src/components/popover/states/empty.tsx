import { Icon } from "@/components/dr/icon"

export function PopoverEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
      <div className="mb-[14px] flex size-[44px] items-center justify-center rounded-full border border-dashed border-border text-faint">
        <Icon name="dot" size={14} />
      </div>
      <p className="mb-1 text-[13px] font-semibold text-foreground">
        Suspiciously quiet.
      </p>
      <p className="max-w-[240px] text-[12px] leading-[1.5] text-muted-foreground">
        Your accounts are connected but no deployments have landed yet. Push
        something and we'll start listening.
      </p>
    </div>
  )
}
