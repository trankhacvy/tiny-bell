import { useEffect, useRef, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ProviderDropdown } from "@/components/provider/provider-dropdown"
import { AddAccountForm } from "./add-account-form"
import type { AccountProfile, Platform } from "@/lib/accounts"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected: (profile: AccountProfile) => void
  initialPlatform?: Platform
}

export function AddAccountDialog({
  open,
  onOpenChange,
  onConnected,
  initialPlatform = "vercel",
}: Props) {
  const [platform, setPlatform] = useState<Platform>(initialPlatform)
  const resetRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (open) setPlatform(initialPlatform)
  }, [open, initialPlatform])

  function handleConnected(profile: AccountProfile) {
    onConnected(profile)
    onOpenChange(false)
    resetRef.current?.()
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetRef.current?.()
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle>Connect an account</DialogTitle>
              <DialogDescription>
                Link a Vercel or Railway account to monitor deployments.
              </DialogDescription>
            </div>
            <ProviderDropdown
              platform={platform}
              onChange={setPlatform}
              size="sm"
            />
          </div>
        </DialogHeader>

        <AddAccountForm
          platform={platform}
          onConnected={handleConnected}
          onResetRef={(fn) => {
            resetRef.current = fn
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
