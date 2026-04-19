import type { ReactNode } from "react"
import { useTheme } from "@/hooks/use-theme"

type ThemeProviderProps = {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  useTheme()
  return <>{children}</>
}

export { useTheme } from "@/hooks/use-theme"
