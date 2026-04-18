import { Radio } from "lucide-react"

import { Button } from "@/components/ui/button"
import { windowApi } from "@/lib/deployments"

export function EmptyConnectView() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
        <Radio className="size-6 text-primary" />
      </div>
      <div className="space-y-1">
        <h1 className="font-heading text-base font-semibold">
          No accounts connected
        </h1>
        <p className="text-sm text-muted-foreground">
          Open Dev Radio to connect Vercel or Railway.
        </p>
      </div>
      <Button onClick={() => void windowApi.openDesktop("onboarding")}>
        Connect account
      </Button>
    </div>
  )
}
