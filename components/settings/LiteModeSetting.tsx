'use client'

import { useId, useState } from 'react'
import { useLiteMode } from '@/hooks/useLiteMode'
import { useT } from '@/lib/i18n/client'
import { InlineError, SettingSkeleton, SettingsSection } from './SettingsSection'
import { useHydrated } from './useHydrated'

export function LiteModeSetting() {
  const t = useT()
  const hydrated = useHydrated()
  const { enabled, preference, automatic, setPreference } = useLiteMode()
  const [failed, setFailed] = useState(false)
  const labelId = useId()

  const save = (next: Parameters<typeof setPreference>[0]) => setFailed(!setPreference(next))

  return (
    <SettingsSection title={t('settings.lite.title')}>
      {hydrated ? (
        <>
          <div className="flex items-center justify-between gap-4">
            <p id={labelId} className="text-[12px] text-content-secondary leading-relaxed">
              {t('settings.lite.hint')}
            </p>
            {/* A switch, not a checkbox: the change applies immediately. */}
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-labelledby={labelId}
              onClick={() => save(enabled ? 'off' : 'on')}
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface ${
                enabled ? 'bg-accent-green' : 'bg-bg-elevated border border-divider'
              }`}
            >
              <span className="sr-only">{enabled ? t('common.on') : t('common.off')}</span>
              {/* The knob uses logical inset so it slides the right way in RTL. */}
              <span
                aria-hidden="true"
                className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                  enabled ? 'start-[1.375rem] bg-bg-primary' : 'start-0.5 bg-content-secondary'
                }`}
              />
            </button>
          </div>
          {automatic && <p className="text-[11px] text-accent-green mt-2">{t('settings.lite.auto')}</p>}
          {preference !== 'auto' && (
            <button
              type="button"
              onClick={() => save('auto')}
              className="mt-2 text-[12px] text-content-muted underline underline-offset-2 hover:text-content-primary rounded-sm"
            >
              {t('settings.lite.useAutomatic')}
            </button>
          )}
        </>
      ) : (
        <SettingSkeleton />
      )}
      {failed && <InlineError>{t('settings.storageError')}</InlineError>}
    </SettingsSection>
  )
}
