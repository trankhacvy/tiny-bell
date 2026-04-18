import { useEffect, useState, type CSSProperties } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { ExternalLink, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  accountsApi,
  friendlyAuthError,
  type AccountProfile,
  type Platform,
} from "@/lib/accounts"
import { deploymentsApi } from "@/lib/deployments"
import {
  PROVIDER_THEMES,
  type ProviderTheme,
} from "@/lib/provider-theme"

type Mode = "oauth" | "pat"

export type AddAccountFormProps = {
  platform: Platform
  onConnected: (profile: AccountProfile) => void
  theme?: ProviderTheme
  onResetRef?: (fn: () => void) => void
  layout?: "branded" | "plain"
}

export function AddAccountForm({
  platform,
  onConnected,
  theme: themeProp,
  onResetRef,
  layout = "plain",
}: AddAccountFormProps) {
  const theme = themeProp ?? PROVIDER_THEMES[platform]
  const [mode, setMode] = useState<Mode>(platform === "vercel" ? "oauth" : "pat")
  const [busy, setBusy] = useState(false)
  const [oauthPending, setOauthPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState("")
  const [scope, setScope] = useState("")

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

  const branded = layout === "branded"

  const ctaStyle: CSSProperties | undefined = branded
    ? {
        backgroundColor: theme.ctaBg,
        color: theme.ctaText,
      }
    : undefined
  const labelStyle: CSSProperties | undefined = branded
    ? { color: theme.cardText }
    : undefined
  const helperStyle: CSSProperties | undefined = branded
    ? { color: theme.cardMuted }
    : undefined
  const inputStyle: CSSProperties | undefined = branded
    ? {
        backgroundColor: theme.inputBg,
        borderColor: theme.inputBorder,
        color: theme.inputText,
      }
    : undefined
  const linkStyle: CSSProperties | undefined = branded
    ? { color: theme.linkColor }
    : undefined
  const errorStyle: CSSProperties | undefined = branded
    ? {
        color: "#FCA5A5",
        backgroundColor: "rgba(248,113,113,0.08)",
        borderColor: "rgba(248,113,113,0.3)",
      }
    : undefined

  function openTokenUrl(e: React.MouseEvent) {
    e.preventDefault()
    void deploymentsApi.openExternal(theme.tokenUrl)
  }

  return (
    <div className="space-y-4">
      {platform === "vercel" && (
        <div
          className="inline-flex rounded-md p-0.5 text-xs"
          style={
            branded
              ? {
                  backgroundColor: theme.inputBg,
                  border: `1px solid ${theme.cardBorder}`,
                }
              : undefined
          }
        >
          <ModePill
            active={mode === "oauth"}
            onClick={() => setMode("oauth")}
            branded={branded}
            theme={theme}
          >
            Sign in with Vercel
          </ModePill>
          <ModePill
            active={mode === "pat"}
            onClick={() => setMode("pat")}
            branded={branded}
            theme={theme}
          >
            Paste token
          </ModePill>
        </div>
      )}

      {platform === "vercel" && mode === "oauth" ? (
        <div className="space-y-3">
          <p className="text-sm" style={helperStyle}>
            Opens your browser to approve Dev Radio. Your token never leaves
            this machine.
          </p>
          <Button
            className={cn(
              "w-full font-medium",
              branded && "hover:opacity-90",
            )}
            style={ctaStyle}
            onClick={handleOAuth}
            disabled={busy}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {busy ? "Waiting for browser…" : "Connect with Vercel"}
          </Button>
          {oauthPending && (
            <Button
              variant="ghost"
              className="w-full"
              onClick={handleCancelOAuth}
              style={branded ? { color: theme.cardMuted } : undefined}
            >
              Cancel
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label
              htmlFor={`${platform}-token`}
              style={labelStyle}
              className={cn(branded && "text-sm")}
            >
              {platform === "vercel"
                ? "Personal Access Token"
                : "Railway API token"}
            </Label>
            <Input
              id={`${platform}-token`}
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                platform === "vercel" ? "vercel_token_…" : "rlwy_…"
              }
              autoComplete="off"
              spellCheck={false}
              style={inputStyle}
              className={cn(
                branded &&
                  "placeholder:text-[color:var(--brand-placeholder)]",
              )}
            />
            <p className="text-xs" style={helperStyle}>
              Create one at{" "}
              <a
                className="inline-flex items-center gap-0.5 underline underline-offset-2"
                href={theme.tokenUrl}
                onClick={openTokenUrl}
                style={linkStyle}
              >
                {theme.tokenUrl.replace("https://", "")}
                <ExternalLink className="size-3" />
              </a>
            </p>
          </div>

          {platform === "vercel" && theme.scopeLabel && (
            <div className="space-y-1.5">
              <Label
                htmlFor="vercel-scope"
                style={labelStyle}
                className={cn(branded && "text-sm")}
              >
                {theme.scopeLabel}
              </Label>
              <Input
                id="vercel-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="team_xxx"
                autoComplete="off"
                spellCheck={false}
                style={inputStyle}
              />
            </div>
          )}

          <Button
            className={cn(
              "w-full font-medium",
              branded && "hover:opacity-90",
            )}
            style={ctaStyle}
            disabled={!token.trim() || busy}
            onClick={handlePat}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Connect
          </Button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            !branded &&
              "border-destructive/40 bg-destructive/10 text-destructive",
          )}
          style={errorStyle}
        >
          {error}
        </div>
      )}
    </div>
  )
}

type ModePillProps = {
  active: boolean
  branded: boolean
  theme: ProviderTheme
  onClick: () => void
  children: React.ReactNode
}

function ModePill({ active, branded, theme, onClick, children }: ModePillProps) {
  const activeStyle: CSSProperties | undefined =
    active && branded
      ? {
          backgroundColor: theme.cardBg,
          color: theme.cardText,
        }
      : undefined
  const inactiveStyle: CSSProperties | undefined =
    !active && branded ? { color: theme.cardMuted } : undefined
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
        !branded && active && "bg-background text-foreground shadow-sm",
        !branded && !active && "text-muted-foreground hover:text-foreground",
      )}
      style={active ? activeStyle : inactiveStyle}
    >
      {children}
    </button>
  )
}
