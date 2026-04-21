const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

export function formatRelative(ms: number, now: number = Date.now()): string {
  if (!ms || Number.isNaN(ms)) return ""
  const diff = now - ms
  if (diff < 10_000) return "just now"
  if (diff < MINUTE) return `${Math.round(diff / 1000)} seconds ago`
  if (diff < 2 * MINUTE) return "a minute ago"
  if (diff < HOUR) return `${Math.round(diff / MINUTE)} minutes ago`
  if (diff < 2 * HOUR) return "an hour ago"
  if (diff < DAY) return `${Math.round(diff / HOUR)} hours ago`
  if (diff < 2 * DAY) return "a day ago"
  if (diff < WEEK) return `${Math.round(diff / DAY)} days ago`
  if (diff < MONTH) return `${Math.round(diff / WEEK)} weeks ago`
  if (diff < YEAR) return `${Math.round(diff / MONTH)} months ago`
  return `${Math.round(diff / YEAR)} years ago`
}

export function formatRelativeShort(ms: number, now: number = Date.now()): string {
  if (!ms || Number.isNaN(ms)) return ""
  const diff = now - ms
  if (diff < MINUTE) return "now"
  if (diff < HOUR) return `${Math.round(diff / MINUTE)}m`
  if (diff < DAY) return `${Math.round(diff / HOUR)}h`
  if (diff < WEEK) return `${Math.round(diff / DAY)}d`
  if (diff < MONTH) return `${Math.round(diff / WEEK)}w`
  if (diff < YEAR) return `${Math.round(diff / MONTH)}mo`
  return `${Math.round(diff / YEAR)}y`
}

export function formatInterval(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const minutes = ms / 60_000
  return Number.isInteger(minutes) ? `${minutes}m` : `${minutes.toFixed(1)}m`
}

export function formatDuration(ms: number | null): string {
  if (ms == null || ms <= 0) return ""
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (rem === 0) return `${m}m`
  return `${m}m ${rem}s`
}
