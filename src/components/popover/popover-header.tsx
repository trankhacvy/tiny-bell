import { useState } from "react"
import {
  DRMenu,
  DRMenuItem,
  DRMenuSeparator,
} from "@/components/dr/menu"
import { Icon } from "@/components/dr/icon"
import { InitialsAvatar } from "@/components/dr/initials-avatar"
import { ProviderMark } from "@/components/dr/provider-mark"
import { IconButton } from "./icon-button"
import { StackedAvatars } from "./stacked-avatars"
import { ProjectFilter } from "./project-filter"
import type { AccountRecord } from "@/lib/accounts"
import type { Scope } from "@/hooks/use-scope"
import type { Project } from "@/lib/deployments"
import { deploymentsApi, windowApi } from "@/lib/deployments"

type PopoverHeaderProps = {
  accounts: AccountRecord[]
  scope: Scope
  onScopeChange: (next: Scope) => void
  projects: Project[]
  selectedProjectIds: Set<string>
  onSelectedProjectIdsChange: (next: Set<string>) => void
  refreshing?: boolean
}

export function PopoverHeader({
  accounts,
  scope,
  onScopeChange,
  projects,
  selectedProjectIds,
  onSelectedProjectIdsChange,
  refreshing,
}: PopoverHeaderProps) {
  const [open, setOpen] = useState(false)
  const current =
    scope === "all" ? null : accounts.find((a) => a.id === scope) ?? null

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface px-3">
      <DRMenu
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button
            type="button"
            className="flex h-8 min-w-0 items-center gap-2 rounded-[6px] px-1.5 outline-none hover:bg-hover focus-visible:bg-hover"
          >
            {current ? (
              <>
                <InitialsAvatar name={current.display_name} size={20} />
                <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
                  {current.display_name}
                </span>
                <ProviderMark
                  platform={current.platform}
                  size={11}
                  className="shrink-0 text-muted-foreground"
                />
              </>
            ) : (
              <>
                <StackedAvatars accounts={accounts} size={20} max={3} />
                <span className="text-[13px] font-medium text-foreground">
                  {accounts.length === 0
                    ? "Dev Radio"
                    : accounts.length === 1
                      ? accounts[0].display_name
                      : "All accounts"}
                </span>
              </>
            )}
            <Icon
              name="chevron-down"
              size={11}
              className="shrink-0 text-muted-foreground"
            />
          </button>
        }
      >
        <DRMenuItem accel="⌘0" onSelect={() => onScopeChange("all")}>
          All accounts
        </DRMenuItem>
        {accounts.length > 0 && <DRMenuSeparator />}
        {accounts.map((acc, i) => (
          <DRMenuItem
            key={acc.id}
            accel={i < 9 ? `⌘${i + 1}` : undefined}
            onSelect={() => onScopeChange(acc.id)}
            left={<InitialsAvatar name={acc.display_name} size={16} />}
            right={<ProviderMark platform={acc.platform} size={11} />}
          >
            {acc.display_name}
          </DRMenuItem>
        ))}
        <DRMenuSeparator />
        <DRMenuItem
          accel="⌘N"
          onSelect={() => void windowApi.openDesktop("onboarding")}
        >
          Add account…
        </DRMenuItem>
      </DRMenu>
      <ProjectFilter
        projects={projects}
        selected={selectedProjectIds}
        onChange={onSelectedProjectIdsChange}
      />
      <div className="ml-auto flex items-center gap-0.5">
        <IconButton
          name="refresh"
          tooltip="Refresh (⌘R)"
          onClick={() => void deploymentsApi.refreshNow()}
          className={refreshing ? "animate-spin" : undefined}
        />
        <IconButton
          name="gear"
          tooltip="Settings (⌘,)"
          onClick={() => void windowApi.openDesktop("settings")}
        />
      </div>
    </header>
  )
}
