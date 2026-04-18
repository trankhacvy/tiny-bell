import type { Platform } from "./accounts"

export type ProviderTheme = {
  platform: Platform
  label: string
  tagline: string
  heroBg: string
  heroText: string
  heroMuted: string
  heroAccent: string
  heroBorder: string
  cardBg: string
  cardBorder: string
  cardText: string
  cardMuted: string
  badge: string
  ctaBg: string
  ctaText: string
  ctaHover: string
  linkColor: string
  inputBg: string
  inputBorder: string
  inputText: string
  inputPlaceholder: string
  backgroundImage: string
  logoUrl: string
  tokenUrl: string
  scopeLabel: string | null
}

const VERCEL: ProviderTheme = {
  platform: "vercel",
  label: "Vercel",
  tagline: "Monitor Vercel deployments in your menu bar.",
  heroBg: "#000000",
  heroText: "#FFFFFF",
  heroMuted: "#A1A1AA",
  heroAccent: "#FFFFFF",
  heroBorder: "rgba(255,255,255,0.08)",
  cardBg: "rgba(255,255,255,0.04)",
  cardBorder: "rgba(255,255,255,0.12)",
  cardText: "#FFFFFF",
  cardMuted: "#A1A1AA",
  badge: "rgba(255,255,255,0.08)",
  ctaBg: "#FFFFFF",
  ctaText: "#000000",
  ctaHover: "#E4E4E7",
  linkColor: "#FFFFFF",
  inputBg: "rgba(255,255,255,0.05)",
  inputBorder: "rgba(255,255,255,0.15)",
  inputText: "#FFFFFF",
  inputPlaceholder: "#71717A",
  backgroundImage:
    "radial-gradient(circle at 20% -10%, rgba(255,255,255,0.08) 0%, transparent 45%), radial-gradient(circle at 85% 110%, rgba(255,255,255,0.05) 0%, transparent 40%)",
  logoUrl: "vercel",
  tokenUrl: "https://vercel.com/account/tokens",
  scopeLabel: "Team ID (optional)",
}

const RAILWAY: ProviderTheme = {
  platform: "railway",
  label: "Railway",
  tagline: "Track Railway service deployments in your menu bar.",
  heroBg: "#13111C",
  heroText: "#FFFFFF",
  heroMuted: "#A5A1B7",
  heroAccent: "#C084FC",
  heroBorder: "rgba(192,132,252,0.2)",
  cardBg: "rgba(255,255,255,0.04)",
  cardBorder: "rgba(192,132,252,0.2)",
  cardText: "#FFFFFF",
  cardMuted: "#A5A1B7",
  badge: "rgba(192,132,252,0.16)",
  ctaBg: "#8B5CF6",
  ctaText: "#FFFFFF",
  ctaHover: "#7C3AED",
  linkColor: "#C4B5FD",
  inputBg: "rgba(255,255,255,0.04)",
  inputBorder: "rgba(192,132,252,0.25)",
  inputText: "#FFFFFF",
  inputPlaceholder: "#7C7390",
  backgroundImage:
    "radial-gradient(circle at 20% -10%, rgba(139,92,246,0.25) 0%, transparent 45%), radial-gradient(circle at 80% 120%, rgba(236,72,153,0.18) 0%, transparent 50%)",
  logoUrl: "railway",
  tokenUrl: "https://railway.app/account/tokens",
  scopeLabel: null,
}

export const PROVIDER_THEMES: Record<Platform, ProviderTheme> = {
  vercel: VERCEL,
  railway: RAILWAY,
}

export const PROVIDER_ORDER: Platform[] = ["vercel", "railway"]
