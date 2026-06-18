export function SkeletonMatchCard() {
  return (
    <div className="flex items-center px-4 py-3 border-b border-divider last:border-b-0 animate-pulse">
      <div className="flex items-center gap-2 flex-1">
        <div className="w-6 h-6 rounded-full bg-bg-elevated shrink-0" />
        <div className="h-3 w-24 bg-bg-elevated rounded" />
      </div>
      <div className="px-4 flex flex-col items-center gap-1 shrink-0">
        <div className="h-5 w-10 bg-bg-elevated rounded" />
        <div className="h-2.5 w-6 bg-bg-elevated rounded" />
      </div>
      <div className="flex items-center gap-2 flex-1 justify-end">
        <div className="h-3 w-24 bg-bg-elevated rounded" />
        <div className="w-6 h-6 rounded-full bg-bg-elevated shrink-0" />
      </div>
    </div>
  )
}
