'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'

export const BANNER_DISMISSED_KEY = '90min:onboarding-banner-dismissed'

/**
 * Invitation to onboarding (PRD ON-1).
 *
 * A banner rather than a redirect: forcing first-time visitors through a
 * wizard would hide the scores search engines and new users came for.
 * Shown only to devices that follow nothing and have not dismissed it.
 */
export function PersonaliseBanner({ hasFollows }: { hasFollows: boolean }) {
  // null = not yet read from storage; render nothing until known.
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(BANNER_DISMISSED_KEY) === '1')
    } catch {
      setDismissed(false)
    }
  }, [])

  if (dismissed !== false || hasFollows) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(BANNER_DISMISSED_KEY, '1')
    } catch {
      // not persisted; hidden for this visit
    }
  }

  return (
    <aside
      aria-label="Personalise your feed"
      className="mx-2 mt-2 flex items-start gap-3 rounded-lg bg-bg-surface px-4 py-3 border border-divider"
    >
      <Sparkles size={18} className="mt-0.5 shrink-0 text-accent-green" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-content-primary">Personalise your feed</p>
        <p className="text-[12px] text-content-secondary mt-0.5">
          Pick your teams and leagues to pin their matches at the top, and set your time zone.
        </p>
        <Link
          href="/onboarding"
          className="mt-2 inline-flex rounded-full bg-accent-green px-3 py-1 text-[12px] font-bold text-bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
        >
          Get started
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss personalise banner"
        className="shrink-0 rounded-full p-1 text-content-muted hover:text-content-primary hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  )
}
