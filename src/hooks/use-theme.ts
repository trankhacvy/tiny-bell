import { useEffect, useState } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { prefsApi, type ThemePreference } from "@/lib/prefs"

const MEDIA_QUERY = "(prefers-color-scheme: dark)"

function systemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light"
}

function applyResolved(theme: ThemePreference) {
  const resolved = theme === "system" ? systemTheme() : theme
  document.documentElement.dataset.theme = resolved
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemePreference>("system")

  useEffect(() => {
    let cancelled = false
    let unlistenPrefs: UnlistenFn | undefined

    prefsApi
      .get()
      .then((p) => {
        if (cancelled) return
        setThemeState(p.theme)
        applyResolved(p.theme)
      })
      .catch(() => {
        applyResolved("system")
      })

    listen<{ theme?: ThemePreference }>("prefs:changed", (event) => {
      const next = event.payload?.theme
      if (next === "system" || next === "light" || next === "dark") {
        setThemeState(next)
        applyResolved(next)
      }
    }).then((fn) => {
      if (cancelled) fn()
      else unlistenPrefs = fn
    })

    const mql = window.matchMedia(MEDIA_QUERY)
    const onChange = () => {
      setThemeState((current) => {
        if (current === "system") applyResolved("system")
        return current
      })
    }
    mql.addEventListener("change", onChange)

    return () => {
      cancelled = true
      unlistenPrefs?.()
      mql.removeEventListener("change", onChange)
    }
  }, [])

  return {
    theme,
    resolved:
      theme === "system"
        ? (typeof window !== "undefined" && window.matchMedia(MEDIA_QUERY).matches
            ? "dark"
            : "light")
        : theme,
    setTheme: (next: ThemePreference) => {
      setThemeState(next)
      applyResolved(next)
      void prefsApi.set("theme", next)
    },
  }
}
