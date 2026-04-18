import { useEffect, useState } from "react"
import { Plus, Power, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  accountsApi,
  PLATFORM_LABEL,
  type AccountProfile,
  type AccountRecord,
} from "@/lib/accounts"
import { deploymentsApi, windowApi } from "@/lib/deployments"
import { AddAccountDialog } from "@/components/account/add-account-dialog"
import { Topbar } from "../components/topbar"
import type { DesktopRoute } from "../desktop-app"

type Props = {
  accounts: AccountRecord[]
  onRouteChange: (route: DesktopRoute) => void
  onAccountsChange: () => void | Promise<void>
}

const INTERVAL_OPTIONS: number[] = [5, 10, 15, 30, 60, 120, 300]

export function SettingsView({
  accounts,
  onRouteChange,
  onAccountsChange,
}: Props) {
  const [interval, setInterval] = useState<number>(15)
  const [autostart, setAutostart] = useState<boolean>(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    deploymentsApi
      .getPollInterval()
      .then(setInterval)
      .catch(() => {})
    windowApi
      .getAutostart()
      .then(setAutostart)
      .catch(() => {})
  }, [])

  async function handleInterval(v: number) {
    setInterval(v)
    await deploymentsApi.setPollInterval(v)
  }

  async function handleAutostart(next: boolean) {
    setAutostart(next)
    try {
      await windowApi.setAutostart(next)
    } catch {
      setAutostart(!next)
    }
  }

  async function handleRemove(id: string) {
    await accountsApi.remove(id)
    await onAccountsChange()
  }

  function handleConnected(_profile: AccountProfile) {
    void onAccountsChange()
  }

  function handleQuit() {
    void windowApi.quit()
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Topbar
        route="settings"
        hasAccounts={accounts.length > 0}
        onRouteChange={onRouteChange}
        right={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 size-4" />
            Add account
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-8">
          <header className="space-y-1">
            <h1 className="font-heading text-xl font-semibold tracking-tight">
              Settings
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage connected accounts and polling behavior.
            </p>
          </header>

          <Card className="p-5">
            <div className="mb-4">
              <h2 className="text-sm font-medium">Accounts</h2>
              <p className="text-xs text-muted-foreground">
                {accounts.length === 0
                  ? "No accounts connected."
                  : `${accounts.length} account${accounts.length === 1 ? "" : "s"} connected.`}
              </p>
            </div>

            {accounts.length > 0 && (
              <ul className="divide-y rounded-md border">
                {accounts.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <Badge variant="outline" className="shrink-0">
                      {PLATFORM_LABEL[a.platform]}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {a.display_name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {a.scope_id ? `scope: ${a.scope_id}` : "personal"}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void handleRemove(a.id)}
                      aria-label={`Remove ${a.display_name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-medium">General</h2>
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs text-muted-foreground">
                  Poll interval
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {INTERVAL_OPTIONS.map((v) => (
                    <Button
                      key={v}
                      size="sm"
                      variant={interval === v ? "default" : "outline"}
                      onClick={() => void handleInterval(v)}
                    >
                      {v < 60 ? `${v}s` : `${v / 60}m`}
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              <label className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">Launch at login</div>
                  <div className="text-xs text-muted-foreground">
                    Start Dev Radio when you log in to your computer.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autostart}
                  onChange={(e) => void handleAutostart(e.target.checked)}
                  className="size-4 cursor-pointer"
                />
              </label>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-medium">Dev Radio</h2>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handleQuit}
            >
              <Power className="mr-2 size-4" />
              Quit Dev Radio
            </Button>
          </Card>
        </div>
      </div>

      <AddAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConnected={handleConnected}
      />
    </div>
  )
}
