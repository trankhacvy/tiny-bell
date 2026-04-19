import { useEffect, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"

import { DRButton } from "@/components/dr/button"
import { Icon } from "@/components/dr/icon"
import { deploymentsApi } from "@/lib/deployments"

export function SettingsAbout() {
  const [version, setVersion] = useState<string>("")

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""))
  }, [])

  function open(url: string) {
    void deploymentsApi.openExternal(url)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-[20px] font-semibold tracking-tight text-foreground">
          Dev Radio
        </h2>
        <p className="text-[12.5px] text-muted-foreground">
          Tune in to your deploys.
          {version ? ` Version ${version}.` : ""}
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h3 className="text-[11.5px] font-medium uppercase tracking-wide text-faint">
          Resources
        </h3>
        <LinkRow
          label="Documentation"
          onClick={() => open("https://github.com/anthropics")}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[11.5px] font-medium uppercase tracking-wide text-faint">
          Privacy
        </h3>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          Dev Radio stores all tokens in your operating system's keychain.
          Nothing is sent anywhere other than Vercel and Railway's own APIs,
          and only to fetch your deployments.
        </p>
      </section>
    </div>
  )
}

type LinkRowProps = {
  label: string
  onClick: () => void
}

function LinkRow({ label, onClick }: LinkRowProps) {
  return (
    <DRButton
      variant="secondary"
      size="md"
      fullWidth
      trailing={<Icon name="external" size={12} className="text-muted-foreground" />}
      onClick={onClick}
      className="justify-between"
    >
      {label}
    </DRButton>
  )
}
