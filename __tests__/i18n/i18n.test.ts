import { en } from '@/lib/i18n/dictionaries/en'
import { ur } from '@/lib/i18n/dictionaries/ur'
import {
  buildLocaleCookie,
  getDirection,
  isLocale,
  readLocaleFromCookieHeader,
  resolveLocale,
} from '@/lib/i18n/config'
import { createTranslator, translateOr } from '@/lib/i18n/translate'
import { competitionName, regionName } from '@/lib/i18n/names'
import {
  formatDate,
  formatDayLabel,
  formatMinute,
  formatNumber,
  formatScore,
  formatTime,
  ltrIsolate,
} from '@/lib/i18n/format'
import { resolveLiteMode } from '@/hooks/useLiteMode'

const values = (m: unknown): string[] =>
  typeof m === 'string' ? [m] : Object.values(m as Record<string, string>)

describe('dictionary completeness', () => {
  it('has every English key in Urdu, non-empty, with the same shape', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const u = ur[key]
      expect(u).toBeDefined()
      expect(typeof u).toBe(typeof en[key])
      for (const v of values(u)) expect(v.trim().length).toBeGreaterThan(0)
    }
    expect(Object.keys(ur).sort()).toEqual(Object.keys(en).sort())
  })

  it('keeps the same placeholders in both languages', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(vars(values(ur[key]).join(' '))).toBe(vars(values(en[key]).join(' ')))
    }
  })

  it('writes Urdu in Urdu script, not Roman Urdu', () => {
    const latinOnly = (Object.keys(ur) as (keyof typeof ur)[]).filter((key) => {
      const text = values(ur[key]).join(' ').replace(/\{\w+\}/g, '')
      return /[a-z]{3,}/i.test(text) && !/[؀-ۿ]/.test(text)
    })
    // Brand names and symbols legitimately stay Latin.
    expect(latinOnly.sort()).toEqual(['app.logoAlt', 'app.name', 'meta.titleTemplate'])
  })
})

describe('t()', () => {
  const t = createTranslator('en')
  const tu = createTranslator('ur')

  it('interpolates {name} placeholders', () => {
    expect(t('common.vs', { home: 'Arsenal', away: 'Chelsea' })).toBe('Arsenal vs Chelsea')
    expect(tu('common.vs', { home: 'Arsenal', away: 'Chelsea' })).toBe('Arsenal بمقابلہ Chelsea')
  })

  it('formats numbers with Latin digits and no grouping', () => {
    expect(tu('team.founded', { year: 1892 })).toBe('قیام 1892')
  })

  it('selects plurals with Intl.PluralRules', () => {
    expect(t('home.liveCount', { count: 1 })).toBe('1 live match')
    expect(t('home.liveCount', { count: 3 })).toBe('3 live matches')
    expect(tu('home.liveCount', { count: 1 })).toBe('1 لائیو میچ')
    expect(tu('home.liveCount', { count: 5 })).toBe('5 لائیو میچز')
    expect(t('home.liveCount')).toBe('{count} live matches')
  })

  it('falls back to English when the Urdu entry is missing or empty', () => {
    const missing: string[] = []
    const partial = createTranslator('ur', {
      dictionaries: { ur: { 'date.today': '' } },
      onMissing: (key) => missing.push(key),
    })
    expect(partial('date.today')).toBe('Today')
    expect(partial('nav.scores')).toBe('Scores')
    expect(missing).toContain('date.today')
  })

  it('never returns a raw key in production', () => {
    const prod = createTranslator('ur', { dictionaries: { ur: {}, en: {} }, production: true })
    expect(prod('date.today')).toBe('')
    const dev = createTranslator('ur', { dictionaries: { ur: {}, en: {} }, production: false, onMissing: () => {} })
    expect(dev('date.today')).toBe('date.today')
  })

  it('drops unknown placeholders in production only', () => {
    const prod = createTranslator('en', { production: true })
    expect(prod('common.vs', { home: 'A' })).toBe('A vs ')
    expect(createTranslator('en', { production: false })('common.vs', { home: 'A' })).toBe('A vs {away}')
  })

  it('translates runtime keys with a provider fallback', () => {
    expect(competitionName(tu, 'pl', 'Premier League')).toBe('پریمیئر لیگ')
    expect(competitionName(tu, 'XYZ', 'Some Cup')).toBe('Some Cup')
    expect(regionName(tu, 'England')).toBe('انگلینڈ')
    expect(translateOr(t, 'not.a.key', 'fallback')).toBe('fallback')
  })
})

