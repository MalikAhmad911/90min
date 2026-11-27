'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { BellOff, Moon } from 'lucide-react'
import { deviceFetch, PREFS_URL } from '@/lib/notify/client'
import {
  NOTIFY_KEYS,
  NOTIFY_LABELS,
  UNAVAILABLE_NOTIFY_KEYS,
  type FollowEntityType,
  type NotifyKey,
  type NotifyPrefs as Prefs,
} from '@/lib/notify/prefs'
import { getPreferredTimeZone } from '@/lib/timezone'

/**
 * Per-follow alert toggles (PRD NT-1) and quiet hours (NT-4).
 *
 * Reads and writes /api/push/prefs for this device. Toggles are optimistic
 * with rollback: a switch that waits a round trip feels broken, and one that
 * silently fails is worse, so a failure reverts it and says so.
 *
 * Pass `entity` to show one follow's toggles (e.g. under a follow button);
 * omit it for the full settings list.
 */

interface FollowView {
  entityType: FollowEntityType
  entityKey: string
  label: string
  prefs: Prefs
}

interface PrefsResponse {
  subscribed: boolean
  quietStartHour: number | null
  quietEndHour: number | null
  timezone: string | null
  follows: FollowView[]
}

const ENTITY_LABEL: Record<FollowEntityType, string> = {
  team: 'Team',
  competition: 'League',
  match: 'Match',
  player: 'Player',
}

function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

interface NotifyPrefsProps {
  entity?: { type: FollowEntityType; key: string }
  showQuietHours?: boolean
  className?: string
}

