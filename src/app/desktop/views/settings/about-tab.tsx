import { useEffect, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"

import { DRBadge } from "@/components/dr/badge"
import { Icon } from "@/components/dr/icon"
import { deploymentsApi } from "@/lib/deployments"
import { cn } from "@/lib/utils"

export function SettingsAbout() {
  const [version, setVersion] = useState<string>("")

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""))
  }, [])

  function open(label: string) {
    const urls: Record<string, string> = {
      Documentation: "https://github.com/anthropics",
      "Release notes": "https://github.com/anthropics",
      "Privacy statement": "https://github.com/anthropics",
      "Send feedback": "https://github.com/anthropics",
    }
    const url = urls[label]
    if (url) void deploymentsApi.openExternal(url)
  }

  const linkItems = [
    "Documentation",
    "Release notes",
    "Privacy statement",
    "Send feedback",
  ]

  return (
    <div className="flex flex-col items-center pb-5">
      <div className="mb-[14px] flex size-[64px] items-center justify-center rounded-[14px] border border-border bg-surface-2">
        <svg
          width="34"
          height="34"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          className="text-foreground"
        >
          <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
          <path d="M5 5 Q3 8 5 11" />
          <path d="M11 5 Q13 8 11 11" />
          <path d="M2.5 3 Q-0.5 8 2.5 13" opacity="0.5" />
          <path d="M13.5 3 Q16.5 8 13.5 13" opacity="0.5" />
        </svg>
      </div>

      <h1
        className="font-display text-[19px] font-semibold text-foreground"
        style={{ letterSpacing: -0.3 }}
      >
        Tiny Bell
      </h1>
      {version && (
        <p className="mt-[3px] font-mono-tabular text-[12px] text-faint">
          {version} · Apple Silicon
        </p>
      )}
      <p className="mx-auto mt-[14px] max-w-[360px] text-center text-[12.5px] leading-[1.55] text-muted-foreground">
        A quiet menubar radio for your deploys. Made by one person who deploys
        too often.
      </p>

      <div className="mt-[22px] w-full max-w-[420px] overflow-hidden rounded-[8px] border border-border bg-surface">
        {linkItems.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => open(label)}
            className={cn(
              "flex w-full items-center justify-between px-[14px] py-[10px] text-[12.5px] text-foreground hover:bg-hover",
              i < linkItems.length - 1 && "border-b border-border-subtle",
            )}
          >
            {label}
            <Icon name="external" size={12} className="text-faint" />
          </button>
        ))}
        <div className="flex items-center justify-between border-t border-border-subtle px-[14px] py-[10px]">
          <span className="text-[12.5px] text-foreground">Check for updates</span>
          <DRBadge tone="success">
            <span
              className="size-[6px] shrink-0 rounded-full"
              style={{ background: "var(--green)" }}
            />
            Up to date
          </DRBadge>
        </div>
      </div>

      <p className="mt-8 text-[11px] text-faint">
        © {new Date().getFullYear()} khacvy. All your deploys are belong to you.
      </p>
    </div>
  )
}
