import type { AccountRecord } from "@/lib/accounts"
import { InitialsAvatar } from "@/components/dr/initials-avatar"

type StackedAvatarsProps = {
  accounts: AccountRecord[]
  size?: number
  max?: number
}

export function StackedAvatars({
  accounts,
  size = 18,
  max = 3,
}: StackedAvatarsProps) {
  const visible = accounts.slice(0, max)
  if (visible.length === 0) return null
  return (
    <span className="inline-flex items-center">
      {visible.map((acc, i) => (
        <span
          key={acc.id}
          className="ring-[1.5px] ring-surface"
          style={{
            display: "inline-flex",
            marginLeft: i === 0 ? 0 : -size * 0.35,
            borderRadius: "9999px",
            zIndex: visible.length - i,
          }}
        >
          <InitialsAvatar name={acc.display_name} size={size} />
        </span>
      ))}
    </span>
  )
}
