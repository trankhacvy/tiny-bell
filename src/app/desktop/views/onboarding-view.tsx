import { useEffect, useState } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

import { DRWindow } from "@/components/dr/window"
import { DRButton } from "@/components/dr/button"
import { DRBadge } from "@/components/dr/badge"
import { Kbd } from "@/components/dr/kbd"
import { Icon } from "@/components/dr/icon"
import { ProviderMark } from "@/components/dr/provider-mark"
import { BrandMark } from "@/components/dr/brand-mark"
import { siNetlify, siRender, type SimpleIcon } from "simple-icons"
import { AddAccountForm } from "@/components/account/add-account-form"
import { RepoSelector } from "@/components/account/repo-selector"
import { cn } from "@/lib/utils"
import {
  PLATFORM_LABEL,
  type AccountProfile,
  type Platform,
} from "@/lib/accounts"
import {
  deploymentsApi,
  windowApi,
  type DashboardState,
  type Project,
} from "@/lib/deployments"
import { formatRelative } from "@/lib/format"
import type { DesktopRoute } from "../desktop-app"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Image } from "@tauri-apps/api/image"

type Step =
  | { name: "welcome" }
  | { name: "connect"; platform: Platform; remaining: Platform[] }
  | {
      name: "pickRepos"
      accountId: string
      displayName: string
      remaining: Platform[]
    }
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
  const [hasScanned, setHasScanned] = useState(false)

  // The first poll after OAuth is async; without this listener the Success
  // step freezes on whatever `get_dashboard` returned right after connect
  // (usually an empty snapshot) and never updates.
  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    listen<DashboardState>("dashboard:update", (event) => {
      setFetchedProjects(event.payload.projects)
      setHasScanned(true)
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [])

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

    const remaining = step.name === "connect" ? step.remaining : []

    // GitHub is the only platform where the adapter can't list anything
    // until the user picks which repos to monitor. Insert a repo-picker
    // step so the Success summary isn't a lie ("0 projects").
    if (profile.platform === "github") {
      setStep({
        name: "pickRepos",
        accountId: profile.id,
        displayName: profile.display_name,
        remaining,
      })
      return
    }

    proceedAfter(remaining)
  }

  function proceedAfter(remaining: Platform[]) {
    if (remaining.length > 0) {
      const [first, ...rest] = remaining
      setStep({ name: "connect", platform: first, remaining: rest })
    } else {
      // Reset the scanning flag so Success shows the "Scanning…" copy
      // until the *next* dashboard:update arrives. Without this, a stale
      // update from earlier in onboarding (when GitHub had 0 monitored
      // repos) leaves the Success step briefly showing "Found 0 projects".
      setHasScanned(false)
      setFetchedProjects([])
      setStep({ name: "success" })
    }
  }

  function handleReposSaved() {
    if (step.name !== "pickRepos") return
    proceedAfter(step.remaining)
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
      title="Tiny Bell"
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
      {step.name === "pickRepos" ? (
        <PickReposStep
          accountId={step.accountId}
          displayName={step.displayName}
          onSaved={handleReposSaved}
        />
      ) : null}
      {step.name === "success" ? (
        <SuccessStep
          connected={connected}
          projects={fetchedProjects}
          scanning={!hasScanned}
          onDone={() => void handleFinish()}
          onAddAnother={() => setStep({ name: "welcome" })}
        />
      ) : null}
    </DRWindow>
  )
}

const AVAILABLE: { platform: Platform; desc: string }[] = [
  {
    platform: "vercel",
    desc: "OAuth or personal access token \u00b7 Teams supported",
  },
  {
    platform: "railway",
    desc: "Personal access token \u00b7 Projects & environments",
  },
  {
    platform: "github",
    desc: "OAuth or personal access token \u00b7 Actions monitoring",
  },
]

const COMING_SOON: { label: string; desc: string; icon: SimpleIcon }[] = [
  { label: "Netlify", desc: "On the roadmap", icon: siNetlify },
  { label: "Render", desc: "On the roadmap", icon: siRender },
]

