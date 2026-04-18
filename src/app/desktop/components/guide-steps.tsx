import type { CSSProperties, ReactNode } from "react"

import type { ProviderTheme } from "@/lib/provider-theme"

export type GuideStep = {
  title: string
  body: ReactNode
}

type Props = {
  steps: GuideStep[]
  theme?: ProviderTheme
}

export function GuideSteps({ steps, theme }: Props) {
  const bulletStyle: CSSProperties | undefined = theme
    ? {
        backgroundColor: theme.badge,
        color: theme.heroAccent,
      }
    : undefined
  const titleStyle: CSSProperties | undefined = theme
    ? { color: theme.heroText }
    : undefined
  const bodyStyle: CSSProperties | undefined = theme
    ? { color: theme.cardMuted }
    : undefined

  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={index} className="flex gap-3">
          <div
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary"
            style={bulletStyle}
          >
            {index + 1}
          </div>
          <div className="flex-1 space-y-1 pt-0.5">
            <div
              className="text-sm font-medium"
              style={titleStyle}
            >
              {step.title}
            </div>
            <div
              className="text-sm text-muted-foreground"
              style={bodyStyle}
            >
              {step.body}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
