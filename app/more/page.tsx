import type { Metadata } from 'next'
import { SettingsView } from '@/components/settings/SettingsView'
import { getDirection } from '@/lib/i18n/config'
import { LocaleProvider } from '@/lib/i18n/client'
import { getLocale, getT } from '@/lib/i18n/server'

export function generateMetadata(): Metadata {
  const t = getT()
  return { title: t('meta.titleTemplate', { page: t('settings.title') }) }
}

/**
 * Settings (the "More" tab).
 *
 * Wraps itself in a LocaleProvider and sets `lang`/`dir` on its own root so it
 * renders correctly in Urdu before app/layout.tsx is wired. Once the layout
 * provides both at the <html> level these become redundant but harmless.
 */
export default function SettingsPage() {
  const locale = getLocale()

  return (
    <LocaleProvider locale={locale}>
      <div lang={locale} dir={getDirection(locale)}>
        <SettingsView />
      </div>
    </LocaleProvider>
  )
}