// How many rows the Success step shows before collapsing the rest into a
// single "+N more" summary. Tuned so the card doesn't force the 680px
// window into vertical scroll at common team sizes.
const PREVIEW_LIMIT = 8

type WelcomeStepProps = {
  onPick: (picks: Platform[]) => void
}

function WelcomeStep({ onPick }: WelcomeStepProps) {
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
          Tiny Bell watches your deploys so you don't have to. Pick a provider
          to start — you can add more later.
        </p>

        <p className="mb-1 text-[11px] font-semibold tracking-[0.5px] text-faint uppercase">
          Available now
        </p>
        <div className="mb-6 flex flex-col gap-2">
          {AVAILABLE.map(({ platform, desc }) => {
            const isSelected = selected === platform
            return (
              <>
                <button
                  key={platform}
                  type="button"
                  onClick={() => setSelected(platform)}
                  className={cn(
                    "flex items-center gap-3 rounded-[8px] border p-[12px_14px] text-left transition-colors",
                    isSelected
                      ? "border-foreground bg-surface-2"
                      : "border-border hover:bg-hover"
                  )}
                  style={{
                    boxShadow: isSelected
                      ? "inset 0 0 0 0.5px rgba(0,0,0,0.08)"
                      : "none",
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
                  {isSelected && (
                    <Icon
                      name="check"
                      size={14}
                      className="shrink-0 text-foreground"
                    />
                  )}
                </button>
              </>
            )
          })}
        </div>

        {COMING_SOON.length > 0 && (
          <>
            <p className="mb-1 text-[11px] font-semibold tracking-[0.5px] text-faint uppercase">
              Coming soon
            </p>
            <div className="flex flex-col gap-2">
              {COMING_SOON.map(({ label, desc, icon }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-[8px] border border-border p-[12px_14px] opacity-50"
                >
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-border bg-surface-2 text-faint">
                    <BrandMark icon={icon} size={18} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-[13px] font-semibold text-foreground">
                      {label}
                    </span>
                    <span className="block text-[12px] text-faint">{desc}</span>
                  </span>
                  <DRBadge tone="neutral">Soon</DRBadge>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-subtle px-8 py-4">
        <span className="text-[12px] text-faint">Step 1 of 3</span>
        <DRButton
          variant="primary"
          size="sm"
          disabled={!selected}
          trailing={<Icon name="chevron-right" size={13} />}
          onClick={() => selected && onPick([selected])}
        >
          Continue with {selected ? PLATFORM_LABEL[selected] : "\u2026"}
        </DRButton>
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

function ConnectStep({
  platform,
  onConnected,
  onBack,
  onCancel,
}: ConnectStepProps) {
  const heroGradient =
    platform === "vercel"
      ? "linear-gradient(180deg, oklch(0.97 0.003 85) 0%, var(--bg) 100%)"
      : platform === "github"
        ? "linear-gradient(180deg, oklch(0.97 0.003 260) 0%, var(--bg) 100%)"
        : "linear-gradient(180deg, oklch(0.97 0.022 285) 0%, var(--bg) 100%)"

  return (
    <div className="flex flex-1 flex-col">
      <div
        className="shrink-0 border-b border-border-subtle px-8 pt-7 pb-[22px]"
        style={{ background: heroGradient }}
      >
        <div className="mb-4 flex items-center gap-[10px]">
          <DRButton
            variant="ghost"
            size="sm"
            className="h-[22px] px-[6px]"
            leading={
              <Icon name="chevron-right" size={12} className="rotate-180" />
            }
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
                platform === "vercel"
                  ? "oklch(0.98 0 0)"
                  : platform === "github"
                    ? "oklch(0.98 0.003 260)"
                    : "oklch(0.96 0.02 285)",
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
                : platform === "github"
                  ? "Read-only access to your repositories and workflow runs."
                  : "Paste a token. OAuth isn't supported by Railway yet."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-5">
        <AddAccountForm platform={platform} onConnected={onConnected} />
        {platform === "railway" && (
          <div className="mt-[18px] rounded-[8px] border border-border bg-surface-2 p-[14px]">
            <p className="mb-2 text-[12px] font-semibold text-foreground">
              How to get one
            </p>
            <ol className="list-decimal pl-[18px] text-[12px] leading-[1.7] text-muted-foreground marker:text-faint">
              <li>
                Open{" "}
                <code className="font-mono-tabular text-[11.5px]">
                  railway.app/account/tokens
                </code>
              </li>
              <li>
                Create a token named{" "}
                <strong className="font-medium text-foreground">
                  Tiny Bell
                </strong>
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

type PickReposStepProps = {
  accountId: string
  displayName: string
  onSaved: () => void
}

function PickReposStep({ accountId, displayName, onSaved }: PickReposStepProps) {
  const heroGradient =
    "linear-gradient(180deg, oklch(0.97 0.003 260) 0%, var(--bg) 100%)"

  return (
    <div className="flex flex-1 flex-col">
      <div
        className="shrink-0 border-b border-border-subtle px-8 pt-7 pb-[22px]"
        style={{ background: heroGradient }}
      >
        <div className="mb-4 flex items-center gap-[10px]">
          <span className="text-[12px] text-faint">Almost there</span>
        </div>
        <div className="flex items-center gap-[14px]">
          <span
            className="inline-flex size-[44px] shrink-0 items-center justify-center rounded-[10px] border border-border"
            style={{ background: "oklch(0.98 0.003 260)" }}
          >
            <ProviderMark platform="github" size={22} />
          </span>
          <div>
            <h1
              className="font-display text-[18px] font-semibold text-foreground"
              style={{ letterSpacing: -0.3 }}
            >
              Pick repositories to watch
            </h1>
            <p className="mt-[2px] text-[12px] text-muted-foreground">
              Signed in as{" "}
              <strong className="font-medium text-foreground">
                {displayName}
              </strong>
              . Tiny Bell will tail GitHub Actions for the repos you select (up
              to 30).
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-5">
        <RepoSelector accountId={accountId} onSave={() => onSaved()} />
      </div>
    </div>
  )
}

type SuccessStepProps = {
  connected: AccountProfile[]
  projects: Project[]
  scanning: boolean
  onDone: () => void
  onAddAnother: () => void
}

function SuccessStep({
  connected,
  projects,
  scanning,
  onDone,
  onAddAnother,
}: SuccessStepProps) {
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
          {scanning ? (
            <>
              Scanning your accounts for projects&hellip; Tiny Bell will keep
              an eye on them every 30 seconds.
            </>
          ) : (
            <>
              Found{" "}
              <strong className="font-semibold text-foreground">
                {projects.length} project{projects.length !== 1 ? "s" : ""}
              </strong>{" "}
              across your accounts. Tiny Bell will check them every 30 seconds.
            </>
          )}
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
                {scanning ? "scanning…" : `${projects.length} projects`}
              </span>
            </div>
            {projects.slice(0, PREVIEW_LIMIT).map((p) => (
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
                    : "\u2014"}
                </span>
              </div>
            ))}
            {projects.length > PREVIEW_LIMIT && (
              <div className="flex items-center gap-[10px] border-t border-border-subtle bg-surface-2 px-3 py-[9px]">
                <span className="size-[7px] shrink-0 rounded-full bg-border" />
                <span className="flex-1 text-[12px] text-muted-foreground">
                  +{projects.length - PREVIEW_LIMIT} more project
                  {projects.length - PREVIEW_LIMIT !== 1 ? "s" : ""} — open the
                  menubar to see everything.
                </span>
              </div>
            )}
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
            <Kbd className="ml-1 border-white/20 bg-white/15 text-inherit">
              {"\u2303\u2325R"}
            </Kbd>
          }
        >
          Open menubar
        </DRButton>
      </div>
    </div>
  )
}
