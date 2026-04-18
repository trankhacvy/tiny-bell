import { useCallback, useEffect, useState } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

import { accountsApi, type AccountRecord } from "@/lib/accounts"
import { OnboardingView } from "./views/onboarding-view"
import { SettingsView } from "./views/settings-view"
import { AboutView } from "./views/about-view"
import { CloseHintDialog } from "./components/close-hint-dialog"

export type DesktopRoute = "onboarding" | "settings" | "about"

export function DesktopApp() {
  const [route, setRoute] = useState<DesktopRoute>("onboarding")
  const [accounts, setAccounts] = useState<AccountRecord[]>([])
  const [closeHintOpen, setCloseHintOpen] = useState(false)

  const reload = useCallback(async () => {
    try {
      const list = await accountsApi.list()
      setAccounts(list)
    } catch {
      /* swallow */
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    let unRoute: UnlistenFn | undefined
    let unAccounts: UnlistenFn | undefined
    let unCloseHint: UnlistenFn | undefined

    listen<string>("desktop:route", (event) => {
      const next = event.payload
      if (next === "onboarding" || next === "settings" || next === "about") {
        setRoute(next)
      }
    }).then((fn) => {
      unRoute = fn
    })

    listen("accounts:changed", () => {
      void reload()
    }).then((fn) => {
      unAccounts = fn
    })

    listen("desktop:close-hint", () => {
      setCloseHintOpen(true)
    }).then((fn) => {
      unCloseHint = fn
    })

    return () => {
      unRoute?.()
      unAccounts?.()
      unCloseHint?.()
    }
  }, [reload])

  const hasAccounts = accounts.length > 0

  return (
    <>
      {route === "onboarding" && (
        <OnboardingView
          hasAccounts={hasAccounts}
          onRouteChange={setRoute}
          onConnected={() => void reload()}
          onDone={() => setRoute(hasAccounts ? "settings" : "onboarding")}
        />
      )}
      {route === "settings" && (
        <SettingsView
          accounts={accounts}
          onRouteChange={setRoute}
          onAccountsChange={reload}
        />
      )}
      {route === "about" && (
        <AboutView
          hasAccounts={hasAccounts}
          onRouteChange={setRoute}
        />
      )}

      <CloseHintDialog
        open={closeHintOpen}
        onOpenChange={setCloseHintOpen}
      />
    </>
  )
}
