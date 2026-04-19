import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

import { cn } from "@/lib/utils"
import { Kbd } from "@/components/dr/kbd"
import { DRButton } from "@/components/dr/button"
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
    try {
      const next = await prefsApi.set(key, value)
      setPrefs(next)
    } catch {
      /* swallow */
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Theme"
        hint="Match your system, or pin a mode."
      >
        <Segmented
          options={THEME_OPTIONS}
          value={prefs.theme}
          onChange={(v) => void update("theme", v)}
        />
      </Section>

      <Section
        title="Refresh interval"
        hint="How often Dev Radio polls your providers."
      >
        <Segmented
          options={INTERVAL_OPTIONS.map((o) => ({
            label: o.label,
            value: o.ms,
          }))}
          value={prefs.refresh_interval_ms}
          onChange={(v) => void update("refresh_interval_ms", v)}
        />
      </Section>

      <Section
        title="Start at login"
        hint="Launch Dev Radio when you log in."
      >
        <Switch
          checked={prefs.start_at_login}
          onChange={(v) => void update("start_at_login", v)}
        />
      </Section>

      <Section
        title="Show in Dock"
        hint="Keep the Dev Radio icon in your Dock."
      >
        <Switch
          checked={prefs.show_in_dock}
          onChange={(v) => void update("show_in_dock", v)}
        />
      </Section>

      <Section
        title="Global shortcut"
        hint="Toggle the menubar popover from anywhere."
      >
        <ShortcutRecorder
          accelerator={prefs.global_shortcut}
          onChange={(v) => void update("global_shortcut", v)}
        />
      </Section>
    </div>
  )
}

type SectionProps = {
  title: string
  hint?: string
  children: React.ReactNode
}

function Section({ title, hint, children }: SectionProps) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border-subtle pb-4 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-medium text-foreground">
          {title}
        </span>
        {hint ? (
          <span className="text-[11.5px] text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
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
  onChange: (next: string) => void
}

const RESERVED = new Set([
  "Command+Q",
  "Command+W",
  "Command+,",
  "Command+Tab",
])

function ShortcutRecorder({ accelerator, onChange }: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const parts = accelerator
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean)

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

    setError(null)
    setRecording(false)
    onChange(next)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        ref={buttonRef}
        type="button"
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
        )}
      >
        {recording ? (
          <span className="text-[11px] text-muted-foreground">
            Press a combo…
          </span>
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
