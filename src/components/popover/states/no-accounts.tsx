import { DRButton } from "@/components/dr/button"
import { Icon } from "@/components/dr/icon"
import { windowApi } from "@/lib/deployments"

export function PopoverNoAccounts() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
      <div className="mb-[14px]">
        <svg width="32" height="32" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-faint">
          <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
          <path d="M5 5 Q3 8 5 11" />
          <path d="M11 5 Q13 8 11 11" />
          <path d="M2.5 3 Q-0.5 8 2.5 13" opacity="0.5" />
          <path d="M13.5 3 Q16.5 8 13.5 13" opacity="0.5" />
        </svg>
      </div>
      <p className="mb-[6px] text-[16px] font-semibold text-foreground" style={{ letterSpacing: -0.2 }}>
        Nothing to listen to.
      </p>
      <p className="mb-[16px] max-w-[260px] text-[12px] leading-[1.5] text-muted-foreground">
        Connect a Vercel or Railway account and Dev Radio will start tracking
        your deploys.
      </p>
      <DRButton
        variant="primary"
        size="sm"
        leading={<Icon name="external" size={12} />}
        onClick={() => void windowApi.openDesktop("onboarding")}
      >
        Open Dev Radio
      </DRButton>
    </div>
  )
}
