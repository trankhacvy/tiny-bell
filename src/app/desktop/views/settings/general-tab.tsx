import { type ReactNode, useEffect, useRef, useState, type KeyboardEvent } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

import { cn } from "@/lib/utils"
import { Kbd } from "@/components/dr/kbd"
import { DRButton } from "@/components/dr/button"
import { Icon } from "@/components/dr/icon"
import { devApi, windowApi } from "@/lib/deployments"
import {
  DEFAULT_PREFS,
  prefsApi,
  type Prefs,
  type ThemePreference,
} from "@/lib/prefs"

const INTERVAL_OPTIONS: { label: string; ms: number }[] = [
  { label: "10s", ms: 10_000 },
  { label: "30s", ms: 30_000 },
  { label: "60s", ms: 60_000 },
  { label: "5m", ms: 300_000 },
]

const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
]

export function SettingsGeneral() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)

  useEffect(() => {
    prefsApi
      .get()
      .then(setPrefs)
      .catch(() => {})
    let unlisten: UnlistenFn | undefined
    listen<Prefs>("prefs:changed", (event) => setPrefs(event.payload)).then(
      (fn) => {
        unlisten = fn
      },
    )
    return () => {
      unlisten?.()
    }
  }, [])

  async function update<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    const next = await prefsApi.set(key, value)
    setPrefs(next)
  }

  // Best-effort wrapper for non-critical toggles whose failure doesn't need UI.
  // (Shortcut recorder has its own error handling and uses `update` directly.)
  function updateOrSwallow<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    update(key, value).catch(() => {
      /* swallow — shown only via logs */
    })
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
        Monitoring
      </p>
      <SettingsCard>
        <SettingsRow
          title="Polling interval"
          desc="How often to check each provider. Lower values may hit rate limits."
          control={
            <Segmented
              options={INTERVAL_OPTIONS.map((o) => ({ label: o.label, value: o.ms }))}
              value={prefs.refresh_interval_ms}
              onChange={(v) => void updateOrSwallow("refresh_interval_ms", v)}
            />
          }
        />
        <SettingsRow
          title="Notify on failed deploy"
          desc="Native notification when a deploy goes red."
          control={
            <Switch
              checked={prefs.notify_on_failure}
              onChange={(v) => void updateOrSwallow("notify_on_failure", v)}
            />
          }
        />
        <SettingsRow
          title="Notify on recovery"
          desc="Ping me when red turns back to green."
          control={
            <Switch
              checked={prefs.notify_on_recovery}
              onChange={(v) => void updateOrSwallow("notify_on_recovery", v)}
            />
          }
          last
        />
      </SettingsCard>

      <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
        Application
      </p>
      <SettingsCard>
        <SettingsRow
          title="Launch at login"
          desc="Start Tiny Bell when you log in."
          control={
            <Switch
              checked={prefs.start_at_login}
              onChange={(v) => void updateOrSwallow("start_at_login", v)}
            />
          }
        />
        <SettingsRow
          title="Show dock icon"
          desc="Off by default — Tiny Bell lives in the menubar."
          control={
            <Switch
              checked={prefs.show_in_dock}
              onChange={(v) => void updateOrSwallow("show_in_dock", v)}
            />
          }
        />
        <SettingsRow
          title="Appearance"
          control={
            <Segmented
              options={THEME_OPTIONS}
              value={prefs.theme}
              onChange={(v) => void updateOrSwallow("theme", v)}
            />
          }
          last
        />
      </SettingsCard>

      <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
        Menubar shortcut
      </p>
      <SettingsCard>
        <SettingsRow
          title="Open menubar"
          desc="Global hotkey to show the deploy list from anywhere."
          control={
            <ShortcutRecorder
              accelerator={prefs.global_shortcut}
              onChange={(v) => update("global_shortcut", v)}
            />
          }
          last
        />
      </SettingsCard>

      <div className="flex justify-end">
        <DRButton
          variant="ghost"
          size="sm"
          leading={<Icon name="warning" size={12} className="text-danger" />}
          className="text-danger hover:text-danger"
          onClick={() => void windowApi.quit()}
        >
          Quit Tiny Bell
        </DRButton>
      </div>

      {import.meta.env.DEV && <DevResetSection />}
    </div>
  )
}

function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-border bg-surface">
      {children}
    </div>
  )
}

type SettingsRowProps = {
  title: string
  desc?: string
  control: ReactNode
  last?: boolean
}

function SettingsRow({ title, desc, control, last }: SettingsRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 px-[14px] py-[12px]",
        !last && "border-b border-border-subtle",
      )}
    >
      <div className="flex-1">
        <p className="text-[12.5px] font-medium text-foreground">{title}</p>
        {desc && (
          <p className="mt-0.5 text-[11.5px] leading-[1.4] text-faint">{desc}</p>
        )}
      </div>
      {control}
    </div>
  )
}

type SegmentedProps<T extends string | number> = {
  options: { label: string; value: T }[]
  value: T
  onChange: (value: T) => void
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="inline-flex gap-0.5 rounded-[6px] border border-border bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[4px] px-2.5 py-1 text-[11.5px] font-medium transition-colors",
              active
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

type SwitchProps = {
  checked: boolean
  onChange: (next: boolean) => void
}

function Switch({ checked, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[18px] w-[30px] items-center rounded-full transition-colors outline-none",
        checked ? "bg-foreground" : "bg-border",
      )}
    >
      <span
        className={cn(
          "inline-block size-3.5 translate-x-0.5 rounded-full bg-surface shadow-sm transition-transform",
          checked && "translate-x-[13px]",
        )}
      />
    </button>
  )
}

