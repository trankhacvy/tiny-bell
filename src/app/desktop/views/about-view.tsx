import { useEffect, useState } from "react"
import { BookOpen, ExternalLink, Radio } from "lucide-react"
import { getVersion } from "@tauri-apps/api/app"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { deploymentsApi } from "@/lib/deployments"
import { Topbar } from "../components/topbar"
import type { DesktopRoute } from "../desktop-app"

type Props = {
  hasAccounts: boolean
  onRouteChange: (route: DesktopRoute) => void
}

export function AboutView({ hasAccounts, onRouteChange }: Props) {
  const [version, setVersion] = useState<string>("")

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion(""))
  }, [])

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Topbar
        route="about"
        hasAccounts={hasAccounts}
        onRouteChange={onRouteChange}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl space-y-6 px-6 py-8">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
              <Radio className="size-6 text-primary" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-semibold tracking-tight">
                Dev Radio
              </h1>
              <p className="text-sm text-muted-foreground">
                Tune in to your deploys. {version && `· v${version}`}
              </p>
            </div>
          </div>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-medium">Resources</h2>
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() =>
                  void deploymentsApi.openExternal(
                    "https://github.com/anthropics",
                  )
                }
              >
                <span className="inline-flex items-center gap-2">
                  <BookOpen className="size-4" />
                  Documentation
                </span>
                <ExternalLink className="size-3.5 text-muted-foreground" />
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-medium">Privacy</h2>
            <p className="text-sm text-muted-foreground">
              Dev Radio stores all tokens in your operating system's keychain.
              Nothing is sent to Anthropic or any third party other than Vercel
              and Railway's own APIs, and only to fetch your deployments.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
