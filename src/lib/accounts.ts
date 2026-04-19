import { trackedInvoke } from "./tauri"

export type Platform = "vercel" | "railway"

export type AccountProfile = {
  id: string
  platform: Platform
  display_name: string
  email: string | null
  avatar_url: string | null
  scope_id: string | null
}

export type AccountHealth = "ok" | "needs_reauth" | "revoked"

export type AccountRecord = {
  id: string
  platform: Platform
  display_name: string
  scope_id: string | null
  enabled: boolean
  created_at: number
  health: AccountHealth
}

export const accountsApi = {
  startOAuth(platform: Platform) {
    return trackedInvoke<AccountProfile>("start_oauth", { platform })
  },
  cancelOAuth() {
    return trackedInvoke<void>("cancel_oauth")
  },
  connectWithToken(platform: Platform, token: string, scopeId?: string) {
    return trackedInvoke<AccountProfile>("connect_with_token", {
      platform,
      token,
      scopeId: scopeId ?? null,
    })
  },
  list() {
    return trackedInvoke<AccountRecord[]>("list_accounts")
  },
  remove(id: string) {
    return trackedInvoke<void>("delete_account", { id })
  },
  setEnabled(id: string, enabled: boolean) {
    return trackedInvoke<AccountRecord | null>("set_account_enabled", {
      id,
      enabled,
    })
  },
  rename(id: string, displayName: string) {
    return trackedInvoke<AccountRecord | null>("rename_account", {
      id,
      displayName,
    })
  },
  validateToken(id: string) {
    return trackedInvoke<AccountHealth>("validate_token", { accountId: id })
  },
}

export function friendlyAuthError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? "")
  const lower = msg.toLowerCase()
  if (lower.includes("state mismatch")) {
    return "Security check failed. Please try again."
  }
  if (lower.includes("timed out") || lower.includes("server closed")) {
    return "Didn't receive approval — try again."
  }
  if (lower.startsWith("network")) {
    return "Can't reach the provider. Check your connection."
  }
  if (lower.startsWith("keychain")) {
    return "Couldn't save credentials to your system keychain."
  }
  if (lower.startsWith("config")) {
    return "OAuth is not configured in this build. Use the paste-token option."
  }
  if (lower.startsWith("provider")) {
    const after = msg.slice(msg.indexOf(":") + 1).trim()
    const afterLower = after.toLowerCase()
    if (
      afterLower.includes("not authorized") ||
      afterLower.includes("not authenticated") ||
      afterLower.includes("unauthorized") ||
      afterLower.includes("invalid token")
    ) {
      return "Railway rejected this token. Create a new one at railway.com/account/tokens and pick “No workspace”."
    }
    return after || msg
  }
  if (lower.startsWith("server")) {
    return msg.slice(msg.indexOf(":") + 1).trim() || msg
  }
  return msg
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  vercel: "Vercel",
  railway: "Railway",
}
