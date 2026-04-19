export function PopoverLoading() {
  return (
    <ul className="animate-pulse">
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="flex h-12 items-center gap-3 border-b border-border-subtle px-4 last:border-b-0"
        >
          <span className="size-4 rounded-full bg-surface-2" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="h-[11px] w-[40%] rounded bg-surface-2" />
            <span className="h-[9px] w-[60%] rounded bg-surface-2/70" />
          </div>
          <span className="h-[11px] w-10 rounded bg-surface-2" />
        </li>
      ))}
    </ul>
  )
}
