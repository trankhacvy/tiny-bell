import { useEffect, useState } from "react"

const KEY = "dr:popover:scope"

export type Scope = "all" | string

function readScope(): Scope {
  try {
    const value = sessionStorage.getItem(KEY)
    return value ? (value as Scope) : "all"
  } catch {
    return "all"
  }
}

export function useScope(): [Scope, (next: Scope) => void] {
  const [scope, setScopeState] = useState<Scope>(readScope)

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, scope)
    } catch {
      /* ignore */
    }
  }, [scope])

  return [scope, setScopeState]
}
