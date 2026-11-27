import { SIGNAL_TYPES } from '@/lib/db/schema'
import { devicesWanting, dedupeKey, pushOptionsFor } from '@/lib/notify/dispatch'
import {
  NOTIFY_KEYS,
  defaultPrefs,
  prefForSignal,
  resolvePrefs,
  UNAVAILABLE_NOTIFY_KEYS,
} from '@/lib/notify/prefs'
import { buildMessage, topicForMatch } from '@/lib/notify/messages'
import { resolveVapidSubject, readVapidConfig } from '@/lib/notify/push'

describe('signal -> pref mapping', () => {
  it('maps every signal type the schema allows to a toggle', () => {
    for (const type of SIGNAL_TYPES) expect(NOTIFY_KEYS).toContain(prefForSignal(type))
  })

  it('follows the documented rules', () => {
    expect(prefForSignal('GOAL')).toBe('goals')
    expect(prefForSignal('SCORE_CORRECTION')).toBe('goals')
    expect(prefForSignal('KICKOFF')).toBe('kickoff')
    expect(prefForSignal('HALF_TIME')).toBe('halfTime')
    expect(prefForSignal('SECOND_HALF')).toBe('halfTime')
    expect(prefForSignal('FULL_TIME')).toBe('fullTime')
    expect(prefForSignal('POSTPONED')).toBe('kickoff')
    expect(prefForSignal('CANCELLED')).toBe('kickoff')
  })

  it('no signal can fire the toggles the provider cannot feed', () => {
    for (const type of SIGNAL_TYPES) expect(UNAVAILABLE_NOTIFY_KEYS).not.toContain(prefForSignal(type))
  })
})

describe('resolvePrefs', () => {
  it('teams default to goals, kick-off and full-time on; competitions to all off', () => {
    expect(defaultPrefs('team')).toMatchObject({ goals: true, kickoff: true, fullTime: true, halfTime: false })
    expect(Object.values(defaultPrefs('competition')).every((v) => v === false)).toBe(true)
  })

  it('stored booleans override defaults; junk is ignored', () => {
    expect(resolvePrefs('team', { goals: false, halfTime: true }).goals).toBe(false)
    expect(resolvePrefs('team', { goals: false, halfTime: true }).halfTime).toBe(true)
    expect(resolvePrefs('team', { goals: 'yes', evil: true }).goals).toBe(true)
    expect(resolvePrefs('team', null)).toEqual(defaultPrefs('team'))
    expect(resolvePrefs('team', [true])).toEqual(defaultPrefs('team'))
  })
})

describe('devicesWanting', () => {
  it('collapses several follows of one device into one entry', () => {
    const devices = devicesWanting('GOAL', [
      { deviceId: 'dev-a', entityType: 'team', notify: {} },
      { deviceId: 'dev-a', entityType: 'competition', notify: { goals: true } },
      { deviceId: 'dev-a', entityType: 'match', notify: {} },
    ])
    expect([...devices]).toEqual(['dev-a'])
  })

  it('a device is in when ANY of its follows wants the signal', () => {
    const devices = devicesWanting('GOAL', [
      { deviceId: 'dev-a', entityType: 'team', notify: { goals: false } },
      { deviceId: 'dev-a', entityType: 'match', notify: { goals: true } },
      { deviceId: 'dev-b', entityType: 'competition', notify: {} },
      { deviceId: 'dev-c', entityType: 'player', notify: { goals: true } },
    ])
    expect([...devices]).toEqual(['dev-a'])
  })
})

describe('dedupe key and push options', () => {
  it('is subscription:signal, so one signal reaches one subscription once', () => {
    expect(dedupeKey('3f1c-uuid', 42)).toBe('3f1c-uuid:42')
    expect(dedupeKey('a', 1)).not.toBe(dedupeKey('a', 2))
    expect(dedupeKey('a', 1)).not.toBe(dedupeKey('b', 1))
  })

  it('uses one short, url-safe topic per match', () => {
    const topic = pushOptionsFor('GOAL', 537_123).topic
    expect(topic).toBe(topicForMatch(537_123))
    expect(topic.length).toBeLessThanOrEqual(32)
    expect(topic).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(pushOptionsFor('GOAL', 1).urgency).toBe('high')
  })
})

describe('buildMessage', () => {
  const ctx = { matchId: 77, homeName: 'Arsenal', awayName: 'Chelsea', competitionName: 'Premier League' }
  const base = { status: 'IN_PLAY', prevStatus: 'IN_PLAY', prevHome: 1, prevAway: 1 }

  it('formats a goal with the scoreline, a deep link and a per-match tag', () => {
    const m = buildMessage('GOAL', { ...base, home: 2, away: 1, side: 'home', delta: 1 }, ctx)
    expect(m.title).toBe('GOAL! Arsenal 2–1 Chelsea')
    expect(m.body).toBe('Arsenal scored · Premier League')
    expect(m.url).toBe('/match/77')
    expect(m.tag).toBe('match-77')
  })

  it('says how many when one side scored twice between syncs', () => {
    const m = buildMessage('GOAL', { ...base, home: 3, away: 1, side: 'home', delta: 2 }, ctx)
    expect(m.body).toContain('scored 2 goals')
  })

  it('writes a correction message for a disallowed goal', () => {
    const m = buildMessage(
      'SCORE_CORRECTION',
      { ...base, prevHome: 2, prevAway: 1, home: 1, away: 1, side: 'home', delta: -1 },
      ctx
    )
    expect(m.title).toBe('Goal disallowed: Arsenal 1–1 Chelsea')
    expect(m.body).toContain('corrected from 2–1')
  })

  it('localises to Urdu and falls back to English for unknown locales', () => {
    const p = { ...base, home: 2, away: 1, side: 'home' as const, delta: 1 }
    expect(buildMessage('GOAL', p, ctx, 'ur').title).toContain('گول!')
    expect(buildMessage('GOAL', p, ctx, 'fr').title).toContain('GOAL!')
  })
})

describe('VAPID configuration', () => {
  it('prefers VAPID_SUBJECT, then an https site URL', () => {
    expect(resolveVapidSubject({ VAPID_SUBJECT: 'mailto:ops@example.com' })).toBe('mailto:ops@example.com')
    expect(resolveVapidSubject({ VAPID_SUBJECT: '', URL: 'https://example.com' })).toBe('https://example.com')
    expect(resolveVapidSubject({ VAPID_SUBJECT: 'nonsense', URL: 'https://example.com' })).toBe(
      'https://example.com'
    )
  })

  it('refuses http URLs and missing values instead of crashing', () => {
    expect(resolveVapidSubject({ URL: 'http://localhost:3000' })).toBeNull()
    expect(resolveVapidSubject({})).toBeNull()
    expect(resolveVapidSubject({ URL: 'mailto:a@b.c' })).toBeNull()
    expect(readVapidConfig({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' })).toBeNull()
  })
})
