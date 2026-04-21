import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

import { DRBadge } from "@/components/dr/badge"
import { DRButton } from "@/components/dr/button"
import { ChevronDown, Plus, TriangleAlert } from "lucide-react"
import { ProviderMark } from "@/components/dr/provider-mark"
import { DRMenu, DRMenuItem, DRMenuSeparator } from "@/components/dr/menu"
import { AddAccountDialog } from "@/components/account/add-account-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RepoSelector } from "@/components/account/repo-selector"
import {
  accountsApi,
  PLATFORM_LABEL,
  type AccountHealth,
  type AccountProfile,
  type AccountRecord,
  type Platform,
} from "@/lib/accounts"
import { formatInterval } from "@/lib/format"
import { DEFAULT_PREFS, prefsApi, type Prefs } from "@/lib/prefs"

type Props = {
  accounts: AccountRecord[]
  onAccountsChange: () => void | Promise<void>
}

export function SettingsAccounts({ accounts, onAccountsChange }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogPlatform, setDialogPlatform] = useState<Platform | undefined>(
    undefined,
  )
  const [reauthTarget, setReauthTarget] = useState<AccountRecord | null>(null)
  const [repoSelectorAccountId, setRepoSelectorAccountId] = useState<
    string | null
  >(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)

  useEffect(() => {
    prefsApi
      .get()
      .then(setPrefs)
      .catch(() => {})
    let unlisten: UnlistenFn | undefined
    listen<Prefs>("prefs:changed", (e) => setPrefs(e.payload)).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [])

  async function handleRemove(id: string) {
    await accountsApi.remove(id)
    await onAccountsChange()
  }

  function startRename(id: string, current: string) {
    setRenamingId(id)
    setRenameValue(current)
  }

  function cancelRename() {
    setRenamingId(null)
    setRenameValue("")
  }

  async function commitRename() {
    if (!renamingId) return
    const next = renameValue.trim()
    const current =
      accounts.find((a) => a.id === renamingId)?.display_name ?? ""
    if (!next || next === current) {
      cancelRename()
      return
    }
    const id = renamingId
    cancelRename()
    await accountsApi.rename(id, next)
    await onAccountsChange()
  }

  function handleReconnect(account: AccountRecord) {
    setReauthTarget(account)
    setDialogPlatform(account.platform)
    setDialogOpen(true)
  }

  function handleAddAccount() {
    setReauthTarget(null)
    setDialogPlatform(undefined)
    setDialogOpen(true)
  }

  async function handleConnected(profile: AccountProfile) {
    // If the user was reconnecting a broken account, retire the old record
    // after the replacement successfully authenticates.
    const wasReauth = reauthTarget !== null
    if (reauthTarget) {
      try {
        await accountsApi.remove(reauthTarget.id)
      } catch {
        /* non-fatal: user can still delete it manually */
      }
    }
    setReauthTarget(null)
    await onAccountsChange()

    // GitHub accounts can't poll anything until the user picks which repos
    // to monitor. Skip this for re-auth (user already has repos selected).
    if (profile.platform === "github" && !wasReauth) {
      setRepoSelectorAccountId(profile.id)
    }
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open)
    if (!open) {
      setReauthTarget(null)
    }
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
            {accounts.length} account{accounts.length !== 1 ? "s" : ""} · polling every{" "}
            {formatInterval(prefs.refresh_interval_ms)}
          </p>
        </div>
        <DRButton
          variant="secondary"
          size="sm"
          leading={<Plus size={12} />}
          onClick={handleAddAccount}
        >
          Add account
        </DRButton>
      </header>

      {needsReauth.length > 0 ? (
        <ReauthBanner
          count={needsReauth.length}
          onOpenFirst={() => {
            if (needsReauth[0]) handleReconnect(needsReauth[0])
          }}
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
                {renamingId === acc.id ? (
                  <RenameInput
                    value={renameValue}
                    onChange={setRenameValue}
                    onCommit={() => void commitRename()}
                    onCancel={cancelRename}
                  />
                ) : (
                  <span className="block truncate text-[12.5px] font-semibold text-foreground">
                    {acc.display_name}
                  </span>
                )}
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
                    <ChevronDown size={12} />
                  </button>
                }
              >
                {acc.health !== "ok" ? (
                  <DRMenuItem onSelect={() => handleReconnect(acc)}>
                    Re-connect…
                  </DRMenuItem>
                ) : null}
                <DRMenuItem
                  onSelect={() => startRename(acc.id, acc.display_name)}
                >
                  Rename…
                </DRMenuItem>
                {acc.platform === "github" ? (
                  <DRMenuItem
                    onSelect={() => setRepoSelectorAccountId(acc.id)}
                  >
                    Manage repositories…
                  </DRMenuItem>
                ) : null}
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
        onOpenChange={handleDialogOpenChange}
        onConnected={handleConnected}
        initialPlatform={dialogPlatform}
      />

      <Dialog
        open={repoSelectorAccountId !== null}
        onOpenChange={(open) => {
          if (!open) setRepoSelectorAccountId(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage repositories</DialogTitle>
            <DialogDescription>
              Select which repositories to monitor for workflow runs.
            </DialogDescription>
          </DialogHeader>
          {repoSelectorAccountId ? (
            <RepoSelector
              accountId={repoSelectorAccountId}
              initialRepos={
                accounts.find((a) => a.id === repoSelectorAccountId)
                  ?.monitored_repos ?? undefined
              }
              onSave={() => {
                setRepoSelectorAccountId(null)
                void onAccountsChange()
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

type RenameInputProps = {
  value: string
  onChange: (next: string) => void
  onCommit: () => void
  onCancel: () => void
}

function RenameInput({ value, onChange, onCommit, onCancel }: RenameInputProps) {
  const ref = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      onCommit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={onCommit}
      className="block w-full rounded-[4px] border border-border bg-surface-2 px-1.5 py-0.5 text-[12.5px] font-semibold text-foreground outline-none focus:border-foreground"
    />
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
        <TriangleAlert size={12} className="text-white" />
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
        Re-connect
      </DRButton>
    </div>
  )
}
