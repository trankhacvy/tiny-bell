import { useCallback, useEffect, useState } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"

import { accountsApi, type AccountRecord } from "@/lib/accounts"
import { DeploymentsView } from "./views/deployments-view"
import { EmptyConnectView } from "./views/empty-connect-view"

export function PopoverApp() {
  const [accounts, setAccounts] = useState<AccountRecord[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const list = await accountsApi.list()
      setAccounts(list)
    } catch {
      /* swallow */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const unlisten: (UnlistenFn | undefined)[] = []

    listen("accounts:changed", () => void reload()).then((fn) => {
      unlisten.push(fn)
    })
    listen("popover:show", () => void reload()).then((fn) => {
      unlisten.push(fn)
    })

    const w = getCurrentWindow()
    const onFocusPromise = w.onFocusChanged(({ payload: focused }) => {
      if (focused) void reload()
    })
    onFocusPromise.then((fn) => unlisten.push(fn))

    return () => {
      for (const fn of unlisten) fn?.()
    }
  }, [reload])

  if (loading) return null

  return accounts.length === 0 ? (
    <EmptyConnectView />
  ) : (
    <DeploymentsView accounts={accounts} />
  )
}
