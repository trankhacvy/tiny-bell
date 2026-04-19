import { useState } from "react"

import { DRWindow } from "@/components/dr/window"
import { DRButton } from "@/components/dr/button"
import { DRBadge } from "@/components/dr/badge"
import { Kbd } from "@/components/dr/kbd"
import { Icon } from "@/components/dr/icon"
import { ProviderMark } from "@/components/dr/provider-mark"
import { AddAccountForm } from "@/components/account/add-account-form"
import { cn } from "@/lib/utils"
import {
  PLATFORM_LABEL,
  type AccountProfile,
  type Platform,
} from "@/lib/accounts"
import { deploymentsApi, windowApi, type Project } from "@/lib/deployments"
import { formatRelative } from "@/lib/format"
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
  const [fetchedProjects, setFetchedProjects] = useState<Project[]>([])

  async function handleConnected(profile: AccountProfile) {
    await onConnected(profile)
    const next = [...connected, profile]
    setConnected(next)

    try {
      const dash = await deploymentsApi.getDashboard()
      setFetchedProjects(dash.projects)
    } catch {
      /* swallow */
    }

    if (step.name === "connect" && step.remaining.length > 0) {
      const [first, ...rest] = step.remaining
      setStep({ name: "connect", platform: first, remaining: rest })
    } else {
      setStep({ name: "success" })
    }
  }

  function handleBack() {
    setStep({ name: "welcome" })
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
      {step.name === "welcome" ? (
        <WelcomeStep
          onPick={(picks) => {
            const [first, ...rest] = picks
            setStep({ name: "connect", platform: first, remaining: rest })
          }}
          onSkip={() => void handleFinish()}
        />
      ) : null}
      {step.name === "connect" ? (
        <ConnectStep
          platform={step.platform}
          onConnected={(p) => void handleConnected(p)}
          onBack={handleBack}
          onCancel={handleBack}
        />
      ) : null}
      {step.name === "success" ? (
        <SuccessStep
          connected={connected}
          projects={fetchedProjects}
          onDone={() => void handleFinish()}
          onAddAnother={() => setStep({ name: "welcome" })}
        />
      ) : null}
    </DRWindow>
  )
}

const AVAILABLE: { platform: Platform; desc: string }[] = [
  { platform: "vercel", desc: "OAuth or personal access token · Teams supported" },
  { platform: "railway", desc: "Personal access token · Projects & environments" },
]

const COMING_SOON = [
  { label: "Netlify", desc: "On the roadmap" },
  { label: "Render", desc: "On the roadmap" },
  { label: "GitHub Actions", desc: "On the roadmap" },
]

type WelcomeStepProps = {
  onPick: (picks: Platform[]) => void
  onSkip: () => void
}

