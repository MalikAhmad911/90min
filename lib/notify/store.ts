import { and, asc, eq, gte, inArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { getDb } from '@/lib/db'
import {
  competitions,
  follows,
  matchSignals,
  matches,
  notificationLog,
  pushSubscriptions,
  teams,
} from '@/lib/db/schema'
import type { SignalPayload } from './differ'
import type { FollowEntityType, SignalType } from './prefs'

/**
 * Every query the dispatcher makes, behind one interface.
 *
 * The dispatcher's rules (who gets what, quiet hours, dedupe, pruning) are
 * the part worth testing, and they should be testable without a database:
 * tests hand `dispatchPendingSignals` an in-memory store, production uses
 * `dbDispatchStore` below.
 */

export interface PendingSignal {
  id: number
  matchId: number
  seq: number
  type: SignalType
  payload: SignalPayload
  createdAt: Date
}

export interface MatchContext {
  matchId: number
  homeTeamId: number
  awayTeamId: number
  competitionCode: string
  homeName: string
  awayName: string
  competitionName: string | null
}

export interface FollowRef {
  deviceId: string
  entityType: FollowEntityType
  entityKey: string
  notify: unknown
}

export interface SubscriptionRef {
  id: string
  deviceId: string
  endpoint: string
  p256dh: string
  auth: string
  timezone: string
  locale: string
  quietStartHour: number | null
  quietEndHour: number | null
}

export type ClaimStatus = 'failed' | 'skipped'

export interface DispatchStore {
  recentSignals(since: Date, limit: number): Promise<PendingSignal[]>
  matchContexts(matchIds: number[]): Promise<Map<number, MatchContext>>
  /** Follows of the home team, away team, competition or the match itself. */
  followers(ctx: MatchContext): Promise<FollowRef[]>
  subscriptionsForDevices(deviceIds: string[]): Promise<SubscriptionRef[]>
  /** Of these subscriptions, the ones that were sent a GOAL push for this match. */
  subscriptionsToldOfGoal(matchId: number, subscriptionIds: string[]): Promise<Set<string>>
  /**
   * Inserts the log row for this dedupe key unless it already exists.
   * True only for the caller that inserted it - the one allowed to send.
   */
  claim(entry: {
    dedupeKey: string
    subscriptionId: string
    signalId: number
    status: ClaimStatus
    error: string | null
  }): Promise<boolean>
  markSent(dedupeKey: string, subscriptionId: string): Promise<void>
  /** Records a failed delivery; returns the subscription's consecutive failure count. */
  markFailed(dedupeKey: string, subscriptionId: string, error: string): Promise<number>
  deleteSubscription(subscriptionId: string): Promise<void>
}

export const dbDispatchStore: DispatchStore = {
  async recentSignals(since, limit) {
    const rows = await getDb()
      .select()
      .from(matchSignals)
      .where(gte(matchSignals.createdAt, since))
      .orderBy(asc(matchSignals.matchId), asc(matchSignals.seq))
      .limit(limit)
    return rows.map((r) => ({
      id: r.id,
      matchId: r.matchId,
      seq: r.seq,
      type: r.type as SignalType,
      payload: r.payload as SignalPayload,
      createdAt: r.createdAt,
    }))
  },

  async matchContexts(matchIds) {
    const out = new Map<number, MatchContext>()
    if (matchIds.length === 0) return out
    const home = alias(teams, 'home_team')
    const away = alias(teams, 'away_team')
    const rows = await getDb()
      .select({
        matchId: matches.id,
        homeTeamId: matches.homeTeamId,
        awayTeamId: matches.awayTeamId,
        competitionCode: matches.competitionCode,
        homeName: sql<string>`coalesce(${home.shortName}, ${home.name})`,
        awayName: sql<string>`coalesce(${away.shortName}, ${away.name})`,
        competitionName: competitions.name,
      })
      .from(matches)
      .innerJoin(home, eq(home.id, matches.homeTeamId))
      .innerJoin(away, eq(away.id, matches.awayTeamId))
      .leftJoin(competitions, eq(competitions.code, matches.competitionCode))
      .where(inArray(matches.id, matchIds))
    for (const r of rows) out.set(r.matchId, r)
    return out
  },

  async followers(ctx) {
    const rows = await getDb()
      .select({
        deviceId: follows.deviceId,
        entityType: follows.entityType,
        entityKey: follows.entityKey,
        notify: follows.notify,
      })
      .from(follows)
      .where(
        or(
          and(
            eq(follows.entityType, 'team'),
            inArray(follows.entityKey, [String(ctx.homeTeamId), String(ctx.awayTeamId)])
          ),
          and(eq(follows.entityType, 'competition'), eq(follows.entityKey, ctx.competitionCode)),
          and(eq(follows.entityType, 'match'), eq(follows.entityKey, String(ctx.matchId)))
        )
      )
    return rows.map((r) => ({ ...r, entityType: r.entityType as FollowEntityType }))
  },

  async subscriptionsForDevices(deviceIds) {
    if (deviceIds.length === 0) return []
    return getDb()
      .select({
        id: pushSubscriptions.id,
        deviceId: pushSubscriptions.deviceId,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
        timezone: pushSubscriptions.timezone,
        locale: pushSubscriptions.locale,
        quietStartHour: pushSubscriptions.quietStartHour,
        quietEndHour: pushSubscriptions.quietEndHour,
      })
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.deviceId, deviceIds))
  },

  async subscriptionsToldOfGoal(matchId, subscriptionIds) {
    if (subscriptionIds.length === 0) return new Set()
    const rows = await getDb()
      .selectDistinct({ id: notificationLog.subscriptionId })
      .from(notificationLog)
      .innerJoin(matchSignals, eq(matchSignals.id, notificationLog.signalId))
      .where(
        and(
          eq(matchSignals.matchId, matchId),
          eq(matchSignals.type, 'GOAL'),
          eq(notificationLog.status, 'sent'),
          inArray(notificationLog.subscriptionId, subscriptionIds)
        )
      )
    return new Set(rows.map((r) => r.id))
  },

  async claim(entry) {
    const rows = await getDb()
      .insert(notificationLog)
      .values(entry)
      .onConflictDoNothing({ target: notificationLog.dedupeKey })
      .returning({ key: notificationLog.dedupeKey })
    return rows.length > 0
  },

  async markSent(dedupeKey, subscriptionId) {
    const db = getDb()
    await db
      .update(notificationLog)
      .set({ status: 'sent', error: null })
      .where(eq(notificationLog.dedupeKey, dedupeKey))
    await db
      .update(pushSubscriptions)
      .set({ lastSuccessAt: sql`now()`, failureCount: 0 })
      .where(eq(pushSubscriptions.id, subscriptionId))
  },

  async markFailed(dedupeKey, subscriptionId, error) {
    const db = getDb()
    await db
      .update(notificationLog)
      .set({ status: 'failed', error: error.slice(0, 500) })
      .where(eq(notificationLog.dedupeKey, dedupeKey))
    const rows = await db
      .update(pushSubscriptions)
      .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
      .where(eq(pushSubscriptions.id, subscriptionId))
      .returning({ failureCount: pushSubscriptions.failureCount })
    return rows[0]?.failureCount ?? 0
  },

  async deleteSubscription(subscriptionId) {
    await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscriptionId))
  },
}
