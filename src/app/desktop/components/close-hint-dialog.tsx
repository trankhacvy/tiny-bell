import { useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { DRButton } from "@/components/dr/button"
import { windowApi } from "@/lib/deployments"
import { prefsApi } from "@/lib/prefs"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CloseHintDialog({ open, onOpenChange }: Props) {
  const [dontShow, setDontShow] = useState(true)

  async function handleClose() {
    await windowApi.markCloseHintSeen()
    if (dontShow) {
      try {
        await prefsApi.set("hide_to_menubar_shown", true)
      } catch {
        /* swallow */
      }
    }
    onOpenChange(false)
  }

  function handleQuit() {
    onOpenChange(false)
    void windowApi.quit()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20" />

      <div className="relative w-[380px] overflow-hidden rounded-[12px] border border-border bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
        <div className="p-[22px]">
          <div
            className="mb-[10px] inline-flex size-7 items-center justify-center rounded-[7px]"
            style={{ background: "color-mix(in oklch, var(--accent-neutral) 15%, transparent)" }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              className="text-foreground"
            >
              <rect x="1" y="2" width="14" height="3" rx="1" />
              <rect x="1" y="7" width="14" height="7" rx="1" />
            </svg>
          </div>

          <h2
            className="font-display text-[15px] font-semibold text-foreground"
            style={{ letterSpacing: -0.2 }}
          >
            Tiny Bell is still listening.
          </h2>
          <p className="mt-[6px] text-[12.5px] leading-[1.55] text-muted-foreground">
            Closing this window doesn't quit the app — it just tucks back into
            the menubar. Look for the{" "}
            <span className="inline-flex items-center rounded-[4px] border border-border bg-surface-2 px-1 py-[1px] align-middle">
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                className="text-foreground"
              >
                <rect x="1" y="2" width="14" height="3" rx="1" />
                <rect x="1" y="7" width="14" height="7" rx="1" />
              </svg>
            </span>{" "}
            icon near your clock.
          </p>
        </div>

        <div className="flex items-center justify-between gap-[10px] border-t border-border-subtle bg-surface-2 px-[14px] py-[10px]">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-faint">
            <Checkbox
              checked={dontShow}
              onCheckedChange={(v) => setDontShow(v === true)}
            />
            Don't show this again
          </label>
          <div className="flex gap-[6px]">
            <DRButton variant="ghost" size="sm" onClick={handleQuit}>
              Quit instead
            </DRButton>
            <DRButton
              variant="primary"
              size="sm"
              onClick={() => void handleClose()}
            >
              Got it
            </DRButton>
          </div>
        </div>
      </div>
    </div>
  )
}
