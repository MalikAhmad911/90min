'use client'

import { useCallback, useEffect, useState } from 'react'
import { mutate } from 'swr'
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react'
import {
  currentSubscription,
  disablePush,
  enablePush,
  isPushSupported,
  PREFS_URL,
  vapidPublicKey,
} from '@/lib/notify/client'

/**
 * Turns Web Push on or off for this browser.
 *
 * The permission prompt is only ever triggered by the user's click: browsers
 * penalise (and users resent) prompts that appear on page load.
 */

export type PushState =
  | 'checking'
  | 'unsupported'
  | 'unconfigured'
  | 'denied'
  | 'off'
  | 'working'
  | 'enabled'
  | 'error'

interface EnableNotificationsProps {
  /** Smaller, single-line variant for placing next to a follow button. */
  compact?: boolean
  className?: string
  onChange?: (enabled: boolean) => void
}

export function EnableNotifications({ compact = false, className = '', onChange }: EnableNotificationsProps) {
  const [state, setState] = useState<PushState>('checking')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!isPushSupported()) return setState('unsupported')
      if (!vapidPublicKey()) return setState('unconfigured')
      if (Notification.permission === 'denied') return setState('denied')
      try {
        const sub = Notification.permission === 'granted' ? await currentSubscription() : null
        if (!cancelled) setState(sub ? 'enabled' : 'off')
      } catch {
        if (!cancelled) setState('off')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const enable = useCallback(async () => {
    setError(null)
    setState('working')
    try {
      const permission = await enablePush()
      if (permission === 'granted') {
        setState('enabled')
        // NotifyPrefs shows quiet hours only for subscribed devices.
        void mutate(PREFS_URL)
        onChange?.(true)
      } else {
        setState(permission === 'denied' ? 'denied' : 'off')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable notifications')
      setState('error')
    }
  }, [onChange])

  const disable = useCallback(async () => {
    setError(null)
    setState('working')
    try {
      await disablePush()
      setState('off')
      void mutate(PREFS_URL)
      onChange?.(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn notifications off')
      setState('error')
    }
  }, [onChange])

  const base = compact
    ? 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium'
    : 'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium'

  if (state === 'checking') {
    return (
      <div className={`${base} text-content-muted ${className}`} role="status" aria-live="polite">
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        <span>Checking notifications…</span>
      </div>
    )
  }

  if (state === 'unsupported' || state === 'unconfigured') {
    return (
      <p className={`text-xs text-content-muted ${className}`} role="status">
        <BellOff size={12} className="inline mr-1 -mt-0.5" aria-hidden="true" />
        {state === 'unsupported'
          ? 'This browser does not support notifications. On iPhone, add this site to your Home Screen first.'
          : 'Notifications are not available on this site yet.'}
      </p>
    )
  }

  if (state === 'denied') {
    return (
      <p className={`text-xs text-content-secondary ${className}`} role="status">
        <BellOff size={12} className="inline mr-1 -mt-0.5" aria-hidden="true" />
        Notifications are blocked. Allow them for this site in your browser settings, then reload.
      </p>
    )
  }

  const working = state === 'working'
  const enabled = state === 'enabled'

  return (
    <div className={`flex flex-col gap-1.5 ${compact ? 'items-start' : ''} ${className}`}>
      <button
        type="button"
        onClick={enabled ? disable : enable}
        disabled={working}
        aria-pressed={enabled}
        className={`${base} border transition-colors disabled:opacity-60 ${
          enabled
            ? 'border-accent-green/40 bg-accent-green/10 text-accent-green hover:bg-accent-green/20'
            : 'border-divider bg-bg-elevated text-content-primary hover:bg-bg-surface'
        }`}
      >
        {working ? (
          <Loader2 size={compact ? 12 : 14} className="animate-spin" aria-hidden="true" />
        ) : enabled ? (
          <BellRing size={compact ? 12 : 14} aria-hidden="true" />
        ) : (
          <Bell size={compact ? 12 : 14} aria-hidden="true" />
        )}
        <span>
          {working ? 'Working…' : enabled ? 'Notifications on' : 'Enable notifications'}
        </span>
      </button>
      {enabled && !compact && (
        <p className="text-xs text-content-muted">Tap again to turn them off on this device.</p>
      )}
      {state === 'error' && error && (
        <p className="text-xs text-live-red" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
