'use client'

import { useState } from 'react'
import { LOCALES, isLocale, type Locale } from '@/lib/i18n/config'
import { persistLocale, useLocale, useT } from '@/lib/i18n/client'
import { OptionGroup } from './OptionGroup'
import { InlineError, SettingsSection } from './SettingsSection'

/**
 * Language switch. Writes the cookie and reloads: `<html lang dir>` is set by
 * the server render, so only a fresh request can flip the whole layout to RTL
 * without a frame of mirrored-wrong content.
 */
export function LanguageSetting({ reload = () => window.location.reload() }: { reload?: () => void }) {
  const t = useT()
  const { locale } = useLocale()
  const [pending, setPending] = useState<Locale | null>(null)
  const [failed, setFailed] = useState(false)

  function choose(next: string) {
    if (!isLocale(next) || next === locale) return
    setFailed(false)
    if (!persistLocale(next)) {
      setFailed(true)
      return
    }
    setPending(next)
    reload()
  }

  return (
    <SettingsSection title={t('settings.language.title')} hint={t('settings.language.hint')}>
      <OptionGroup
        legend={t('settings.language.title')}
        name="language"
        value={pending ?? locale}
        disabled={pending !== null}
        onChange={choose}
        options={LOCALES.map((l) => ({ value: l.code, label: l.nativeName, lang: l.code, dir: l.dir }))}
      />
      {pending && (
        <p role="status" className="text-[12px] text-content-muted mt-2">
          {t('settings.language.applying')}
        </p>
      )}
      {failed && <InlineError>{t('settings.language.error')}</InlineError>}
    </SettingsSection>
  )
}