function WelcomeStep({ onPick, onSkip }: WelcomeStepProps) {
  const [selected, setSelected] = useState<Platform | null>(null)

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-auto px-8 pt-7 pb-4">
        <h1
          className="mb-[6px] font-display text-[22px] font-semibold text-foreground"
          style={{ letterSpacing: -0.4, lineHeight: 1.2 }}
        >
          Let's get you connected.
        </h1>
        <p className="mb-6 max-w-[380px] text-[13px] leading-[1.5] text-muted-foreground">
          Dev Radio watches your deploys so you don't have to. Pick a provider
          to start — you can add more later.
        </p>

        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
          Available now
        </p>
        <div className="mb-6 flex flex-col gap-2">
          {AVAILABLE.map(({ platform, desc }) => {
            const isSelected = selected === platform
            return (
              <button
                key={platform}
                type="button"
                onClick={() => setSelected(platform)}
                className={cn(
                  "flex items-center gap-3 rounded-[8px] border p-[12px_14px] text-left transition-colors",
                  isSelected
                    ? "border-foreground bg-surface-2"
                    : "border-border hover:bg-hover",
                )}
                style={{
                  boxShadow: isSelected ? "inset 0 0 0 0.5px rgba(0,0,0,0.08)" : "none",
                }}
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-border bg-surface-2">
                  <ProviderMark platform={platform} size={18} />
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-semibold text-foreground">
                    {PLATFORM_LABEL[platform]}
                  </span>
                  <span className="block text-[12px] text-faint">{desc}</span>
                </span>
                {isSelected && <Icon name="check" size={14} className="shrink-0 text-foreground" />}
              </button>
            )
          })}
        </div>

        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
          Coming soon
        </p>
        <div className="flex flex-col gap-2">
          {COMING_SOON.map(({ label, desc }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-[8px] border border-border p-[12px_14px] opacity-50"
            >
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-border bg-surface-2 text-[11px] font-semibold text-faint">
                {label[0]}
              </span>
              <span className="flex-1">
                <span className="block text-[13px] font-semibold text-foreground">{label}</span>
                <span className="block text-[12px] text-faint">{desc}</span>
              </span>
              <DRBadge tone="neutral">Soon</DRBadge>
            </div>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-subtle px-8 py-4">
        <span className="text-[12px] text-faint">Step 1 of 3</span>
        <div className="flex gap-2">
          <DRButton variant="ghost" size="sm" onClick={onSkip}>
            Skip for now
          </DRButton>
          <DRButton
            variant="primary"
            size="sm"
            disabled={!selected}
            trailing={<Icon name="chevron-right" size={13} />}
            onClick={() => selected && onPick([selected])}
          >
            Continue with {selected ? PLATFORM_LABEL[selected] : "…"}
          </DRButton>
        </div>
      </div>
    </div>
  )
}

type ConnectStepProps = {
  platform: Platform
  onConnected: (profile: AccountProfile) => void
  onBack: () => void
  onCancel: () => void
}

function ConnectStep({ platform, onConnected, onBack, onCancel }: ConnectStepProps) {
  const heroGradient =
    platform === "vercel"
      ? "linear-gradient(180deg, oklch(0.97 0.003 85) 0%, var(--bg) 100%)"
      : "linear-gradient(180deg, oklch(0.97 0.022 285) 0%, var(--bg) 100%)"

  return (
    <div className="flex flex-1 flex-col">
      <div
        className="shrink-0 border-b border-border-subtle px-8 pb-[22px] pt-7"
        style={{ background: heroGradient }}
      >
        <div className="mb-4 flex items-center gap-[10px]">
          <DRButton
            variant="ghost"
            size="sm"
            className="h-[22px] px-[6px]"
            leading={<Icon name="chevron-right" size={12} className="rotate-180" />}
            onClick={onBack}
          >
            Back
          </DRButton>
          <span className="text-[12px] text-faint">Step 2 of 3</span>
        </div>
        <div className="flex items-center gap-[14px]">
          <span
            className="inline-flex size-[44px] shrink-0 items-center justify-center rounded-[10px] border border-border"
            style={{
              background:
                platform === "vercel" ? "oklch(0.98 0 0)" : "oklch(0.96 0.02 285)",
            }}
          >
            <ProviderMark platform={platform} size={22} />
          </span>
          <div>
            <h1
              className="font-display text-[18px] font-semibold text-foreground"
              style={{ letterSpacing: -0.3 }}
            >
              Connect {PLATFORM_LABEL[platform]}
            </h1>
            <p className="mt-[2px] text-[12px] text-muted-foreground">
              {platform === "vercel"
                ? "Read-only access to your projects and deployments."
                : "Paste a token. OAuth isn't supported by Railway yet."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-5">
        <AddAccountForm platform={platform} onConnected={onConnected} />
        {platform === "railway" && (
          <div className="mt-[18px] rounded-[8px] border border-border bg-surface-2 p-[14px]">
            <p className="mb-2 text-[12px] font-semibold text-foreground">How to get one</p>
            <ol className="list-decimal pl-[18px] text-[12px] leading-[1.7] text-muted-foreground marker:text-faint">
              <li>
                Open{" "}
                <code className="font-mono-tabular text-[11.5px]">
                  railway.app/account/tokens
                </code>
              </li>
              <li>
                Create a token named{" "}
                <strong className="font-medium text-foreground">Dev Radio</strong>
              </li>
              <li>Paste it above. Stored in Keychain.</li>
            </ol>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-8 py-[14px]">
        <DRButton variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </DRButton>
      </div>
    </div>
  )
}

type SuccessStepProps = {
  connected: AccountProfile[]
  projects: Project[]
  onDone: () => void
  onAddAnother: () => void
}

function SuccessStep({ connected, projects, onDone, onAddAnother }: SuccessStepProps) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-auto px-8 pt-10 pb-4">
        <div
          className="mb-[16px] flex size-[52px] items-center justify-center rounded-full"
          style={{
            background: "color-mix(in oklch, var(--green) 18%, transparent)",
            margin: "0 auto 16px",
          }}
        >
          <Icon name="check" size={22} className="text-success" />
        </div>
        <h1
          className="mb-1 text-center font-display text-[20px] font-semibold text-foreground"
          style={{ letterSpacing: -0.3 }}
        >
          You're on the air.
        </h1>
        <p className="mx-auto mb-5 max-w-[360px] text-center text-[13px] text-muted-foreground">
          Found{" "}
          <strong className="font-semibold text-foreground">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </strong>{" "}
          across your accounts. Dev Radio will check them every 30 seconds.
        </p>

        {connected.length > 0 && (
          <div className="mx-auto max-w-[420px] overflow-hidden rounded-[8px] border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-[9px]">
              <ProviderMark
                platform={connected[0].platform}
                size={12}
                className="text-muted-foreground"
              />
              <span className="text-[11.5px] font-semibold text-muted-foreground">
                {connected[0].display_name}
              </span>
              <span className="flex-1" />
              <span className="font-mono-tabular text-[11px] text-faint">
                {projects.length} projects
              </span>
            </div>
            {projects.slice(0, 5).map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-[10px] border-b border-border-subtle px-3 py-[9px] last:border-b-0"
              >
                <span
                  className="size-[7px] shrink-0 rounded-full"
                  style={{
                    background:
                      p.latest_deployment?.state === "error"
                        ? "var(--red)"
                        : p.latest_deployment?.state === "building"
                          ? "var(--amber)"
                          : "var(--green)",
                  }}
                />
                <span className="flex-1 truncate text-[12.5px] font-medium text-foreground">
                  {p.name}
                </span>
                <span className="font-mono-tabular text-[11px] text-faint">
                  {p.latest_deployment
                    ? formatRelative(p.latest_deployment.created_at)
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-border-subtle px-8 py-[14px]">
        <DRButton
          variant="ghost"
          size="sm"
          leading={<Icon name="plus" size={12} />}
          onClick={onAddAnother}
        >
          Add another account
        </DRButton>
        <DRButton
          variant="primary"
          size="sm"
          onClick={onDone}
          trailing={
            <Kbd className="ml-1 border-white/20 bg-white/15 text-inherit">⌃⌥R</Kbd>
          }
        >
          Open menubar
        </DRButton>
      </div>
    </div>
  )
}
