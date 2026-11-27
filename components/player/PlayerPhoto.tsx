'use client'

import Image from 'next/image'
import { useState } from 'react'
import { playerInitials } from './player-utils'

/**
 * A player's photo, or their initials.
 *
 * `src` is only ever a URL whose licence allows public display (see
 * lib/providers/thesportsdb-players.ts); the caller prints its credit. A
 * broken image falls back to initials rather than a broken-image icon.
 */
export function PlayerPhoto({
  src,
  name,
  size = 72,
}: {
  src: string | null
  name: string
  size?: number
}) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className="shrink-0 inline-flex items-center justify-center rounded-full bg-bg-elevated text-content-secondary font-bold select-none"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      >
        {playerInitials(name)}
      </span>
    )
  }

  return (
    <span
      className="relative inline-block shrink-0 rounded-full overflow-hidden bg-bg-elevated"
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={`Photo of ${name}`}
        fill
        sizes={`${size}px`}
        className="object-cover object-top"
        onError={() => setFailed(true)}
        unoptimized
      />
    </span>
  )
}
