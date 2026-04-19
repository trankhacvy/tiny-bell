import { DRButton } from "@/components/dr/button"
import { Icon } from "@/components/dr/icon"
import { deploymentsApi } from "@/lib/deployments"

export function PopoverRateLimit() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-10 py-12 text-center">
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-surface-2 text-warning">
        <Icon name="clock" size={18} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-display text-[14px] font-medium text-foreground">
          Easing off for a moment
        </p>
        <p className="text-[12px] text-muted-foreground">
          The provider is throttling us. We'll back off and try again
          shortly.
        </p>
      </div>
      <DRButton
        variant="secondary"
        size="sm"
        onClick={() => void deploymentsApi.refreshNow()}
      >
        Retry now
      </DRButton>
    </div>
  )
}