describe('locale cookie allow-list', () => {
  it('accepts only exact supported codes', () => {
    expect(isLocale('ur')).toBe(true)
    expect(isLocale('en')).toBe(true)
    for (const bad of ['UR', 'ur-PK', 'fr', '', 'ur; Path=/', undefined, 42]) {
      expect(resolveLocale(bad)).toBe('en')
    }
  })

  it('reads the locale from a cookie header', () => {
    expect(readLocaleFromCookieHeader('a=1; 90min-locale=ur; b=2')).toBe('ur')
    expect(readLocaleFromCookieHeader('90min-locale=<script>')).toBe('en')
    expect(readLocaleFromCookieHeader(undefined)).toBe('en')
  })

  it('builds a long-lived, site-wide cookie', () => {
    expect(buildLocaleCookie('ur', true)).toBe('90min-locale=ur; Path=/; Max-Age=31536000; SameSite=Lax; Secure')
  })

  it('maps Urdu to right-to-left', () => {
    expect(getDirection('ur')).toBe('rtl')
    expect(getDirection('en')).toBe('ltr')
  })
})

describe('format helpers', () => {
  const kickoff = '2026-11-20T15:45:00Z'

  it('uses Latin digits in Urdu', () => {
    expect(formatNumber(12345, 'ur')).toBe('12,345')
    expect(formatTime(kickoff, 'ur', { timeZone: 'Asia/Karachi' })).toBe('20:45')
    expect(formatDate(kickoff, 'ur', { timeZone: 'UTC', preset: 'dayMonth' })).toMatch(/20/)
    expect(formatDate(kickoff, 'ur', { timeZone: 'UTC' })).not.toMatch(/[۰-۹٠-٩]/)
  })

  it('honours the 12h/24h preference', () => {
    expect(formatTime(kickoff, 'en', { timeZone: 'UTC', timeFormat: '24h' })).toBe('15:45')
    expect(formatTime(kickoff, 'en', { timeZone: 'UTC', timeFormat: '12h' })).toMatch(/^03:45\s?pm$/i)
    expect(formatTime('2026-11-20T00:05:00Z', 'en', { timeZone: 'UTC' })).toBe('00:05')
  })

  it('isolates scores and minutes as LTR', () => {
    expect(formatScore(2, 1)).toBe(ltrIsolate('2 – 1'))
    expect(formatScore(null, undefined)).toBe(ltrIsolate('- – -'))
    expect(formatMinute(45, 2)).toBe(ltrIsolate("45+2'"))
  })

  it('labels today, yesterday and tomorrow', () => {
    const t = createTranslator('ur')
    expect(formatDayLabel('2026-11-20', '2026-11-20', 'ur', t)).toBe('آج')
    expect(formatDayLabel('2026-11-19', '2026-11-20', 'ur', t)).toBe('گزشتہ کل')
    expect(formatDayLabel('2026-11-21', '2026-11-20', 'ur', t)).toBe('آنے والا کل')
    expect(formatDayLabel('2026-11-23', '2026-11-20', 'en', createTranslator('en'))).toBe('Mon 23 Nov')
  })
})

describe('lite mode', () => {
  it('lets an explicit choice beat network detection', () => {
    expect(resolveLiteMode('auto', true)).toBe(true)
    expect(resolveLiteMode('auto', false)).toBe(false)
    expect(resolveLiteMode('off', true)).toBe(false)
    expect(resolveLiteMode('on', false)).toBe(true)
  })
})
