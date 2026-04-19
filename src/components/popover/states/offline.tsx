import { DRButton } from "@/components/dr/button"
import { Icon } from "@/components/dr/icon"
import { deploymentsApi } from "@/lib/deployments"

export function PopoverOffline() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-10 py-12 text-center">
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-surface-2 text-warning">
        <Icon name="warning" size={18} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-display text-[14px] font-medium text-foreground">
          You're offline
        </p>
        <p className="text-[12px] text-muted-foreground">
          We'll resume as soon as the network is back.
        </p>
      </div>
      <DRButton
        variant="secondary"
        size="sm"
        onClick={() => void deploymentsApi.refreshNow()}
      >
        Try again
      </DRButton>
    </div>
  )
}
