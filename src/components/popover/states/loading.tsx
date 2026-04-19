function SkeletonRow() {
  return (
    <div className="flex items-center gap-[10px] border-b border-border-subtle px-[14px] py-[10px]">
      <span className="size-3 shrink-0 rounded-full bg-surface-2" />
      <div className="flex flex-1 flex-col gap-[5px]">
        <span className="h-[10px] w-[55%] rounded-[3px] bg-surface-2" />
        <span className="h-[8px] w-[80%] rounded-[3px] bg-surface-2/70" />
      </div>
      <span className="h-[8px] w-[30px] rounded-[3px] bg-surface-2/70" />
    </div>
  )
}

export function PopoverLoading() {
  return (
    <div className="flex flex-1 flex-col animate-pulse">
      <div className="flex items-center gap-[8px] border-b border-border-subtle bg-surface px-[14px] py-[10px]">
        <span
          className="size-[10px] rounded-full border-[1.5px] border-border"
          style={{ borderTopColor: "var(--text)", animation: "dr-spin 0.8s linear infinite" }}
        />
        <span className="text-[12px] text-faint">Tuning in…</span>
      </div>
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </div>
  )
}
