import { useEffect } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { windowApi } from "@/lib/deployments"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CloseHintDialog({ open, onOpenChange }: Props) {
  useEffect(() => {
    if (open) {
      void windowApi.markCloseHintSeen()
    }
  }, [open])

  function handleGotIt() {
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
          <DialogTitle>Still running in the menu bar</DialogTitle>
          <DialogDescription>
            Dev Radio keeps polling your deploys in the background. Click the
            radio icon in the menu bar any time. To fully exit, use the tray
            menu's Quit option or press ⌘Q.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={handleQuit}>
            Quit now
          </Button>
          <Button onClick={handleGotIt}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
