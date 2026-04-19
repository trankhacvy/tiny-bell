import { StrictMode, type ComponentType } from "react"
import { createRoot } from "react-dom/client"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { isTauri } from "@/lib/tauri"

import "./index.css"
import { ThemeProvider } from "@/components/theme-provider"
import { ExternalLinkGuard } from "@/components/external-link-guard"
import { DebugPanel } from "@/components/debug-panel"
import { Toaster } from "@/components/ui/sonner"

async function loadRoot(): Promise<ComponentType> {
  if (import.meta.env.DEV && !isTauri()) {
    const mod = await import("@/app/dev/sandbox")
    return mod.DevSandbox
  }
  try {
    const label = getCurrentWindow().label
    if (label === "popover") {
      const mod = await import("@/app/popover/popover-app")
      return mod.PopoverApp
    }
    const mod = await import("@/app/desktop/desktop-app")
    return mod.DesktopApp
  } catch {
    const mod = await import("@/app/desktop/desktop-app")
    return mod.DesktopApp
  }
}

async function bootstrap() {
  const Root = await loadRoot()
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider>
        <ExternalLinkGuard />
        {import.meta.env.DEV ? <DebugPanel /> : null}
        <main data-ui-scroll-container>
          <Root />
        </main>
        <Toaster />
      </ThemeProvider>
    </StrictMode>,
  )
}

void bootstrap()
