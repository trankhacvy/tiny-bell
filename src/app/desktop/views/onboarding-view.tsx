import { type CSSProperties, useState } from "react"
import { CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ProviderDropdown } from "@/components/provider/provider-dropdown"
import { ProviderLogo } from "@/components/provider/provider-logo"
import { AddAccountForm } from "@/components/account/add-account-form"
import { GuideSteps, type GuideStep } from "../components/guide-steps"
import { Topbar } from "../components/topbar"
import type { DesktopRoute } from "../desktop-app"
import type { AccountProfile, Platform } from "@/lib/accounts"
import { PLATFORM_LABEL } from "@/lib/accounts"
import { PROVIDER_THEMES, type ProviderTheme } from "@/lib/provider-theme"
import { windowApi } from "@/lib/deployments"

type Props = {
  hasAccounts: boolean
  onRouteChange: (route: DesktopRoute) => void
  onConnected: (profile: AccountProfile) => void | Promise<void>
  onDone: () => void
}

const VERCEL_STEPS: GuideStep[] = [
  {
    title: "Click Connect with Vercel",
    body: "Your browser opens Vercel's consent page. No password typing needed.",
  },
  {
    title: "Approve Dev Radio",
    body:
      "Pick personal or team scope. Vercel redirects back to this app with a token.",
  },
  {
    title: "You're live",
    body:
      "Your deployments start appearing in the menu bar within a few seconds.",
  },
]

const RAILWAY_STEPS: GuideStep[] = [
  {
    title: "Create an API token",
    body:
      "Railway doesn't offer OAuth — you'll create a personal API token and paste it below.",
  },
  {
    title: "Paste the token",
    body:
      "Tokens live only in your macOS Keychain and are never sent anywhere except Railway's API.",
  },
  {
    title: "You're live",
    body: "Your services appear in the menu bar within a few seconds.",
  },
]

type Stage = "connect" | "success"

export function OnboardingView({
  hasAccounts,
  onRouteChange,
  onConnected,
  onDone,
}: Props) {
  const [platform, setPlatform] = useState<Platform>("vercel")
  const [stage, setStage] = useState<Stage>("connect")
  const [latest, setLatest] = useState<AccountProfile | null>(null)

  const theme = PROVIDER_THEMES[platform]
  const steps = platform === "vercel" ? VERCEL_STEPS : RAILWAY_STEPS

  async function handleConnected(profile: AccountProfile) {
    setLatest(profile)
    setStage("success")
    await onConnected(profile)
  }

  async function handleFinish() {
    const seen = await windowApi.hasSeenCloseHint()
    if (!seen) {
      await windowApi.markCloseHintSeen()
    }
    await windowApi.closeDesktop()
    onDone()
  }

  function handleConnectAnother() {
    setStage("connect")
    setLatest(null)
  }

  const pageStyle: CSSProperties = {
    backgroundColor: theme.heroBg,
    backgroundImage: theme.backgroundImage,
    color: theme.heroText,
  }

  const dropdownTriggerStyle: CSSProperties = {
    backgroundColor: theme.inputBg,
    borderColor: theme.cardBorder,
    color: theme.heroText,
  }

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={pageStyle}
    >
      <Topbar
        route="onboarding"
        hasAccounts={hasAccounts}
        onRouteChange={onRouteChange}
        tone="dark"
        foreground={theme.heroText}
        borderColor={theme.heroBorder}
        right={
          stage === "connect" ? (
            <ProviderDropdown
              platform={platform}
              onChange={setPlatform}
              size="sm"
              triggerStyle={dropdownTriggerStyle}
            />
          ) : null
        }
      />

      <div className="flex-1 overflow-y-auto">
        {stage === "success" && latest ? (
          <SuccessPanel
            profile={latest}
            theme={theme}
            onAnother={handleConnectAnother}
            onDone={() => void handleFinish()}
          />
        ) : (
          <ConnectPanel
            platform={platform}
            steps={steps}
            onConnected={handleConnected}
          />
        )}
      </div>
    </div>
  )
}

type ConnectPanelProps = {
  platform: Platform
  steps: GuideStep[]
  onConnected: (profile: AccountProfile) => void
}

function ConnectPanel({ platform, steps, onConnected }: ConnectPanelProps) {
  const theme = PROVIDER_THEMES[platform]

  const cardStyle: CSSProperties = {
    backgroundColor: theme.cardBg,
    borderColor: theme.cardBorder,
    color: theme.cardText,
    backdropFilter: "blur(8px)",
  }
  const heroTextStyle: CSSProperties = { color: theme.heroText }
  const mutedStyle: CSSProperties = { color: theme.cardMuted }
  const badgeStyle: CSSProperties = {
    backgroundColor: theme.badge,
    color: theme.heroAccent,
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-8 py-10">
      <div className="flex flex-col items-center gap-5 text-center">
        <div
          className="flex size-14 items-center justify-center rounded-2xl"
          style={badgeStyle}
        >
          <ProviderLogo
            platform={platform}
            className="size-7"
            color={theme.heroAccent}
          />
        </div>
        <div className="space-y-2">
          <div
            className="text-xs font-medium uppercase tracking-widest"
            style={mutedStyle}
          >
            {theme.label}
          </div>
          <h1
            className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl"
            style={heroTextStyle}
          >
            Connect your {theme.label} account
          </h1>
          <p className="max-w-lg text-sm" style={mutedStyle}>
            {theme.tagline}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <div
          className="space-y-4 rounded-xl border p-5 md:col-span-2"
          style={cardStyle}
        >
          <h2 className="text-sm font-medium" style={heroTextStyle}>
            How it works
          </h2>
          <GuideSteps steps={steps} theme={theme} />
        </div>

        <div
          className="space-y-4 rounded-xl border p-5 md:col-span-3"
          style={cardStyle}
        >
          <h2 className="text-sm font-medium" style={heroTextStyle}>
            Get started
          </h2>
          <AddAccountForm
            platform={platform}
            theme={theme}
            layout="branded"
            onConnected={onConnected}
          />
        </div>
      </div>

      <p className="text-center text-xs" style={mutedStyle}>
        Tokens are stored only in your macOS Keychain. Dev Radio never sends
        them anywhere except {theme.label}'s API.
      </p>
    </div>
  )
}

type SuccessPanelProps = {
  profile: AccountProfile
  theme: ProviderTheme
  onAnother: () => void
  onDone: () => void
}

function SuccessPanel({ profile, theme, onAnother, onDone }: SuccessPanelProps) {
  const ctaStyle: CSSProperties = {
    backgroundColor: theme.ctaBg,
    color: theme.ctaText,
  }
  const outlineStyle: CSSProperties = {
    backgroundColor: theme.cardBg,
    borderColor: theme.cardBorder,
    color: theme.heroText,
  }
  const mutedStyle: CSSProperties = { color: theme.cardMuted }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
      <div
        className="flex size-16 items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(34,197,94,0.18)" }}
      >
        <CheckCircle2 className="size-9 text-green-400" />
      </div>
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-semibold">
          Connected as {profile.display_name}
        </h1>
        <p className="text-sm" style={mutedStyle}>
          {PLATFORM_LABEL[profile.platform]} is now being monitored in the menu
          bar.
        </p>
      </div>
      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          className="border"
          style={outlineStyle}
          onClick={onAnother}
        >
          Connect another
        </Button>
        <Button style={ctaStyle} onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  )
}

