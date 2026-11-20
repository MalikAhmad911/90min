interface LiveBadgeProps {
  minute?: number
}

export function LiveBadge({ minute }: LiveBadgeProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-green animate-live-pulse" />
      <span className="text-accent-green text-xs font-bold tracking-wide">LIVE</span>
      {minute !== undefined && (
        <span className="text-accent-green text-xs font-bold">{minute}&apos;</span>
      )}
    </div>
  )
}
