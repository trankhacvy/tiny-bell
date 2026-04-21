import { useEffect, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"

import { ExternalLink, RefreshCw } from "lucide-react"
import { deploymentsApi } from "@/lib/deployments"
import { applyUpdate, checkForUpdate, type UpdateStatus } from "@/lib/updates"
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
  const [status, setStatus] = useState<UpdateStatus>({ kind: "idle" })

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""))
  }, [])

  async function handleCheck() {
    setStatus({ kind: "checking" })
    try {
      const result = await checkForUpdate()
      if (result.kind === "up-to-date") {
        setStatus({ kind: "up-to-date" })
        return
      }
      setStatus({
        kind: "available",
        version: result.update.version,
        notes: result.update.body ?? null,
      })
      setStatus({ kind: "downloading", percent: null })
      await applyUpdate(result.update, (downloaded, total) => {
        const percent = total ? Math.round((downloaded / total) * 100) : null
        setStatus({ kind: "downloading", percent })
      })
      setStatus({ kind: "installing" })
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

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
        <UpdateRow status={status} onCheck={() => void handleCheck()} />
        {LINKS.map(({ label, url }) => (
          <button
            key={label}
            type="button"
            onClick={() => void deploymentsApi.openExternal(url)}
            className="flex w-full items-center justify-between border-t border-border-subtle px-[14px] py-[10px] text-[12.5px] text-foreground hover:bg-hover"
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

type UpdateRowProps = {
  status: UpdateStatus
  onCheck: () => void
}

function UpdateRow({ status, onCheck }: UpdateRowProps) {
  const busy =
    status.kind === "checking" ||
    status.kind === "downloading" ||
    status.kind === "installing"
  const { label, detail } = describe(status)

  return (
    <button
      type="button"
      onClick={onCheck}
      disabled={busy}
      className={cn(
        "flex w-full items-center justify-between px-[14px] py-[10px] text-[12.5px] text-foreground",
        busy ? "cursor-not-allowed opacity-70" : "hover:bg-hover",
      )}
    >
      <span className="flex flex-col text-left">
        <span>{label}</span>
        {detail ? (
          <span className="text-[11px] text-faint">{detail}</span>
        ) : null}
      </span>
      <RefreshCw
        size={12}
        className={cn("text-faint", busy ? "animate-spin" : null)}
      />
    </button>
  )
}

function describe(status: UpdateStatus): { label: string; detail: string | null } {
  switch (status.kind) {
    case "idle":
      return { label: "Check for updates", detail: null }
    case "checking":
      return { label: "Checking for updates…", detail: null }
    case "up-to-date":
      return { label: "You're up to date", detail: null }
    case "available":
      return {
        label: `Update available — v${status.version}`,
        detail: "Downloading…",
      }
    case "downloading":
      return {
        label: "Downloading update…",
        detail: status.percent !== null ? `${status.percent}%` : null,
      }
    case "installing":
      return { label: "Installing — restarting shortly", detail: null }
    case "error":
      return { label: "Update failed", detail: status.message }
  }
}