type ShortcutRecorderProps = {
  accelerator: string
  onChange: (next: string) => Promise<void>
}

const RESERVED = new Set([
  "Command+Q",
  "Command+W",
  "Command+,",
  "Command+Tab",
])

function friendlyShortcutError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? "")
  const lower = msg.toLowerCase()
  if (lower.includes("hotkey") || lower.includes("registered")) {
    return "That combo is already taken by another app."
  }
  if (lower.includes("invalid shortcut")) {
    return "That key combination isn't supported."
  }
  return msg || "Could not register that shortcut."
}

function ShortcutRecorder({ accelerator, onChange }: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const parts = accelerator
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean)

  async function commit(next: string) {
    setSaving(true)
    try {
      await onChange(next)
      setError(null)
      setRecording(false)
    } catch (e) {
      // The Rust side rolls the pref back to the previous value, so the
      // parent's `accelerator` prop stays on the old combo.
      setError(friendlyShortcutError(e))
      setRecording(false)
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!recording) return
    event.preventDefault()
    event.stopPropagation()

    if (event.key === "Escape") {
      setRecording(false)
      setError(null)
      return
    }

    const key = normalizeKey(event.key)
    if (!key) return

    const modifiers: string[] = []
    if (event.metaKey) modifiers.push("Command")
    if (event.ctrlKey) modifiers.push("Control")
    if (event.altKey) modifiers.push("Alt")
    if (event.shiftKey) modifiers.push("Shift")

    if (modifiers.length === 0 && !/^F\d{1,2}$/.test(key)) {
      setError("Use at least one modifier (⌘/⌥/⌃/⇧).")
      return
    }

    const next = [...modifiers, key].join("+")
    if (RESERVED.has(next)) {
      setError(`${next} is reserved.`)
      return
    }

    void commit(next)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        ref={buttonRef}
        type="button"
        disabled={saving}
        onClick={() => {
          setRecording(true)
          setError(null)
          setTimeout(() => buttonRef.current?.focus(), 0)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setRecording(false)}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-[6px] border px-2 outline-none transition-colors",
          recording
            ? "border-foreground/60 bg-surface-2"
            : "border-border bg-surface hover:bg-hover",
          saving && "opacity-60",
        )}
      >
        {recording ? (
          <span className="text-[11px] text-muted-foreground">
            Press a combo…
          </span>
        ) : saving ? (
          <span className="text-[11px] text-muted-foreground">Saving…</span>
        ) : (
          parts.map((p, i) => <Kbd key={`${p}-${i}`}>{prettyKey(p)}</Kbd>)
        )}
      </button>
      {error ? (
        <span className="text-[10.5px] text-danger">{error}</span>
      ) : recording ? (
        <DRButton
          variant="ghost"
          size="sm"
          onClick={() => setRecording(false)}
          className="h-6 px-1.5 text-[10.5px]"
        >
          Cancel
        </DRButton>
      ) : null}
    </div>
  )
}

function normalizeKey(raw: string): string | null {
  if (raw.length === 0) return null
  switch (raw) {
    case "Meta":
    case "Control":
    case "Alt":
    case "Shift":
    case "Dead":
      return null
    case " ":
      return "Space"
    case "ArrowUp":
      return "Up"
    case "ArrowDown":
      return "Down"
    case "ArrowLeft":
      return "Left"
    case "ArrowRight":
      return "Right"
  }
  if (raw.length === 1) return raw.toUpperCase()
  if (/^F\d{1,2}$/.test(raw)) return raw
  return raw
}

function DevResetSection() {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!confirm) return
    const t = setTimeout(() => setConfirm(false), 4000)
    return () => clearTimeout(t)
  }, [confirm])

  async function handleClick() {
    if (!confirm) {
      setConfirm(true)
      return
    }
    setConfirm(false)
    setBusy(true)
    try {
      await devApi.reset()
      setDone(true)
      setTimeout(() => void windowApi.quit(), 800)
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[8px] border border-dashed border-danger/40 bg-danger/5 p-[14px]">
      <div className="mb-[10px] flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-danger/80">
          Dev tools
        </span>
        <span className="rounded-[3px] border border-danger/30 bg-danger/10 px-1.5 py-0 text-[9.5px] font-semibold uppercase tracking-[0.5px] text-danger">
          dev only
        </span>
      </div>
      <p className="mb-[12px] text-[12px] leading-[1.5] text-muted-foreground">
        Wipes all stored accounts, tokens (including OS keychain), and preferences.
        The app will quit so you can test a fresh onboarding flow.
      </p>
      {confirm && (
        <p className="mb-[10px] text-[11.5px] font-medium text-danger">
          Click again to confirm — this cannot be undone.
        </p>
      )}
      <DRButton
        variant="secondary"
        size="sm"
        leading={<Icon name="warning" size={12} className="text-danger" />}
        className="border-danger/30 text-danger hover:bg-danger/10 hover:text-danger"
        disabled={busy || done}
        onClick={() => void handleClick()}
      >
        {done ? "Done — quitting…" : busy ? "Resetting…" : confirm ? "Confirm reset" : "Reset all data"}
      </DRButton>
    </div>
  )
}

function prettyKey(name: string): string {
  switch (name.toLowerCase()) {
    case "command":
    case "cmd":
    case "meta":
    case "super":
      return "⌘"
    case "alt":
    case "option":
      return "⌥"
    case "shift":
      return "⇧"
    case "control":
    case "ctrl":
      return "⌃"
    default:
      return name.toUpperCase()
  }
}
