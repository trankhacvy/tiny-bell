import { Fragment, useState } from "react"
import { DropdownMenu as DM } from "radix-ui"
import {
  DRMenu,
  DRMenuItem,
  DRMenuSeparator,
  DRMenuLabel,
} from "@/components/dr/menu"
import { Icon } from "@/components/dr/icon"
import { ProviderMark } from "@/components/dr/provider-mark"
import { ProjectFilter, type ProjectSelection } from "./project-filter"
import { cn } from "@/lib/utils"
import { windowApi } from "@/lib/deployments"
import type { AccountRecord, Platform } from "@/lib/accounts"
import type { Scope } from "@/hooks/use-scope"
import type { Deployment, Project } from "@/lib/deployments"

type FilterBarProps = {
  accounts: AccountRecord[]
  scope: Scope
  onScopeChange: (s: Scope) => void
  projects: Project[]
  selectedProjectIds: ProjectSelection
  onSelectedProjectIdsChange: (next: ProjectSelection) => void
  deployments?: Deployment[]
}

type AccountPickerProps = {
  accounts: AccountRecord[]
  scope: Scope
  onScopeChange: (s: Scope) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  current: AccountRecord | null
}

function AccountPicker({
  accounts,
  scope,
  onScopeChange,
  open,
  onOpenChange,
  current,
}: AccountPickerProps) {
  const firstPlatform = current?.platform ?? accounts[0]?.platform ?? "vercel"

  return (
    <DRMenu
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <button
          type="button"
          className={cn(
            "flex h-[28px] min-w-0 flex-1 items-center gap-[7px] rounded-[6px] border px-[8px] outline-none",
            open ? "border-faint bg-hover" : "border-border bg-transparent hover:bg-hover",
          )}
        >
          <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-[4px] border border-border bg-surface-2">
            <ProviderMark platform={firstPlatform} size={10} />
          </span>
          <span
            className="min-w-0 flex-1 truncate text-left text-[12.5px] font-semibold text-foreground"
            style={{ letterSpacing: -0.1 }}
          >
            {current ? current.display_name : "All accounts"}
          </span>
          <Icon name="chevron-down" size={11} className="shrink-0 text-faint" />
        </button>
      }
    >
      {/* All accounts */}
      <DM.Item
        onSelect={() => onScopeChange("all")}
        className="flex cursor-default items-center gap-2 rounded-[5px] px-2 py-[6px] outline-none data-[highlighted]:bg-hover"
      >
        <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-[5px] border border-border bg-surface-2">
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            className="text-muted-foreground"
          >
            <circle cx="3.5" cy="3.5" r="1.5" />
            <circle cx="7.5" cy="3.5" r="1.5" />
            <circle cx="3.5" cy="7.5" r="1.5" />
            <circle cx="7.5" cy="7.5" r="1.5" />
          </svg>
        </span>
        <span className="flex flex-1 flex-col">
          <span className="text-[12.5px] font-semibold text-foreground">All accounts</span>
          <span className="text-[11px] text-faint">{accounts.length} connected · all deploys</span>
        </span>
        {scope === "all" && <Icon name="check" size={13} className="shrink-0 text-foreground" />}
      </DM.Item>

      <DRMenuSeparator />

      {(["vercel", "railway", "github"] as Platform[]).map((p) => {
        const group = accounts.filter((a) => a.platform === p)
        if (group.length === 0) return null
        return (
          <Fragment key={p}>
            <DRMenuLabel>
              {p === "vercel" ? "Vercel" : p === "railway" ? "Railway" : "GitHub"}
            </DRMenuLabel>
            {group.map((acc) => (
              <DM.Item
                key={acc.id}
                onSelect={() => onScopeChange(acc.id)}
                className="flex cursor-default items-center gap-2 rounded-[5px] px-2 py-[6px] outline-none data-[highlighted]:bg-hover"
              >
                <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-[5px] border border-border bg-surface-2">
                  <ProviderMark platform={acc.platform} size={11} />
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-[12.5px] font-medium text-foreground">{acc.display_name}</span>
                  {(acc.health === "needs_reauth" || acc.health === "revoked") && (
                    <span className="flex items-center gap-1 text-[11px] text-faint">
                      <span
                        className="size-[5px] shrink-0 rounded-full"
                        style={{
                          background: acc.health === "needs_reauth" ? "var(--amber)" : "var(--red)",
                        }}
                      />
                      {acc.health === "needs_reauth" ? "Needs re-auth" : "Revoked"}
                    </span>
                  )}
                </span>
                {scope === acc.id && <Icon name="check" size={13} className="shrink-0 text-foreground" />}
              </DM.Item>
            ))}
          </Fragment>
        )
      })}

      <DRMenuSeparator />
      <DRMenuItem left={<Icon name="plus" size={12} />} onSelect={() => void windowApi.openDesktop("onboarding")}>
        Add account…
      </DRMenuItem>
    </DRMenu>
  )
}

export function FilterBar({
  accounts,
  scope,
  onScopeChange,
  projects,
  selectedProjectIds,
  onSelectedProjectIdsChange,
  deployments,
}: FilterBarProps) {
  const [accountOpen, setAccountOpen] = useState(false)
  const current = scope === "all" ? null : accounts.find((a) => a.id === scope) ?? null

  return (
    <div className="flex shrink-0 items-center gap-[6px] border-b border-border-subtle bg-surface px-[10px] py-[8px]">
      <AccountPicker
        accounts={accounts}
        scope={scope}
        onScopeChange={onScopeChange}
        open={accountOpen}
        onOpenChange={setAccountOpen}
        current={current}
      />
      <ProjectFilter
        projects={projects}
        selected={selectedProjectIds}
        onChange={onSelectedProjectIdsChange}
        deployments={deployments}
      />
    </div>
  )
}
