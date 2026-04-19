import { cn } from "@/lib/utils"

type DRTabsProps<T extends string> = {
  tabs: readonly T[]
  active: T
  onChange: (value: T) => void
  className?: string
}

export function DRTabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: DRTabsProps<T>) {
  return (
    <div
      className={cn(
        "flex gap-0.5 border-b border-border-subtle px-4",
        className,
      )}
      role="tablist"
    >
      {tabs.map((t) => {
        const isActive = t === active
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t)}
            className={cn(
              "-mb-[0.5px] cursor-default px-2.5 pt-2.5 pb-2 text-[12px] font-medium transition-colors",
              "border-b-[1.5px] outline-none",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        )
      })}
    </div>
  )
}
