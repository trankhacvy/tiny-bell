import { useMemo, useState } from "react"

import { DRWindow } from "@/components/dr/window"
import { DRButton } from "@/components/dr/button"
import { Kbd } from "@/components/dr/kbd"
import { StatusGlyph } from "@/components/dr/status-glyph"
import { InitialsAvatar } from "@/components/dr/initials-avatar"
import { ProviderMark } from "@/components/dr/provider-mark"
import { AddAccountForm } from "@/components/account/add-account-form"
import { cn } from "@/lib/utils"
import {
  PLATFORM_LABEL,
  type AccountProfile,
  type Platform,
} from "@/lib/accounts"
import { windowApi } from "@/lib/deployments"
import type { DesktopRoute } from "../desktop-app"

type Step =
  | { name: "welcome" }
  | { name: "connect"; platform: Platform; remaining: Platform[] }
  | { name: "success" }

type Props = {
  hasAccounts: boolean
  onRouteChange: (route: DesktopRoute) => void
  onConnected: (profile: AccountProfile) => void | Promise<void>
  onDone: () => void
}

export function OnboardingView({
  hasAccounts,
  onRouteChange,
  onConnected,
  onDone,
}: Props) {
  const [step, setStep] = useState<Step>({ name: "welcome" })
  const [connected, setConnected] = useState<AccountProfile[]>([])

  async function handleConnected(profile: AccountProfile) {
    await onConnected(profile)
    const next = [...connected, profile]
    setConnected(next)
    if (step.name === "connect" && step.remaining.length > 0) {
      const [first, ...rest] = step.remaining
      setStep({ name: "connect", platform: first, remaining: rest })
    } else {
      setStep({ name: "success" })
    }
  }

  function handleSkip() {
    if (step.name !== "connect") return
    if (step.remaining.length > 0) {
      const [first, ...rest] = step.remaining
      setStep({ name: "connect", platform: first, remaining: rest })
    } else {
      setStep({ name: "success" })
    }
  }

  async function handleFinish() {
    const seen = await windowApi.hasSeenCloseHint()
    if (!seen) await windowApi.markCloseHintSeen()
    await windowApi.closeDesktop()
    onDone()
  }

  return (
    <DRWindow
      title="Dev Radio"
      titleRight={
        hasAccounts ? (
          <DRButton
            variant="ghost"
            size="sm"
            onClick={() => onRouteChange("settings")}
          >
            Settings
          </DRButton>
        ) : null
      }
    >
      <div className="flex min-h-0 flex-1 flex-col px-10 pt-10 pb-6">
        {step.name === "welcome" ? (
          <WelcomeStep
            onPick={(picks) => {
              const [first, ...rest] = picks
              setStep({ name: "connect", platform: first, remaining: rest })
            }}
          />
        ) : null}
        {step.name === "connect" ? (
          <ConnectStep
            platform={step.platform}
            onConnected={(p) => void handleConnected(p)}
            onSkip={handleSkip}
          />
        ) : null}
        {step.name === "success" ? (
          <SuccessStep
            connected={connected}
            onDone={() => void handleFinish()}
          />
        ) : null}
      </div>
      <StepDots current={step.name} />
    </DRWindow>
  )
}

type WelcomeStepProps = {
  onPick: (picks: Platform[]) => void
}

function WelcomeStep({ onPick }: WelcomeStepProps) {
  const [picks, setPicks] = useState<Platform[]>([])

  function toggle(p: Platform) {
    setPicks((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    )
  }

  const canContinue = picks.length > 0

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[24px] font-semibold tracking-tight text-foreground">
          Welcome to Dev Radio
        </h1>
        <p className="text-[14px] text-muted-foreground">
          Let's get you connected.
        </p>
      </div>
      <div className="grid w-full max-w-[440px] grid-cols-2 gap-3">
        {(["vercel", "railway"] as const).map((p) => {
          const active = picks.includes(p)
          return (
            <button
              key={p}
              type="button"
              onClick={() => toggle(p)}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-[10px] border px-4 py-6 transition-colors",
                active
                  ? "border-foreground bg-surface-2"
                  : "border-border hover:bg-hover",
              )}
            >
              <ProviderMark platform={p} size={28} />
              <span className="text-[13px] font-medium text-foreground">
                {PLATFORM_LABEL[p]}
              </span>
            </button>
          )
        })}
      </div>
      <DRButton
        variant="primary"
        size="md"
        disabled={!canContinue}
        onClick={() => canContinue && onPick(picks)}
      >
        Continue
      </DRButton>
    </div>
  )
}

type ConnectStepProps = {
  platform: Platform
  onConnected: (profile: AccountProfile) => void
  onSkip: () => void
}

function ConnectStep({ platform, onConnected, onSkip }: ConnectStepProps) {
  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[20px] font-semibold tracking-tight text-foreground">
          Connect {PLATFORM_LABEL[platform]}
        </h1>
        <p className="text-[13px] text-muted-foreground">
          {platform === "vercel"
            ? "Approve Dev Radio in your browser or paste a personal access token."
            : "Paste a Railway API token. It's stored only in your system keychain."}
        </p>
      </div>
      <AddAccountForm platform={platform} onConnected={onConnected} />
      <button
        type="button"
        onClick={onSkip}
        className="self-start text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Skip for now
      </button>
    </div>
  )
}

type SuccessStepProps = {
  connected: AccountProfile[]
  onDone: () => void
}

function SuccessStep({ connected, onDone }: SuccessStepProps) {
  const accounts = useMemo(
    () =>
      connected.length > 0
        ? connected
        : ([] as AccountProfile[]),
    [connected],
  )

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <StatusGlyph status="ready" size={40} />
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[22px] font-semibold tracking-tight text-foreground">
          You're all set.
        </h1>
        <p className="text-[13px] text-muted-foreground">
          Dev Radio lives in your menubar. Open it anytime with{" "}
          <Kbd>⌥⌘D</Kbd>.
        </p>
      </div>
      {accounts.length > 0 ? (
        <ul className="flex w-full max-w-[320px] flex-col gap-2 rounded-[8px] border border-border bg-surface-2 p-2">
          {accounts.map((acc) => (
            <li
              key={acc.id}
              className="flex items-center gap-2 rounded-[6px] px-2 py-1.5"
            >
              <InitialsAvatar name={acc.display_name} size={18} />
              <span className="flex-1 truncate text-[12.5px] font-medium text-foreground">
                {acc.display_name}
              </span>
              <ProviderMark
                platform={acc.platform}
                size={12}
                className="text-muted-foreground"
              />
            </li>
          ))}
        </ul>
      ) : null}
      <DRButton variant="primary" size="md" onClick={onDone}>
        Open menubar
      </DRButton>
    </div>
  )
}

function StepDots({ current }: { current: Step["name"] }) {
  const ORDER: Step["name"][] = ["welcome", "connect", "success"]
  return (
    <div className="flex shrink-0 items-center justify-center gap-1.5 pb-5">
      {ORDER.map((name) => (
        <span
          key={name}
          className={cn(
            "h-1 w-4 rounded-full transition-colors",
            current === name ? "bg-foreground" : "bg-border",
          )}
        />
      ))}
    </div>
  )
}
