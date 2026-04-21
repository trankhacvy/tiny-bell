import { useMemo, useState } from "react"
import { DropdownMenu as DM } from "radix-ui"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Deployment, DeploymentState, Project } from "@/lib/deployments"

function statusDotColor(state: DeploymentState): string {
  switch (state) {
    case "ready":
      return "var(--green)"
    case "error":
      return "var(--red)"
    case "building":
    case "queued":
      return "var(--amber)"
    default:
      return "var(--text-3)"
  }
}

// null = no filter (show all); Set = explicit selection (empty Set = show nothing)
export type ProjectSelection = Set<string> | null

type ProjectFilterProps = {
  projects: Project[]
  selected: ProjectSelection
  onChange: (next: ProjectSelection) => void
  deployments?: Deployment[]
}

export function ProjectFilter({
  projects,
  selected,
  onChange,
  deployments,
}: ProjectFilterProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const total = projects.length
  const count = selected === null ? total : selected.size
  const allSelected = selected === null || selected.size === total

  const label = useMemo(() => {
    if (allSelected) return "All projects"
    if (selected !== null && selected.size === 0) return "No projects"
    if (count === 1) {
      const p = projects.find((proj) => selected !== null && selected.has(proj.id))
      return p?.name ?? "1 project"
    }
    return `${count} projects`
  }, [count, total, projects, selected, allSelected])

  const countByProject = useMemo(() => {
    const m = new Map<string, number>()
    if (!deployments) return m
    for (const d of deployments) {
      m.set(d.project_id, (m.get(d.project_id) ?? 0) + 1)
    }
    return m
  }, [deployments])

  const filteredProjects = useMemo(() => {
    if (!query) return projects
    const q = query.toLowerCase()
    return projects.filter((p) => p.name.toLowerCase().includes(q))
  }, [projects, query])

  const toggleOne = (id: string) => {
    const base =
      selected === null
        ? new Set(projects.map((p) => p.id))
        : new Set(selected)
    if (base.has(id)) base.delete(id)
    else base.add(id)
    if (base.size === 0 || base.size === total) onChange(null)
    else onChange(base)
  }

  if (projects.length === 0) return null

  const showBadge = selected !== null && selected.size > 0 && selected.size < total

  return (
    <DM.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQuery("")
      }}
    >
      <DM.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-[28px] max-w-[140px] items-center gap-[6px] rounded-[6px] border px-[8px] outline-none",
            open
              ? "border-faint bg-hover"
              : "border-border bg-transparent hover:bg-hover",
          )}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            className="shrink-0 text-muted-foreground"
          >
            <path d="M1 3 h4 l1 1 h5 v6 h-10 z" />
          </svg>
          <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
            {label}
          </span>
          {showBadge && (
            <span className="min-w-[14px] rounded-full bg-foreground px-[5px] py-0 text-center text-[9.5px] font-semibold text-surface">
              {count}
            </span>
          )}
          <ChevronDown size={10} className="shrink-0 text-muted-foreground" />
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content
          align="start"
          side="bottom"
          sideOffset={6}
          className={cn(
            "z-50 w-[260px] overflow-hidden rounded-[10px] border border-border bg-surface text-foreground",
            "shadow-[0_8px_24px_rgba(20,20,30,0.12),0_0_0_0.5px_rgba(0,0,0,0.05)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
          )}
        >
          {/* Search */}
          <div className="border-b border-border px-[10px] py-[8px]">
            <div className="flex items-center gap-[7px] rounded-[6px] border border-border bg-surface-2 px-[9px] py-[6px]">
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                className="shrink-0 text-faint"
              >
                <circle cx="6.5" cy="6.5" r="4.5" />
                <path d="M10.5 10.5 L14 14" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter projects..."
                className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-faint"
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Select all / Clear */}
          <div className="flex items-center border-b border-border px-[10px] py-[7px]">
            <button
              type="button"
              disabled={allSelected}
              className="text-[11.5px] text-foreground hover:underline disabled:cursor-default disabled:opacity-40"
              onClick={() => onChange(null)}
            >
              Select all
            </button>
            <span className="mx-[6px] text-faint">·</span>
            <button
              type="button"
              disabled={selected !== null && selected.size === 0}
              className="text-[11.5px] text-foreground hover:underline disabled:cursor-default disabled:opacity-40"
              onClick={() => onChange(new Set())}
            >
              Clear
            </button>
            <span className="ml-auto text-[11px] font-medium tabular-nums text-faint">
              {count}/{total}
            </span>
          </div>

          {/* Project list */}
          <div className="max-h-[220px] overflow-y-auto p-1">
            {filteredProjects.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-faint">
                No projects found.
              </p>
            ) : (
              filteredProjects.map((project) => {
                const checked = selected === null || selected.has(project.id)
                const state = project.latest_deployment?.state ?? null
                const depCount = countByProject.get(project.id)
                return (
                  <DM.Item
                    key={project.id}
                    onSelect={(e) => {
                      e.preventDefault()
                      toggleOne(project.id)
                    }}
                    className="flex h-[30px] cursor-default items-center gap-[8px] rounded-[5px] px-[8px] text-[12.5px] outline-none data-[highlighted]:bg-hover"
                  >
                    <span
                      className={cn(
                        "flex size-[14px] shrink-0 items-center justify-center rounded-[3px] border",
                        checked ? "border-foreground bg-foreground" : "border-border",
                      )}
                    >
                      {checked && (
                        <svg
                          width="9"
                          height="7"
                          viewBox="0 0 9 7"
                          fill="none"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M1 3.5L3.5 6L8 1" />
                        </svg>
                      )}
                    </span>
                    {state && (
                      <span
                        className="size-[7px] shrink-0 rounded-full"
                        style={{ background: statusDotColor(state) }}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    {depCount !== undefined && (
                      <span className="text-[11px] tabular-nums text-faint">
                        {depCount}
                      </span>
                    )}
                  </DM.Item>
                )
              })
            )}
          </div>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}
