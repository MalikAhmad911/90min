'use client'

import Link from 'next/link'

/** Shown when the database read fails; the message stays generic on purpose. */
export default function PlayerError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center" role="alert">
      <p className="text-sm font-medium text-content-secondary">Could not load this player</p>
      <p className="text-xs text-content-muted mt-1">Please try again in a moment.</p>
      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="text-[13px] text-accent-green hover:underline"
        >
          Try again
        </button>
        <Link href="/" className="text-[13px] text-content-secondary hover:underline">
          Back to scores
        </Link>
      </div>
    </div>
  )
}
