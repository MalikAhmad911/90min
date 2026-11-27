'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  TIMEZONE_STORAGE_KEY,
  detectTimeZone,
  getPreferredTimeZone,
  isValidTimeZone,
  setPreferredTimeZone,
} from '@/lib/timezone'
import { useLocale, useT, useTimeFormat } from '@/lib/i18n/client'
import { formatKickoff } from '@/lib/i18n/format'
import { InlineError, SettingSkeleton, SettingsSection } from './SettingsSection'
import { useHydrated } from './useHydrated'

/** Used when the engine cannot list zones (Intl.supportedValuesOf is ES2022). */
const FALLBACK_ZONES = [
  'UTC',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'America/New_York',
  'America/Sao_Paulo',
]

export function listTimeZones(): string[] {
  try {
    const zones = Intl.supportedValuesOf('timeZone')
    // Some engines omit UTC from the list even though they accept it.
    return zones.length > 0 ? Array.from(new Set(['UTC', ...zones])) : FALLBACK_ZONES
  } catch {
    return FALLBACK_ZONES
  }
}

/** "America/Sao_Paulo" -> "America/Sao Paulo". Zone ids are Latin in every locale. */
function zoneLabel(zone: string): string {
  return zone.replace(/_/g, ' ')
}

/** The stored explicit choice, or '' for automatic. */
function readStoredZone(): string {
  try {
    const stored = window.localStorage.getItem(TIMEZONE_STORAGE_KEY)
    return isValidTimeZone(stored) ? stored : ''
  } catch {
    return ''
  }
}

export function TimeZoneSetting() {
  const t = useT()
  const { locale } = useLocale()
  const timeFormat = useTimeFormat()
  const hydrated = useHydrated()

  const [choice, setChoice] = useState('')
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const detected = hydrated ? detectTimeZone() : 'UTC'
  const zones = useMemo(() => (hydrated ? listTimeZones() : []), [hydrated])

  useEffect(() => {
    setChoice(readStoredZone())
  }, [])

  // Keep the "time there now" preview honest without re-rendering every second.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  function onChange(next: string) {
    setFailed(false)
    if (next !== '' && !isValidTimeZone(next)) return
    setPreferredTimeZone(next === '' ? null : next)
    // lib/timezone swallows storage errors, so read back to detect a refusal.
    if (next !== '' && getPreferredTimeZone() !== next) {
      setFailed(true)
      return
    }
    setChoice(next)
  }

  const effective = choice || detected

  return (
    <SettingsSection title={t('settings.timeZone.title')} hint={t('settings.timeZone.hint')}>
      {hydrated ? (
        <>
          <label htmlFor="settings-time-zone" className="sr-only">
            {t('settings.timeZone.label')}
          </label>
          <select
            id="settings-time-zone"
            value={choice}
            onChange={(e) => onChange(e.target.value)}
            // Zone ids are Latin script; keep them LTR inside an Urdu page.
            dir="ltr"
            className="w-full bg-bg-elevated text-content-primary text-[13px] rounded-lg px-3 py-2 border border-divider focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
          >
            <option value="">{t('settings.timeZone.automatic', { zone: zoneLabel(detected) })}</option>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zoneLabel(zone)}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-content-muted mt-2">
            {t('settings.timeZone.detected', { zone: zoneLabel(detected) })}
            {' · '}
            {t('settings.timeZone.now', {
              time: formatKickoff(now, locale, { timeFormat, timeZone: effective }),
            })}
          </p>
        </>
      ) : (
        <SettingSkeleton />
      )}
      {failed && <InlineError>{t('settings.storageError')}</InlineError>}
    </SettingsSection>
  )
}
