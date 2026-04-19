import { useState } from "react"

import { DRBadge } from "@/components/dr/badge"
import { DRButton } from "@/components/dr/button"
import { Icon } from "@/components/dr/icon"
import { ProviderMark } from "@/components/dr/provider-mark"
import { DRMenu, DRMenuItem, DRMenuSeparator } from "@/components/dr/menu"
import { AddAccountDialog } from "@/components/account/add-account-dialog"
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
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground" style={{ letterSpacing: -0.1 }}>
            Connected accounts
          </h2>
          <p className="mt-0.5 text-[12px] text-faint">
            {accounts.length} account{accounts.length !== 1 ? "s" : ""} · polling every 30s
          </p>
        </div>
        <DRButton
          variant="secondary"
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
        <ul className="overflow-hidden rounded-[8px] border border-border bg-surface">
          {accounts.map((acc) => (
            <li
              key={acc.id}
              className="grid items-center gap-3 border-b border-border-subtle px-[14px] py-[11px] last:border-b-0"
              style={{ gridTemplateColumns: "28px 1fr auto auto" }}
            >
              <span className="inline-flex size-7 items-center justify-center rounded-[6px] border border-border bg-surface-2">
                <ProviderMark platform={acc.platform} size={14} />
              </span>
              <div className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold text-foreground">
                  {acc.display_name}
                </span>
                <span className="block text-[11.5px] text-faint">
                  {PLATFORM_LABEL[acc.platform]}
                </span>
              </div>
              <HealthBadge health={acc.health} />
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

      <p className="mt-[22px] mb-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
        Add another
      </p>
      <div className="grid grid-cols-2 gap-2">
        <DRButton
          variant="secondary"
          size="sm"
          fullWidth
          leading={<ProviderMark platform="vercel" size={13} />}
          onClick={() => setDialogOpen(true)}
        >
          Vercel team
        </DRButton>
        <DRButton
          variant="secondary"
          size="sm"
          fullWidth
          leading={<ProviderMark platform="railway" size={13} />}
          onClick={() => setDialogOpen(true)}
        >
          Railway account
        </DRButton>
      </div>

      <AddAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConnected={handleConnected}
      />
    </div>
  )
}

function HealthBadge({ health }: { health: AccountHealth }) {
  if (health === "ok") {
    return (
      <DRBadge tone="success">
        <span className="size-[6px] shrink-0 rounded-full" style={{ background: "var(--green)" }} />
        Healthy
      </DRBadge>
    )
  }
  if (health === "needs_reauth") {
    return (
      <DRBadge tone="warning">
        <span className="size-[6px] shrink-0 rounded-full" style={{ background: "var(--amber)" }} />
        Token expiring
      </DRBadge>
    )
  }
  return (
    <DRBadge tone="danger">
      <span className="size-[6px] shrink-0 rounded-full" style={{ background: "var(--red)" }} />
      Re-auth
    </DRBadge>
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
