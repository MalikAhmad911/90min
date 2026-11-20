/**
 * Loading placeholder shaped like a real match row, so the layout does not
 * jump when data lands. Uses the sweeping shimmer rather than a blink - a
 * pulsing block reads as "stuck", a sweep reads as "working".
 */
export function SkeletonMatchCard() {
  return (
    <div
      className="flex items-center px-4 py-3 border-b border-divider last:border-b-0"
      aria-hidden="true"
    >
      <div className="w-7 shrink-0">
        <div className="h-2.5 w-5 rounded animate-shimmer" />
      </div>
      <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
        <div className="h-3 w-20 rounded animate-shimmer" />
        <div className="w-4 h-4 rounded-full shrink-0 animate-shimmer" />
      </div>
      <div className="w-24 shrink-0 flex items-center justify-center">
        <div className="h-4 w-12 rounded animate-shimmer" />
      </div>
      <div className="flex-1 flex items-center gap-1.5 min-w-0">
        <div className="w-4 h-4 rounded-full shrink-0 animate-shimmer" />
        <div className="h-3 w-20 rounded animate-shimmer" />
      </div>
    </div>
  )
}
