import { useEffect, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"

import { ExternalLink } from "lucide-react"
import { deploymentsApi } from "@/lib/deployments"
import { cn } from "@/lib/utils"

const REPO_URL = "https://github.com/trankhacvy/tiny-bell"

type LinkItem = {
  label: string
  url: string
}

const LINKS: LinkItem[] = [
  { label: "View on GitHub", url: REPO_URL },
  { label: "Documentation", url: `${REPO_URL}#readme` },
  { label: "Release notes", url: `${REPO_URL}/releases` },
  { label: "Report an issue", url: `${REPO_URL}/issues/new` },
]

export function SettingsAbout() {
  const [version, setVersion] = useState<string>("")

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""))
  }, [])

  return (
    <div className="flex flex-col items-center pb-5">
      <img
        src="/app-icon.png"
        alt="Tiny Bell"
        width={64}
        height={64}
        className="mb-[14px] size-[64px] rounded-[14px]"
      />

      <h1
        className="font-display text-[19px] font-semibold text-foreground"
        style={{ letterSpacing: -0.3 }}
      >
        Tiny Bell
      </h1>
      {version && (
        <p className="mt-[3px] font-mono-tabular text-[12px] text-faint">
          v{version}
        </p>
      )}
      <p className="mx-auto mt-[14px] max-w-[360px] text-center text-[12.5px] leading-[1.55] text-muted-foreground">
        A quiet menubar radio for your deploys. Made by one person who deploys
        too often.
      </p>

      <div className="mt-[22px] w-full max-w-[420px] overflow-hidden rounded-[8px] border border-border bg-surface">
        {LINKS.map(({ label, url }, i) => (
          <button
            key={label}
            type="button"
            onClick={() => void deploymentsApi.openExternal(url)}
            className={cn(
              "flex w-full items-center justify-between px-[14px] py-[10px] text-[12.5px] text-foreground hover:bg-hover",
              i < LINKS.length - 1 && "border-b border-border-subtle",
            )}
          >
            {label}
            <ExternalLink size={12} className="text-faint" />
          </button>
        ))}
      </div>

      <p className="mt-8 text-[11px] text-faint">
        © {new Date().getFullYear()} Khac Vy · Open source under MIT
      </p>
    </div>
  )
}
