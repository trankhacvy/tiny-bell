import { useEffect, useState } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

import { DRButton } from "@/components/dr/button"
import { DRInput } from "@/components/dr/input"
import { Icon } from "@/components/dr/icon"
import { ProviderChip } from "@/components/dr/provider-chip"
import { cn } from "@/lib/utils"
import {
  accountsApi,
  friendlyAuthError,
  type AccountProfile,
  type Platform,
} from "@/lib/accounts"
import { deploymentsApi } from "@/lib/deployments"

type Mode = "oauth" | "pat"

type TokenLink = {
  href: string
  label: string
  scopeLabel: string | null
  placeholder: string
  hint: string | null
}

const TOKEN_LINKS: Record<Platform, TokenLink> = {
  vercel: {
    href: "https://vercel.com/account/tokens",
    label: "vercel.com/account/tokens",
    scopeLabel: "Team ID (optional)",
    placeholder: "vercel_token_…",
    hint: null,
  },
  railway: {
    href: "https://railway.com/account/tokens",
    label: "railway.com/account/tokens",
    scopeLabel: null,
    placeholder: "rlwy_…",
    hint: "Select “No workspace” to create an account token.",
  },
}

export type AddAccountFormProps = {
  platform: Platform
  onConnected: (profile: AccountProfile) => void
  onResetRef?: (fn: () => void) => void
}

export function AddAccountForm({
  platform,
  onConnected,
  onResetRef,
}: AddAccountFormProps) {
  const [mode, setMode] = useState<Mode>(
    platform === "vercel" ? "oauth" : "pat",
  )
  const [busy, setBusy] = useState(false)
  const [oauthPending, setOauthPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState("")
  const [scope, setScope] = useState("")

  const link = TOKEN_LINKS[platform]

  useEffect(() => {
    setMode(platform === "vercel" ? "oauth" : "pat")
    setToken("")
    setScope("")
    setError(null)
  }, [platform])

  useEffect(() => {
    onResetRef?.(() => {
      setBusy(false)
      setOauthPending(false)
      setError(null)
      setToken("")
      setScope("")
      setMode(platform === "vercel" ? "oauth" : "pat")
    })
  }, [onResetRef, platform])

  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    listen<AccountProfile>("oauth:complete", (event) => {
      onConnected(event.payload)
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [onConnected])

  async function handleOAuth() {
    setBusy(true)
    setOauthPending(true)
    setError(null)
    try {
      const profile = await accountsApi.startOAuth(platform)
      onConnected(profile)
    } catch (e) {
      setError(friendlyAuthError(e))
    } finally {
      setBusy(false)
      setOauthPending(false)
    }
  }

  async function handleCancelOAuth() {
    try {
      await accountsApi.cancelOAuth()
    } catch {
      /* non-fatal */
    }
    setBusy(false)
    setOauthPending(false)
  }

  async function handlePat() {
    if (!token.trim()) return
    setBusy(true)
    setError(null)
    try {
      const profile = await accountsApi.connectWithToken(
        platform,
        token.trim(),
        scope.trim() || undefined,
      )
      onConnected(profile)
    } catch (e) {
      setError(friendlyAuthError(e))
    } finally {
      setBusy(false)
    }
  }

  function openTokenUrl(e: React.MouseEvent) {
    e.preventDefault()
    void deploymentsApi.openExternal(link.href)
  }

  return (
    <div className="flex flex-col gap-4">
      <ProviderChip platform={platform} size="md" />

      {platform === "vercel" ? (
        <div className="inline-flex gap-0.5 rounded-[6px] border border-border bg-surface-2 p-0.5">
          <ModePill
            active={mode === "oauth"}
            onClick={() => setMode("oauth")}
          >
            OAuth
          </ModePill>
          <ModePill active={mode === "pat"} onClick={() => setMode("pat")}>
            Paste token
          </ModePill>
        </div>
      ) : null}

      {platform === "vercel" && mode === "oauth" ? (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-muted-foreground">
            Opens your browser to approve Dev Radio. The token is stored only
            in your system keychain.
          </p>
          <DRButton
            variant="primary"
            size="md"
            fullWidth
            onClick={handleOAuth}
            disabled={busy}
          >
            {busy ? "Waiting for browser…" : "Connect with Vercel"}
          </DRButton>
          {oauthPending ? (
            <DRButton
              variant="ghost"
              size="sm"
              fullWidth
              onClick={handleCancelOAuth}
            >
              Cancel
            </DRButton>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${platform}-token`}
              className="text-[12px] font-medium text-foreground"
            >
              {platform === "vercel"
                ? "Personal Access Token"
                : "Railway API token"}
            </label>
            <DRInput
              id={`${platform}-token`}
              mono
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={link.placeholder}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[11px] text-muted-foreground">
              Create one at{" "}
              <a
                className="inline-flex items-center gap-0.5 underline underline-offset-2"
                href={link.href}
                onClick={openTokenUrl}
              >
                {link.label}
                <Icon name="external" size={11} />
              </a>
              {link.hint ? (
                <>
                  {" "}
                  <span>{link.hint}</span>
                </>
              ) : null}
            </p>
          </div>

          {platform === "vercel" && link.scopeLabel ? (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="vercel-scope"
                className="text-[12px] font-medium text-foreground"
              >
                {link.scopeLabel}
              </label>
              <DRInput
                id="vercel-scope"
                mono
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="team_xxx"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          ) : null}

          <DRButton
            variant="primary"
            size="md"
            fullWidth
            disabled={!token.trim() || busy}
            onClick={handlePat}
          >
            Connect
          </DRButton>
        </div>
      )}

      {error ? (
        <div
          role="alert"
          className="rounded-[6px] border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger"
        >
          {error}
        </div>
      ) : null}
    </div>
  )
}

type ModePillProps = {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function ModePill({ active, onClick, children }: ModePillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[4px] px-2.5 py-1 text-[11.5px] font-medium transition-colors",
        active
          ? "bg-surface text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
