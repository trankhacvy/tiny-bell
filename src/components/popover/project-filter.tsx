import { useMemo, useState } from "react"
import { DropdownMenu as DM } from "radix-ui"
import { Icon } from "@/components/dr/icon"
import { ProviderMark } from "@/components/dr/provider-mark"
import { cn } from "@/lib/utils"
import type { Project } from "@/lib/deployments"

type ProjectFilterProps = {
  projects: Project[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}

export function ProjectFilter({
  projects,
  selected,
  onChange,
}: ProjectFilterProps) {
  const [open, setOpen] = useState(false)

  const total = projects.length
  const count = selected.size
  const label = useMemo(() => {
    if (count === 0 || count === total) return "All projects"
    if (count === 1) {
      const project = projects.find((p) => selected.has(p.id))
      return project?.name ?? "1 project"
    }
    return `${count} projects`
  }, [count, total, projects, selected])

  const toggleOne = (id: string) => {
    const next = new Set(selected.size === 0 ? projects.map((p) => p.id) : selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    if (next.size === 0 || next.size === total) onChange(new Set())
    else onChange(next)
  }

  const selectAll = () => onChange(new Set())

  if (projects.length === 0) return null

  return (
    <DM.Root open={open} onOpenChange={setOpen}>
      <DM.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-7 max-w-[180px] items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 text-[12px] text-foreground outline-none",
            "hover:bg-hover focus-visible:ring-1 focus-visible:ring-border",
          )}
        >
          <Icon name="filter" size={11} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{label}</span>
          <Icon
            name="chevron-down"
            size={10}
            className="shrink-0 text-muted-foreground"
          />
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content
          align="start"
          side="bottom"
          sideOffset={6}
          className={cn(
            "z-50 max-h-[300px] w-[260px] overflow-y-auto rounded-[8px] border border-border bg-surface p-1 text-foreground",
            "shadow-[0_8px_24px_rgba(20,20,30,0.12),0_0_0_0.5px_rgba(0,0,0,0.05)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
          )}
        >
          <DM.Item
            onSelect={(e) => {
              e.preventDefault()
              selectAll()
            }}
            className={cn(
              "flex h-7 items-center gap-2 rounded-[5px] px-2 text-[12.5px] outline-none",
              "data-[highlighted]:bg-hover",
            )}
          >
            <span className="flex w-4 justify-center">
              {count === 0 || count === total ? (
                <Icon name="check" size={11} className="text-foreground" />
              ) : null}
            </span>
            <span className="flex-1">All projects</span>
            <span className="text-[10.5px] text-muted-foreground">{total}</span>
          </DM.Item>
          <DM.Separator className="my-1 h-px bg-border-subtle" />
          {projects.map((project) => {
            const checked = count === 0 || selected.has(project.id)
            return (
              <DM.Item
                key={project.id}
                onSelect={(e) => {
                  e.preventDefault()
                  toggleOne(project.id)
                }}
                className={cn(
                  "flex h-7 items-center gap-2 rounded-[5px] px-2 text-[12.5px] outline-none",
                  "data-[highlighted]:bg-hover",
                )}
              >
                <span className="flex w-4 justify-center">
                  {checked ? (
                    <Icon name="check" size={11} className="text-foreground" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                <ProviderMark
                  platform={project.platform}
                  size={11}
                  className="shrink-0 text-muted-foreground"
                />
              </DM.Item>
            )
          })}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}
