import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Offline | 90 Min Tactics',
  robots: { index: false },
}

/** Shown by the service worker when a page is requested with no connection. */
export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <span className="text-5xl mb-4" aria-hidden>
        📡
      </span>
      <h1 className="text-lg font-bold text-content-primary mb-2">You&apos;re offline</h1>
      <p className="text-sm text-content-muted max-w-xs">
        Scores need a connection. Reconnect and pull to refresh — we&apos;ll pick up where you left off.
      </p>
    </div>
  )
}
