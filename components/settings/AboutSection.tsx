'use client'

import { ExternalLink } from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import type { MessageKey } from '@/lib/i18n/types'
import { SettingsSection } from './SettingsSection'

/**
 * Data attributions. OpenLigaDB's ODbL 1.0 requires attribution and a licence
 * reference wherever its data is shown; Wikidata is CC0 and needs neither, but
 * crediting it is good practice and tells users where names come from.
 */
const SOURCES: {
  name: string
  href: string
  description: MessageKey
  licence?: { name: string; href: string }
}[] = [
  { name: 'football-data.org', href: 'https://www.football-data.org/', description: 'settings.about.footballData' },
  {
    name: 'OpenLigaDB',
    href: 'https://www.openligadb.de/',
    description: 'settings.about.openLigaDb',
    licence: { name: 'ODbL 1.0', href: 'https://opendatacommons.org/licenses/odbl/1-0/' },
  },
  { name: 'TheSportsDB', href: 'https://www.thesportsdb.com/', description: 'settings.about.theSportsDb' },
  {
    name: 'Wikidata',
    href: 'https://www.wikidata.org/',
    description: 'settings.about.wikidata',
    licence: { name: 'CC0 1.0', href: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  },
]

const LINK =
  'inline-flex items-center gap-1 rounded-sm text-content-primary hover:text-accent-green transition-colors'

export function AboutSection() {
  const t = useT()

  return (
    <SettingsSection title={t('settings.about.title')}>
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-content-muted mb-1">
        {t('settings.about.dataSources')}
      </h3>
      <ul className="divide-y divide-divider">
        {SOURCES.map((source) => (
          <li key={source.name} className="py-2">
            <a
              href={source.href}
              target="_blank"
              rel="noopener noreferrer"
              // Brand names are Latin; dir keeps the icon on the correct side.
              dir="ltr"
              aria-label={t('settings.about.externalLink', { name: source.name })}
              className={`${LINK} text-[13px] font-medium`}
            >
              {source.name}
              <ExternalLink size={11} aria-hidden="true" className="opacity-60" />
            </a>
            <p className="text-[11px] text-content-muted mt-0.5">
              {t(source.description)}
              {source.licence && (
                <>
                  {' · '}
                  <a
                    href={source.licence.href}
                    target="_blank"
                    rel="noopener noreferrer license"
                    dir="ltr"
                    aria-label={t('settings.about.externalLink', { name: source.licence.name })}
                    className="underline underline-offset-2 hover:text-content-primary rounded-sm"
                  >
                    {source.licence.name}
                  </a>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-content-muted mt-3 leading-relaxed">{t('settings.about.disclaimer')}</p>
    </SettingsSection>
  )
}
