import type { SignalPayload } from './differ'
import type { SignalType } from './prefs'

/**
 * Notification text for a signal. Pure, so the wording is unit-tested.
 *
 * Two locales, matching the subscription's `locale` column. Team names are
 * proper nouns and stay as the provider sends them.
 */

export type NotifyLocale = 'en' | 'ur'
export const NOTIFY_LOCALES = ['en', 'ur'] as const satisfies readonly NotifyLocale[]

export interface MessageContext {
  matchId: number
  homeName: string
  awayName: string
  competitionName?: string | null
}

export interface PushMessage {
  title: string
  body: string
  /** Deep link to the match page (PRD MC-7). */
  url: string
  /** One tag per match, so a newer alert replaces the older one in the tray. */
  tag: string
}

/** Web Push `Topic` header: per match, url-safe base64 alphabet, at most 32 chars. */
export function topicForMatch(matchId: number): string {
  return `match-${matchId}`.slice(0, 32)
}

export function tagForMatch(matchId: number): string {
  return `match-${matchId}`
}

/** En dash between the scores, as broadcasters write them. */
function scoreline(home: string, h: number | null, a: number | null, away: string): string {
  return `${home} ${h ?? 0}–${a ?? 0} ${away}`
}

const TEXT = {
  en: {
    goal: 'GOAL!',
    disallowed: 'Goal disallowed',
    kickoff: 'Kick-off',
    halfTime: 'Half-time',
    resumed: 'Play resumes',
    fullTime: 'Full-time',
    postponed: 'Postponed',
    cancelled: 'Cancelled',
    scored: (team: string, n: number) => (n > 1 ? `${team} scored ${n} goals` : `${team} scored`),
    corrected: (h: number | null, a: number | null) =>
      `The score has been corrected from ${h ?? 0}–${a ?? 0}.`,
    underway: 'The match is under way.',
    postponedBody: 'This match has been postponed.',
    cancelledBody: 'This match has been cancelled.',
  },
  ur: {
    goal: 'گول!',
    disallowed: 'گول منسوخ',
    kickoff: 'میچ شروع',
    halfTime: 'ہاف ٹائم',
    resumed: 'کھیل دوبارہ شروع',
    fullTime: 'میچ ختم',
    postponed: 'میچ ملتوی',
    cancelled: 'میچ منسوخ',
    scored: (team: string, n: number) => (n > 1 ? `${team} نے ${n} گول کیے` : `${team} نے گول کیا`),
    corrected: (h: number | null, a: number | null) =>
      `اسکور ${h ?? 0}–${a ?? 0} سے درست کر دیا گیا ہے۔`,
    underway: 'میچ شروع ہو گیا ہے۔',
    postponedBody: 'یہ میچ ملتوی کر دیا گیا ہے۔',
    cancelledBody: 'یہ میچ منسوخ کر دیا گیا ہے۔',
  },
} as const

export function buildMessage(
  type: SignalType,
  payload: SignalPayload,
  ctx: MessageContext,
  locale: string = 'en'
): PushMessage {
  const t = TEXT[locale === 'ur' ? 'ur' : 'en']
  const score = scoreline(ctx.homeName, payload.home, payload.away, ctx.awayName)
  const fixture = `${ctx.homeName} v ${ctx.awayName}`
  const suffix = ctx.competitionName ? ` · ${ctx.competitionName}` : ''
  const sideName = payload.side === 'away' ? ctx.awayName : ctx.homeName

  let title: string
  let body: string
  switch (type) {
    case 'GOAL':
      title = `${t.goal} ${score}`
      body = t.scored(sideName, payload.delta ?? 1) + suffix
      break
    case 'SCORE_CORRECTION':
      title = `${t.disallowed}: ${score}`
      body = t.corrected(payload.prevHome, payload.prevAway)
      break
    case 'KICKOFF':
      title = `${t.kickoff}: ${fixture}`
      body = t.underway + suffix
      break
    case 'HALF_TIME':
      title = `${t.halfTime}: ${score}`
      body = ctx.competitionName ?? ''
      break
    case 'SECOND_HALF':
      title = `${t.resumed}: ${score}`
      body = ctx.competitionName ?? ''
      break
    case 'FULL_TIME':
      title = `${t.fullTime}: ${score}`
      body = ctx.competitionName ?? ''
      break
    case 'POSTPONED':
      title = `${t.postponed}: ${fixture}`
      body = t.postponedBody
      break
    case 'CANCELLED':
      title = `${t.cancelled}: ${fixture}`
      body = t.cancelledBody
      break
  }

  return { title, body, url: `/match/${ctx.matchId}`, tag: tagForMatch(ctx.matchId) }
}
