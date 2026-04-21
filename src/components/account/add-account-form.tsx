import { useEffect, useState } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

import { DRButton } from "@/components/dr/button"
import { DRInput } from "@/components/dr/input"
import { ExternalLink } from "lucide-react"
import { ProviderChip } from "@/components/dr/provider-chip"
import { cn } from "@/lib/utils"
import {
  accountsApi,
  friendlyAuthError,
  type AccountProfile,
  type AuthMethodKind,
  type Platform,
} from "@/lib/accounts"
import { deploymentsApi } from "@/lib/deployments"

type Mode = "oauth" | "pat"

type DeviceCodeEvent = {
  user_code: string
  verification_uri: string
  expires_in: number
}

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
    hint: "Select 'No workspace' to create an account token.",
  },
  github: {
    // Fine-grained tokens page. Settings → Developer settings →
    // Personal access tokens → Fine-grained tokens.
    href: "https://github.com/settings/personal-access-tokens/new",
    label: "github.com/settings/personal-access-tokens",
    scopeLabel: null,
    placeholder: "github_pat_… or ghp_…",
    hint: "Fine-grained (recommended): Repository permissions → Actions = Read-only, Metadata = Read-only. Classic also works with 'repo' scope (broader access).",
  },
}

const OAUTH_BUTTON_LABEL: Record<Platform, string> = {
  vercel: "Connect with Vercel",
  railway: "Connect with Railway",
  github: "Connect with GitHub",
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
  const [mode, setMode] = useState<Mode>("oauth")
  const [busy, setBusy] = useState(false)
  const [oauthPending, setOauthPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState("")
  const [scope, setScope] = useState("")
  const [deviceCode, setDeviceCode] = useState<DeviceCodeEvent | null>(null)
  const [methods, setMethods] = useState<AuthMethodKind[]>([])

  const link = TOKEN_LINKS[platform]
  const oauthMethod = methods.find((m) => m !== "pat") ?? null
  const hasOAuth = oauthMethod !== null

  useEffect(() => {
    setToken("")
    setScope("")
    setError(null)
    setDeviceCode(null)
    let cancelled = false
    void accountsApi
      .listAuthMethods(platform)
      .then((list) => {
        if (cancelled) return
        setMethods(list)
        const preferred: Mode = list.some((m) => m !== "pat") ? "oauth" : "pat"
        setMode(preferred)
      })
      .catch(() => {
        if (cancelled) return
        setMethods(["pat"])
        setMode("pat")
      })
    return () => {
      cancelled = true
    }
  }, [platform])

  useEffect(() => {
    onResetRef?.(() => {
      setBusy(false)
      setOauthPending(false)
      setError(null)
      setToken("")
      setScope("")
      setMode("oauth")
      setDeviceCode(null)
    })
  }, [onResetRef])

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

  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    listen<DeviceCodeEvent>("oauth:device_code", (event) => {
      setDeviceCode(event.payload)
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [])

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
    setDeviceCode(null)
  }

  async function handleCopyDeviceCode() {
    if (!deviceCode) return
    try {
      await navigator.clipboard.writeText(deviceCode.user_code)
    } catch {
      /* non-fatal */
    }
  }

  function handleOpenVerification() {
    if (!deviceCode) return
    void deploymentsApi.openExternal(deviceCode.verification_uri)
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

      {hasOAuth ? (
        <div className="inline-flex gap-0.5 rounded-[6px] border border-border bg-surface-2 p-0.5">
          <ModePill active={mode === "oauth"} onClick={() => setMode("oauth")}>
            {oauthTabLabel(oauthMethod)}
          </ModePill>
          <ModePill active={mode === "pat"} onClick={() => setMode("pat")}>
            Paste token
          </ModePill>
        </div>
      ) : null}

      {mode === "oauth" ? (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-muted-foreground">
            Opens your browser to approve Tiny Bell. The token is stored only
            in your system keychain.
          </p>
          {deviceCode && platform === "github" ? (
            <DeviceCodePanel
              code={deviceCode.user_code}
              onCopy={handleCopyDeviceCode}
              onOpen={handleOpenVerification}
            />
          ) : (
            <DRButton
              variant="primary"
              size="md"
              fullWidth
              onClick={handleOAuth}
              disabled={busy}
            >
              {busy ? "Waiting for browser…" : OAUTH_BUTTON_LABEL[platform]}
            </DRButton>
          )}
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
                : platform === "github"
                  ? "GitHub Personal Access Token"
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
                <ExternalLink size={11} />
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

function oauthTabLabel(method: AuthMethodKind | null): string {
  switch (method) {
    case "device_code":
      return "Device code"
    case "oauth_loopback":
    case "oauth_broker":
      return "OAuth"
    default:
      return "OAuth"
  }
}

type DeviceCodePanelProps = {
  code: string
  onCopy: () => void
  onOpen: () => void
}

function DeviceCodePanel({ code, onCopy, onOpen }: DeviceCodePanelProps) {
  return (
    <div className="flex flex-col gap-2 rounded-[6px] border border-border bg-surface-2 p-3">
      <p className="text-[12px] text-muted-foreground">
        Enter this code at{" "}
        <button
          type="button"
          onClick={onOpen}
          className="font-medium underline underline-offset-2"
        >
          github.com/login/device
        </button>
      </p>
      <div className="flex items-center justify-between gap-2">
        <code className="flex-1 rounded-[4px] border border-border bg-surface px-2.5 py-1.5 text-center font-mono-tabular text-[16px] tracking-[0.2em] text-foreground">
          {code}
        </code>
        <DRButton variant="ghost" size="sm" onClick={onCopy}>
          Copy
        </DRButton>
      </div>
      <p className="text-[11px] text-muted-foreground">
        We'll finish automatically once you approve in the browser.
      </p>
    </div>
  )
}
