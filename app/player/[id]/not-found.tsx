import Link from 'next/link'

export default function PlayerNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <p className="text-sm font-medium text-content-secondary">Player not found</p>
      <p className="text-xs text-content-muted mt-1">
        We have no record of this player yet. Squads are loaded gradually.
      </p>
      <Link href="/" className="mt-4 text-[13px] text-accent-green hover:underline">
        Back to scores
      </Link>
    </div>
  )
}
