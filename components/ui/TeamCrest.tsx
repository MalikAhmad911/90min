'use client'

import { useEffect, useState } from 'react'
import { Crest } from './Crest'

/**
 * A team badge with a second chance.
 *
 * football-data's crest is missing for plenty of clubs. When it fails we ask
 * TheSportsDB (free, no key) for a badge before giving up and showing initials.
 * The lookup happens once per team and its result is shared across every card
 * on the page, so a league of twenty teams costs at most twenty requests - not
 * one per row per render.
 */
interface TeamCrestProps {
  src?: string | null
  name: string
  size?: number
  className?: string
}

/** name -> badge URL (or null when the lookup found nothing). */
const badgeCache = new Map<string, string | null>()
const inFlight = new Map<string, Promise<string | null>>()

function lookupBadge(name: string): Promise<string | null> {
  const cached = badgeCache.get(name)
  if (cached !== undefined) return Promise.resolve(cached)

  const running = inFlight.get(name)
  if (running) return running

  const p = fetch(`/api/team-badge?name=${encodeURIComponent(name)}`)
    .then((r) => (r.ok ? r.json() : { badge: null }))
    .then((d: { badge: string | null }) => d.badge ?? null)
    .catch(() => null)
    .then((badge) => {
      badgeCache.set(name, badge)
      inFlight.delete(name)
      return badge
    })

  inFlight.set(name, p)
  return p
}

export function TeamCrest({ src, name, size = 20, className }: TeamCrestProps) {
  const [resolved, setResolved] = useState<string | null | undefined>(src || undefined)

  useEffect(() => {
    setResolved(src || undefined)
  }, [src])

  // Only reached once the primary crest has failed.
  const onPrimaryFailed = () => {
    void lookupBadge(name).then((badge) => {
      // Only swap in a badge we actually found; otherwise Crest keeps showing
      // the initials it already fell back to.
      if (badge) setResolved(badge)
    })
  }

  return (
    <Crest
      src={resolved}
      name={name}
      size={size}
      className={className}
      onError={onPrimaryFailed}
    />
  )
}
