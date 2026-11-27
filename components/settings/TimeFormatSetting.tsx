'use client'

import { useState } from 'react'
import { useLocale, useT, useTimeFormat } from '@/lib/i18n/client'
import { formatKickoff, type TimeFormat } from '@/lib/i18n/format'
import { setPreferredTimeFormat } from '@/lib/i18n/time-format'
import { OptionGroup } from './OptionGroup'
import { InlineError, SettingSkeleton, SettingsSection } from './SettingsSection'
import { useHydrated } from './useHydrated'

/** A typical evening kickoff, so the two options visibly differ (20:45 vs 08:45 PM). */
const SAMPLE_KICKOFF = '2026-01-01T20:45:00Z'

export function TimeFormatSetting() {
  const t = useT()
  const { locale } = useLocale()
  const timeFormat = useTimeFormat()
  const hydrated = useHydrated()
  const [failed, setFailed] = useState(false)

  // formatKickoff isolates the time as LTR, so "مثال: 08:45 PM" keeps the
  // Urdu label on the right and the clock reading left-to-right.
  const example = (format: TimeFormat) =>
    t('settings.timeFormat.example', {
      time: formatKickoff(SAMPLE_KICKOFF, locale, { timeFormat: format, timeZone: 'UTC' }),
    })

  return (
    <SettingsSection title={t('settings.timeFormat.title')}>
      {hydrated ? (
        <OptionGroup<TimeFormat>
          legend={t('settings.timeFormat.title')}
          name="time-format"
          value={timeFormat}
          onChange={(next) => setFailed(!setPreferredTimeFormat(next))}
          options={[
            { value: '24h', label: t('settings.timeFormat.h24'), description: example('24h') },
            { value: '12h', label: t('settings.timeFormat.h12'), description: example('12h') },
          ]}
        />
      ) : (
        <SettingSkeleton />
      )}
      {failed && <InlineError>{t('settings.storageError')}</InlineError>}
    </SettingsSection>
  )
}
