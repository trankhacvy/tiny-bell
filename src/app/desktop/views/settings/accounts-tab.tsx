import { useState } from "react"

import { DRButton } from "@/components/dr/button"
import { Icon } from "@/components/dr/icon"
import { InitialsAvatar } from "@/components/dr/initials-avatar"
import { ProviderMark } from "@/components/dr/provider-mark"
import { DRMenu, DRMenuItem, DRMenuSeparator } from "@/components/dr/menu"
import { AddAccountDialog } from "@/components/account/add-account-dialog"
import { cn } from "@/lib/utils"
import {
  accountsApi,
  PLATFORM_LABEL,
  type AccountHealth,
  type AccountProfile,
  type AccountRecord,
} from "@/lib/accounts"

type Props = {
  accounts: AccountRecord[]
  onAccountsChange: () => void | Promise<void>
}

export function SettingsAccounts({ accounts, onAccountsChange }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)

  async function handleRemove(id: string) {
    await accountsApi.remove(id)
    await onAccountsChange()
  }

  async function handleRename(id: string, current: string) {
    const next = window.prompt("Rename account", current)?.trim()
    if (!next || next === current) return
    await accountsApi.rename(id, next)
    await onAccountsChange()
  }

  async function handleVerify(id: string) {
    await accountsApi.validateToken(id).catch(() => {})
    await onAccountsChange()
  }

  function handleConnected(_profile: AccountProfile) {
    void onAccountsChange()
  }

  const needsReauth = accounts.filter(
    (a) => a.health === "needs_reauth" || a.health === "revoked",
  )

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-[15px] font-semibold text-foreground">
            Accounts
          </h2>
          <p className="text-[12px] text-muted-foreground">
            {accounts.length === 0
              ? "No accounts connected."
              : `${accounts.length} ${accounts.length === 1 ? "account" : "accounts"} connected.`}
          </p>
        </div>
        <DRButton
          variant="primary"
          size="sm"
          leading={<Icon name="plus" size={12} />}
          onClick={() => setDialogOpen(true)}
        >
          Add account
        </DRButton>
      </header>

      {needsReauth.length > 0 ? (
        <ReauthBanner
          count={needsReauth.length}
          onOpenFirst={() =>
            needsReauth[0] ? void handleVerify(needsReauth[0].id) : null
          }
        />
      ) : null}

      {accounts.length > 0 ? (
        <ul className="divide-y divide-border-subtle rounded-[8px] border border-border bg-surface">
          {accounts.map((acc) => (
            <li
              key={acc.id}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <InitialsAvatar name={acc.display_name} size={24} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-foreground">
                  <HealthDot health={acc.health} />
                  {acc.display_name}
                </span>
                <span className="flex items-center gap-1.5 truncate text-[11.5px] text-muted-foreground">
                  <ProviderMark platform={acc.platform} size={10} />
                  {PLATFORM_LABEL[acc.platform]}
                  {acc.scope_id ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="truncate">{acc.scope_id}</span>
                    </>
                  ) : null}
                </span>
              </div>
              <DRMenu
                align="end"
                trigger={
                  <button
                    type="button"
                    className="inline-flex size-7 items-center justify-center rounded-[5px] text-muted-foreground outline-none hover:bg-hover hover:text-foreground"
                    aria-label={`Actions for ${acc.display_name}`}
                  >
                    <Icon name="chevron-down" size={12} />
                  </button>
                }
              >
                <DRMenuItem
                  onSelect={() => void handleRename(acc.id, acc.display_name)}
                >
                  Rename…
                </DRMenuItem>
                <DRMenuSeparator />
                <DRMenuItem onSelect={() => void handleRemove(acc.id)}>
                  Sign out
                </DRMenuItem>
              </DRMenu>
            </li>
          ))}
        </ul>
      ) : null}

      <AddAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConnected={handleConnected}
      />
    </div>
  )
}

const HEALTH_COLOR: Record<AccountHealth, string> = {
  ok: "var(--green)",
  needs_reauth: "var(--amber)",
  revoked: "var(--red)",
}

const HEALTH_LABEL: Record<AccountHealth, string> = {
  ok: "Connected",
  needs_reauth: "Needs re-authentication",
  revoked: "Access revoked",
}

function HealthDot({ health }: { health: AccountHealth }) {
  return (
    <span
      aria-label={HEALTH_LABEL[health]}
      role="img"
      className={cn(
        "inline-block shrink-0 rounded-full",
        health !== "ok" && "ring-2 ring-surface",
      )}
      style={{
        width: 6,
        height: 6,
        background: HEALTH_COLOR[health],
      }}
    />
  )
}

function ReauthBanner({
  count,
  onOpenFirst,
}: {
  count: number
  onOpenFirst: () => void
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-[8px] border border-[color-mix(in_oklab,var(--amber)_40%,transparent)] bg-[color-mix(in_oklab,var(--amber)_10%,transparent)] px-3 py-2.5"
      role="alert"
    >
      <span
        aria-hidden
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--amber)" }}
      >
        <Icon name="warning" size={12} className="text-white" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[12.5px] font-medium text-foreground">
          {count === 1
            ? "1 account needs re-authentication"
            : `${count} accounts need re-authentication`}
        </span>
        <span className="text-[11.5px] text-muted-foreground">
          Sign in again to resume polling deployments.
        </span>
      </div>
      <DRButton variant="secondary" size="sm" onClick={onOpenFirst}>
        Re-verify
      </DRButton>
    </div>
  )
}
