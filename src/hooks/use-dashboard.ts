import { useEffect, useState } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

import {
  deploymentsApi,
  emptyDashboard,
  type DashboardState,
} from "@/lib/deployments"

export function useDashboard() {
  const [state, setState] = useState<DashboardState>(emptyDashboard)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    let cancelled = false

    deploymentsApi
      .getDashboard()
      .then((s) => {
        if (!cancelled) {
          setState(s)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    listen<DashboardState>("dashboard:update", (event) => {
      setState(event.payload)
      setLoading(false)
    }).then((fn) => {
      if (cancelled) {
        fn()
      } else {
        unlisten = fn
      }
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  return { state, loading, refresh: () => deploymentsApi.refreshNow() }
}
