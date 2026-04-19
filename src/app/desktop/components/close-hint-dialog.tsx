import { useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { DRButton } from "@/components/dr/button"
import { Kbd } from "@/components/dr/kbd"
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="font-display text-[15px] font-semibold">
            Dev Radio keeps running
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            It lives in your menubar. Click the radio icon anytime, or press{" "}
            <Kbd>⌥⌘D</Kbd>. To quit fully, right-click the menubar icon and
            choose Quit.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-[12.5px] text-foreground">
          <Checkbox
            checked={dontShow}
            onCheckedChange={(v) => setDontShow(v === true)}
          />
          Don't show this again
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <DRButton variant="ghost" size="sm" onClick={handleQuit}>
            Quit now
          </DRButton>
          <DRButton
            variant="primary"
            size="sm"
            onClick={() => void handleClose()}
          >
            Got it
          </DRButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
