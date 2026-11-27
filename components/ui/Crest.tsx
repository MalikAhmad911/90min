'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useLiteMode } from '@/hooks/useLiteMode'

/**
 * The single crest/emblem renderer for the whole app.
 *
 * Every badge in football data is a remote PNG that may be missing, and the
 * provider's URLs are irregular enough that some always 404. Rather than let a
 * broken image icon through, this falls back to the team's initials on a token
 * background - which reads as deliberate rather than failed.
 *
 * Previously each of MatchCard, WatchMatchRow, StandingsTable, TeamView and
 * MatchDetailView carried its own near-identical copy of this logic.
 *
 * Lite mode (hooks/useLiteMode.ts) shows the same fallback without requesting
 * the image at all. Lite mode is a browser-only preference, so the server
 * render and the hydration pass draw the image as usual and the switch to
 * the fallback happens on the render right after - no hydration mismatch.
 * TeamCrest goes through here too, so in Lite mode it never reaches its
 * TheSportsDB lookup either (that only runs when an image fails to load).
 */
interface CrestProps {
  src?: string | null
  /** Used for alt text and to derive the fallback initials. */
  name: string
  /** Rendered size in px. Also drives the fallback's font size. */
  size?: number
  /** Shown instead of initials when the image fails, e.g. a flag emoji. */
  fallbackText?: string
  className?: string
  /** Called when this `src` fails to load, so a caller can supply another. */
  onError?: () => void
}

/** "Liverpool FC" -> "L", "Manchester City" -> "MC" (max 2 letters). */
function initialsOf(name: string): string {
  const words = name
    .replace(/\b(FC|CF|AFC|SC|AC|SV|BV|CD|UD|RC)\b/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return name.slice(0, 1).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function Crest({
  src,
  name,
  size = 20,
  fallbackText,
  className = '',
  onError,
}: CrestProps) {
  // Tracked per-URL, not as a boolean: when a caller swaps in a different src
  // after a failure, that new image must get its own chance to load.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const { enabled: lite } = useLiteMode()
  const showFallback = lite || !src || failedSrc === src

  if (showFallback) {
    const label = fallbackText ?? initialsOf(name)
    return (
      <span
        aria-hidden="true"
        title={name}
        className={`shrink-0 inline-flex items-center justify-center rounded-full bg-bg-elevated text-content-muted font-bold select-none ${className}`}
        style={{
          width: size,
          height: size,
          // Keeps two initials legible inside a 16px badge.
          fontSize: Math.max(8, Math.round(size * 0.42)),
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    )
  }

  return (
    <span
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={name}
        fill
        sizes={`${size}px`}
        className="object-contain"
        onError={() => {
          setFailedSrc(src)
          onError?.()
        }}
        unoptimized
      />
    </span>
  )
}
