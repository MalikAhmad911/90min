'use client'

import { useT } from '@/lib/i18n/client'
import { AboutSection } from './AboutSection'
import { LanguageSetting } from './LanguageSetting'
import { LiteModeSetting } from './LiteModeSetting'
import { SettingsSection } from './SettingsSection'
import { TimeFormatSetting } from './TimeFormatSetting'
import { TimeZoneSetting } from './TimeZoneSetting'

/**
 * The Settings screen. No light-theme option on purpose: tailwind.config.ts
 * defines a single (dark) palette, so a theme switch would change nothing.
 */
export function SettingsView() {
  const t = useT()

  return (
    <div>
      <div className="px-4 py-3 border-b border-divider">
        <h1 className="text-[15px] font-bold text-content-primary">{t('settings.title')}</h1>
        <p className="text-[11px] text-content-muted mt-0.5">{t('settings.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-2 mt-2 mx-2 mb-3">
        <LanguageSetting />
        <TimeZoneSetting />
        <TimeFormatSetting />
        <LiteModeSetting />

        {/*
          ── NOTIFICATIONS SLOT ──────────────────────────────────────────────
          The push-notifications agent owns the toggle component. Integrator:
          replace the placeholder paragraph below with that component, keeping
          this SettingsSection wrapper so the card matches its neighbours.
        */}
        <SettingsSection title={t('settings.notifications.title')}>
          <p data-slot="notifications" className="text-[12px] text-content-muted">
            {t('settings.notifications.placeholder')}
          </p>
        </SettingsSection>

        <AboutSection />
      </div>
    </div>
  )
}
