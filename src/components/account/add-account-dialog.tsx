import { useEffect, useRef, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ProviderChip } from "@/components/dr/provider-chip"
import { cn } from "@/lib/utils"
import { AddAccountForm } from "./add-account-form"
import type { AccountProfile, Platform } from "@/lib/accounts"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected: (profile: AccountProfile) => void
  initialPlatform?: Platform
}

const PLATFORMS: Platform[] = ["vercel", "railway", "github"]

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
          <DialogTitle>Connect an account</DialogTitle>
          <DialogDescription>
            Link a Vercel, Railway, or GitHub account to monitor deployments.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={cn(
                "flex-1 rounded-[6px] border px-3 py-2 text-left transition-colors",
                platform === p
                  ? "border-foreground bg-surface-2"
                  : "border-border hover:bg-hover",
              )}
            >
              <ProviderChip platform={p} size="md" />
            </button>
          ))}
        </div>

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
