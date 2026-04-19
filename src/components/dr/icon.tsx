import type { SVGProps } from "react"

export type IconName =
  | "check"
  | "x"
  | "chevron-down"
  | "chevron-up"
  | "chevron-right"
  | "plus"
  | "minus"
  | "dot"
  | "refresh"
  | "gear"
  | "external"
  | "arrow-right"
  | "info"
  | "warning"
  | "keyboard"
  | "clock"
  | "search"
  | "filter"

type IconProps = {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
} & Omit<SVGProps<SVGSVGElement>, "name" | "size">

const PATHS: Record<IconName, string> = {
  check: "M4 8.5 L7 11.5 L12.5 5.5",
  x: "M4 4 L12 12 M12 4 L4 12",
  "chevron-down": "M4 6 L8 10 L12 6",
  "chevron-up": "M4 10 L8 6 L12 10",
  "chevron-right": "M6 4 L10 8 L6 12",
  plus: "M8 3 V13 M3 8 H13",
  minus: "M3 8 H13",
  dot: "M8 8 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0",
  refresh:
    "M13 8 a5 5 0 1 1 -1.46 -3.54 M13 2.5 V5.5 H10",
  gear:
    "M8 2 L9 4 L11 4 L11.5 5.5 L13 6 V7.5 L11.5 8.5 L11 10 L9 10 L8 12 L7 10 L5 10 L4.5 8.5 L3 7.5 V6 L4.5 5.5 L5 4 L7 4 Z M8 7 a1 1 0 1 0 0 2 a1 1 0 1 0 0 -2",
  external: "M6 3 H13 V10 M13 3 L6.5 9.5 M3 6 V13 H10",
  "arrow-right": "M3 8 H13 M9 4 L13 8 L9 12",
  info: "M8 4 V5 M8 7 V12",
  warning: "M8 3 L14 13 H2 Z M8 7 V10 M8 11.5 V11.6",
  clock: "M8 4 V8 L10.5 9.5",
  keyboard: "M3 5 H13 V11 H3 Z M5 7 V7.1 M7 7 V7.1 M9 7 V7.1 M11 7 V7.1 M5 9 H11",
  search: "M7 3 a4 4 0 1 0 0 8 a4 4 0 1 0 0 -8 M10 10 L13 13",
  filter: "M2 4 H14 L10 9 V13 L6 11 V9 Z",
}

const NEEDS_FILL: Record<IconName, boolean> = {
  check: false,
  x: false,
  "chevron-down": false,
  "chevron-up": false,
  "chevron-right": false,
  plus: false,
  minus: false,
  dot: true,
  refresh: false,
  gear: false,
  external: false,
  "arrow-right": false,
  info: true,
  warning: false,
  clock: false,
  keyboard: false,
  search: false,
  filter: false,
}

export function Icon({
  name,
  size = 14,
  strokeWidth = 1.5,
  className,
  ...rest
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...rest}
    >
      {name === "info" ? (
        <>
          <circle cx="8" cy="8" r="5.5" />
          <path d={PATHS[name]} strokeLinecap="round" />
        </>
      ) : name === "gear" ? (
        <>
          <path d={PATHS[name]} />
        </>
      ) : NEEDS_FILL[name] ? (
        <path d={PATHS[name]} fill="currentColor" stroke="none" />
      ) : (
        <path d={PATHS[name]} />
      )}
    </svg>
  )
}
