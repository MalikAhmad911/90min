/** Skeleton while the player page's database read is in flight. */
export default function PlayerLoading() {
  return (
    <div className="px-4 py-4" aria-busy="true" aria-label="Loading player">
      <div className="flex items-center gap-4">
        <div className="w-[72px] h-[72px] rounded-full bg-bg-surface animate-pulse" />
        <div className="flex-1">
          <div className="h-5 w-48 bg-bg-surface rounded animate-pulse" />
          <div className="h-4 w-32 bg-bg-surface rounded animate-pulse mt-2" />
        </div>
      </div>
      <div className="h-32 bg-bg-surface rounded-lg animate-pulse mt-4" />
      <div className="h-40 bg-bg-surface rounded-lg animate-pulse mt-2" />
    </div>
  )
}