export function NotifyPrefs({ entity, showQuietHours = !entity, className = '' }: NotifyPrefsProps) {
  const { data, error, isLoading, mutate } = useSWR<PrefsResponse>(PREFS_URL, (url: string) =>
    deviceFetch<PrefsResponse>(url)
  )
  const [saveError, setSaveError] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className={`space-y-2 ${className}`} role="status" aria-label="Loading notification settings">
        {[0, 1].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-bg-elevated animate-pulse" />
        ))}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className={`rounded-lg border border-divider bg-bg-surface p-4 ${className}`} role="alert">
        <p className="text-sm text-content-secondary">Could not load notification settings.</p>
        <button
          type="button"
          onClick={() => mutate()}
          className="mt-2 text-xs font-medium text-accent-green hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  const follows = entity
    ? data.follows.filter((f) => f.entityType === entity.type && f.entityKey === entity.key)
    : data.follows.filter((f) => f.entityType !== 'player')

  async function toggle(f: FollowView, key: NotifyKey) {
    if (!data) return
    setSaveError(null)
    const value = !f.prefs[key]
    const optimistic: PrefsResponse = {
      ...data,
      follows: data.follows.map((x) =>
        x === f ? { ...x, prefs: { ...x.prefs, [key]: value } } : x
      ),
    }
    try {
      await mutate(
        async () => {
          await deviceFetch(PREFS_URL, {
            method: 'PATCH',
            body: JSON.stringify({
              follow: { entityType: f.entityType, entityKey: f.entityKey, notify: { [key]: value } },
            }),
          })
          return optimistic
        },
        { optimisticData: optimistic, rollbackOnError: true, revalidate: false }
      )
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  async function setQuiet(start: number | null, end: number | null) {
    if (!data) return
    setSaveError(null)
    const optimistic = { ...data, quietStartHour: start, quietEndHour: end }
    try {
      await mutate(
        async () => {
          await deviceFetch(PREFS_URL, {
            method: 'PATCH',
            body: JSON.stringify({
              quietHours: { quietStartHour: start, quietEndHour: end, timezone: getPreferredTimeZone() },
            }),
          })
          return optimistic
        },
        { optimisticData: optimistic, rollbackOnError: true, revalidate: false }
      )
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {!data.subscribed && (
        <p className="flex items-start gap-2 rounded-lg border border-divider bg-bg-surface p-3 text-xs text-content-secondary">
          <BellOff size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Notifications are off on this device. These choices are saved and apply once you enable
          them.
        </p>
      )}

      {follows.length === 0 ? (
        <div className="rounded-lg border border-divider bg-bg-surface p-4 text-center">
          <p className="text-sm text-content-secondary">
            {entity ? 'Follow this to choose its alerts.' : 'You are not following anything yet.'}
          </p>
          {!entity && (
            <p className="mt-1 text-xs text-content-muted">
              Follow a team, league or match to get goal and kick-off alerts.
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {follows.map((f) => (
            <li
              key={`${f.entityType}:${f.entityKey}`}
              className="rounded-lg border border-divider bg-bg-surface p-3"
            >
              {!entity && (
                <p className="mb-2 text-sm font-medium text-content-primary">
                  {f.label}
                  <span className="ml-2 text-xs font-normal text-content-muted">
                    {ENTITY_LABEL[f.entityType]}
                  </span>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {NOTIFY_KEYS.map((key) => {
                  const unavailable = UNAVAILABLE_NOTIFY_KEYS.includes(key)
                  const on = f.prefs[key] && !unavailable
                  return (
                    <button
                      key={key}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      disabled={unavailable}
                      onClick={() => toggle(f, key)}
                      title={unavailable ? 'Not available yet: our data provider does not send this' : undefined}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed ${
                        on
                          ? 'border-accent-green/40 bg-accent-green/10 text-accent-green'
                          : 'border-divider bg-bg-elevated text-content-secondary hover:text-content-primary'
                      } ${unavailable ? 'opacity-50' : ''}`}
                    >
                      {NOTIFY_LABELS[key]}
                      {unavailable && <span className="ml-1 text-content-muted">(not available yet)</span>}
                    </button>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showQuietHours && (
        <QuietHours
          subscribed={data.subscribed}
          start={data.quietStartHour}
          end={data.quietEndHour}
          onChange={setQuiet}
        />
      )}

      {saveError && (
        <p className="text-xs text-live-red" role="alert">
          {saveError}
        </p>
      )}
    </div>
  )
}

function QuietHours({
  subscribed,
  start,
  end,
  onChange,
}: {
  subscribed: boolean
  start: number | null
  end: number | null
  onChange: (start: number | null, end: number | null) => void
}) {
  const enabled = start !== null && end !== null
  const hours = Array.from({ length: 24 }, (_, h) => h)
  const selectClass =
    'rounded-md border border-divider bg-bg-elevated px-2 py-1 text-xs text-content-primary disabled:opacity-50'

  return (
    <section className="rounded-lg border border-divider bg-bg-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Moon size={14} className="text-content-secondary" aria-hidden="true" />
          <h3 className="text-sm font-medium text-content-primary">Quiet hours</h3>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={!subscribed}
          onClick={() => (enabled ? onChange(null, null) : onChange(22, 7))}
          className={`rounded-full border px-3 py-1 text-xs disabled:opacity-50 ${
            enabled
              ? 'border-accent-green/40 bg-accent-green/10 text-accent-green'
              : 'border-divider bg-bg-elevated text-content-secondary'
          }`}
        >
          {enabled ? 'On' : 'Off'}
        </button>
      </div>
      {!subscribed ? (
        <p className="mt-2 text-xs text-content-muted">Enable notifications to set quiet hours.</p>
      ) : enabled ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-content-secondary">
          <label className="flex items-center gap-1.5">
            From
            <select
              className={selectClass}
              value={start ?? 22}
              onChange={(e) => onChange(Number(e.target.value), end)}
            >
              {hours.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            until
            <select
              className={selectClass}
              value={end ?? 7}
              onChange={(e) => onChange(start, Number(e.target.value))}
            >
              {hours.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </label>
          <span className="text-content-muted">in your time zone. Alerts in this window are dropped.</span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-content-muted">No alerts are held back.</p>
      )}
    </section>
  )
}

