import { useEffect, useState } from "react"

import { DRButton } from "@/components/dr/button"
import { DRInput } from "@/components/dr/input"
import {
  accountsApiGitHub,
  type GitHubRepoInfo,
} from "@/lib/accounts"
import { cn } from "@/lib/utils"

type Props = {
  accountId: string
  initialRepos?: string[]
  onSave: (repos: string[]) => void | Promise<void>
}

export function RepoSelector({ accountId, initialRepos, onSave }: Props) {
  const [repos, setRepos] = useState<GitHubRepoInfo[]>([])
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialRepos ?? []),
  )
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const isFirstSetup = initialRepos === undefined

  useEffect(() => {
    setLoading(true)
    accountsApiGitHub
      .listRepos(accountId)
      .then((r) => {
        setRepos(r)
        if (isFirstSetup) {
          setSelected(new Set(r.slice(0, 10).map((repo) => repo.full_name)))
        }
      })
      .finally(() => setLoading(false))
  }, [accountId, isFirstSetup])

  function toggle(fullName: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(fullName)) {
        next.delete(fullName)
      } else if (next.size < 30) {
        next.add(fullName)
      }
      return next
    })
  }

  const filtered = repos.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase()),
  )

  // Bulk-select state. Two "done" cases for the toggle:
  //   1. Every visible (filtered) repo is already in the selection.
  //   2. We've hit the 30-repo cap.
  // Either one flips the button to Deselect. Hitting the cap is also the
  // one-click escape hatch — clicking Deselect clears the *whole* selection
  // so users can start over instead of un-ticking one at a time.
  const capReached = selected.size >= 30
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.full_name))

  function toggleAll() {
    setSelected((prev) => {
      if (capReached) {
        // Cap reached → single-click clear. Works whether or not the
        // filter covers all 30; either way, the user wants to reset.
        return new Set()
      }
      const next = new Set(prev)
      if (allFilteredSelected) {
        for (const r of filtered) next.delete(r.full_name)
        return next
      }
      for (const r of filtered) {
        if (next.size >= 30) break
        next.add(r.full_name)
      }
      return next
    })
  }

  // Truth-in-labeling:
  // - "Select first 30" when the full list doesn't fit.
  // - "Select all" / "Select filtered (N)" when it does.
  // - "Deselect all" once we're at the cap or everything visible is picked.
  const toggleLabel = (() => {
    if (capReached) return "Deselect all"
    if (allFilteredSelected) return search ? "Deselect filtered" : "Deselect all"
    if (search) return `Select filtered (${Math.min(filtered.length, 30)})`
    if (filtered.length > 30) return "Select first 30"
    return "Select all"
  })()

  async function handleSave() {
    setSaving(true)
    try {
      await accountsApiGitHub.setMonitoredRepos(
        accountId,
        Array.from(selected),
      )
      await onSave(Array.from(selected))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-[12px] text-muted-foreground">
        Loading repositories…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-foreground">
          Select repositories to monitor
        </span>
        <div className="flex items-center gap-2">
          {filtered.length > 0 ? (
            <button
              type="button"
              onClick={toggleAll}
              className={cn(
                "rounded-[4px] border border-border bg-surface-2 px-2 py-[3px] text-[10.5px] font-medium text-foreground transition-colors hover:bg-hover",
              )}
            >
              {toggleLabel}
            </button>
          ) : null}
          <span
            className={cn(
              "font-mono-tabular text-[11px]",
              capReached ? "text-warning" : "text-muted-foreground",
            )}
          >
            {selected.size}/30
          </span>
        </div>
      </div>

      <DRInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter repositories…"
        autoComplete="off"
        spellCheck={false}
      />

      <div className="max-h-[240px] overflow-y-auto rounded-[6px] border border-border bg-surface">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">
            {repos.length === 0
              ? "No repositories found."
              : "No matching repositories."}
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {filtered.map((repo) => (
              <li key={repo.full_name}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-hover">
                  <input
                    type="checkbox"
                    checked={selected.has(repo.full_name)}
                    onChange={() => toggle(repo.full_name)}
                    disabled={
                      !selected.has(repo.full_name) && selected.size >= 30
                    }
                    className="accent-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                    {repo.full_name}
                  </span>
                  {repo.is_private ? (
                    <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      private
                    </span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DRButton
        variant="primary"
        size="md"
        fullWidth
        disabled={selected.size === 0 || saving}
        onClick={() => void handleSave()}
      >
        {saving ? "Saving…" : `Monitor ${selected.size} ${selected.size === 1 ? "repo" : "repos"}`}
      </DRButton>
    </div>
  )
}
