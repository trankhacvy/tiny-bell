import { DRButton } from "@/components/dr/button"
import { ProviderMark } from "@/components/dr/provider-mark"
import { windowApi } from "@/lib/deployments"

export function PopoverNoAccounts() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-10 py-12 text-center">
      <div className="flex items-center gap-2 text-muted-foreground">
        <ProviderMark platform="vercel" size={22} />
        <ProviderMark platform="railway" size={22} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-display text-[15px] font-medium text-foreground">
          Connect a provider
        </p>
        <p className="max-w-[240px] text-[12px] text-muted-foreground">
          Hook up Vercel or Railway to watch your deployments from the
          menubar.
        </p>
      </div>
      <DRButton
        variant="primary"
        size="sm"
        onClick={() => void windowApi.openDesktop("onboarding")}
      >
        Add account
      </DRButton>
    </div>
  )
}
