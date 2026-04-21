import { useEffect, useState } from "react"

import { DRWindow } from "@/components/dr/window"
import { DRTabs } from "@/components/dr/tabs"
import { SettingsAccounts } from "./settings/accounts-tab"
import { SettingsGeneral } from "./settings/general-tab"
import { SettingsAbout } from "./settings/about-tab"
import type { AccountRecord } from "@/lib/accounts"

const TABS = ["Accounts", "General", "About"] as const
type Tab = (typeof TABS)[number]

type Props = {
  accounts: AccountRecord[]
  onAccountsChange: () => void | Promise<void>
  initialTab?: Tab
}

export function SettingsView({
  accounts,
  onAccountsChange,
  initialTab = "Accounts",
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  return (
    <DRWindow>
      <DRTabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto w-full max-w-[520px]">
          {tab === "Accounts" ? (
            <SettingsAccounts
              accounts={accounts}
              onAccountsChange={onAccountsChange}
            />
          ) : null}
          {tab === "General" ? <SettingsGeneral /> : null}
          {tab === "About" ? <SettingsAbout /> : null}
        </div>
      </div>
    </DRWindow>
  )
}
