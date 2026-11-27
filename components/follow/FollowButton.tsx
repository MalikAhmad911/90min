'use client'

import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { useFollows, type FollowEntityType } from '@/hooks/useFollows'

/**
 * Star toggle to follow a team, competition, match or player.
 *
 * Optimistic: the star fills immediately and un-fills if the server refuses,
 * with a short message saying so. Safe inside a link or a clickable row - it
 * stops the click from navigating.
 *
 *   <FollowButton entityType="team" entityKey={57} name="Arsenal" />
 */
export interface FollowButtonProps {
  entityType: FollowEntityType
  entityKey: string | number
  /** Human name, used in the accessible label: "Follow Arsenal". */
  name: string
  size?: 'sm' | 'md'
  /** Show "Follow" / "Following" text beside the star. */
  showLabel?: boolean
  className?: string
}

export function FollowButton({
  entityType,
  entityKey,
  name,
  size = 'md',
  showLabel = false,
  className = '',
}: FollowButtonProps) {
  const { isFollowing, toggle, deviceId } = useFollows()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const following = isFollowing(entityType, entityKey)

  useEffect(() => {
    if (!error) return
    const timer = window.setTimeout(() => setError(null), 4_000)
    return () => window.clearTimeout(timer)
  }, [error])

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await toggle(entityType, entityKey)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update')
    } finally {
      setPending(false)
    }
  }

  const icon = size === 'sm' ? 14 : 18
  const label = following ? `Unfollow ${name}` : `Follow ${name}`

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={following}
        aria-label={label}
        title={label}
        // Disabled only until the device id exists (one tick after mount).
        disabled={!deviceId}
        className={`inline-flex items-center gap-1.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green disabled:opacity-50 ${
          size === 'sm' ? 'p-1' : showLabel ? 'px-3 py-1.5' : 'p-1.5'
        } ${
          following
            ? 'text-accent-green hover:bg-bg-elevated'
            : 'text-content-muted hover:text-content-primary hover:bg-bg-elevated'
        }`}
      >
        <Star
          size={icon}
          aria-hidden="true"
          className={pending ? 'animate-pulse' : ''}
          fill={following ? 'currentColor' : 'none'}
        />
        {showLabel && (
          <span className="text-[13px] font-semibold" aria-hidden="true">
            {following ? 'Following' : 'Follow'}
          </span>
        )}
      </button>
      <span
        role="status"
        aria-live="polite"
        className={
          error
            ? 'absolute right-0 top-full mt-1 z-20 w-max max-w-[14rem] rounded-md bg-bg-elevated px-2 py-1 text-[11px] text-live-red shadow-lg'
            : 'sr-only'
        }
      >
        {error ?? ''}
      </span>
    </span>
  )
}
