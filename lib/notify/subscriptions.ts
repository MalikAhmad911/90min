import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { getDb } from '@/lib/db'
import { competitions, follows, matches, pushSubscriptions, teams } from '@/lib/db/schema'
import { resolvePrefs, type FollowEntityType, type NotifyKey, type NotifyPrefs } from './prefs'
import type { SubscribeInput } from './validation'

/**
 * Queries behind /api/push/subscribe and /api/push/prefs.
 *
 * Every function takes the device id as an argument and scopes its write to
 * it; callers pass the id they validated from the request, never one read
 * back out of a body field they did not check.
 */

/**
 * Creates or refreshes a subscription, keyed on its endpoint.
 *
 * Re-subscribing the same browser returns the same endpoint, so this updates
 * in place. The device id is overwritten too: a browser whose site data was
 * cleared gets a new device id but may keep its push subscription, and the
 * subscription must follow the browser. Quiet hours are only touched when the
 * request carries them, so re-enabling does not wipe a saved window.
 */
export async function upsertSubscription(input: SubscribeInput): Promise<{ id: string }> {
  const quietGiven = input.quietStartHour !== undefined
  const rows = await getDb()
    .insert(pushSubscriptions)
    .values({
      deviceId: input.deviceId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      timezone: input.timezone,
      locale: input.locale,
      quietStartHour: input.quietStartHour ?? null,
      quietEndHour: input.quietEndHour ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        deviceId: input.deviceId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        timezone: input.timezone,
        locale: input.locale,
        failureCount: 0,
        ...(quietGiven
          ? { quietStartHour: input.quietStartHour ?? null, quietEndHour: input.quietEndHour ?? null }
          : {}),
      },
    })
    .returning({ id: pushSubscriptions.id })
  return rows[0]
}

/** Removes this device's subscription for one endpoint. Returns rows deleted. */
export async function removeSubscription(deviceId: string, endpoint: string): Promise<number> {
  const rows = await getDb()
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.deviceId, deviceId), eq(pushSubscriptions.endpoint, endpoint)))
    .returning({ id: pushSubscriptions.id })
  return rows.length
}

export interface FollowPrefsView {
  entityType: FollowEntityType
  entityKey: string
  /** Human label: team / competition name, or "Home v Away" for a match. */
  label: string
  prefs: NotifyPrefs
}

export interface DevicePrefsView {
  subscribed: boolean
  quietStartHour: number | null
  quietEndHour: number | null
  timezone: string | null
  follows: FollowPrefsView[]
}

/** Everything the preferences UI needs for one device. */
export async function getDevicePrefs(deviceId: string): Promise<DevicePrefsView> {
  const db = getDb()
  const [subs, rows] = await Promise.all([
    db
      .select({
        quietStartHour: pushSubscriptions.quietStartHour,
        quietEndHour: pushSubscriptions.quietEndHour,
        timezone: pushSubscriptions.timezone,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.deviceId, deviceId))
      .orderBy(asc(pushSubscriptions.createdAt))
      .limit(1),
    db
      .select({
        entityType: follows.entityType,
        entityKey: follows.entityKey,
        notify: follows.notify,
      })
      .from(follows)
      .where(eq(follows.deviceId, deviceId))
      .orderBy(asc(follows.createdAt)),
  ])

  const labels = await labelsFor(rows)
  return {
    subscribed: subs.length > 0,
    quietStartHour: subs[0]?.quietStartHour ?? null,
    quietEndHour: subs[0]?.quietEndHour ?? null,
    timezone: subs[0]?.timezone ?? null,
    follows: rows.map((r) => {
      const entityType = r.entityType as FollowEntityType
      return {
        entityType,
        entityKey: r.entityKey,
        label: labels.get(`${entityType}:${r.entityKey}`) ?? r.entityKey,
        prefs: resolvePrefs(entityType, r.notify),
      }
    }),
  }
}

async function labelsFor(rows: { entityType: string; entityKey: string }[]) {
  const out = new Map<string, string>()
  const ints = (type: string) =>
    rows
      .filter((r) => r.entityType === type && /^\d+$/.test(r.entityKey))
      .map((r) => Number(r.entityKey))
  const teamIds = ints('team')
  const matchIds = ints('match')
  const codes = rows.filter((r) => r.entityType === 'competition').map((r) => r.entityKey)
  const db = getDb()

  if (teamIds.length) {
    const found = await db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(inArray(teams.id, teamIds))
    for (const t of found) out.set(`team:${t.id}`, t.name)
  }
  if (codes.length) {
    const found = await db
      .select({ code: competitions.code, name: competitions.name })
      .from(competitions)
      .where(inArray(competitions.code, codes))
    for (const c of found) out.set(`competition:${c.code}`, c.name)
  }
  if (matchIds.length) {
    const home = alias(teams, 'home_team')
    const away = alias(teams, 'away_team')
    const found = await db
      .select({
        id: matches.id,
        label: sql<string>`coalesce(${home.shortName}, ${home.name}) || ' v ' || coalesce(${away.shortName}, ${away.name})`,
      })
      .from(matches)
      .innerJoin(home, eq(home.id, matches.homeTeamId))
      .innerJoin(away, eq(away.id, matches.awayTeamId))
      .where(inArray(matches.id, matchIds))
    for (const m of found) out.set(`match:${m.id}`, m.label)
  }
  return out
}

/**
 * Merges toggles into one of this device's follows. The `jsonb ||` merge
 * happens in the database, so two quick toggles cannot overwrite each other
 * with a stale read-modify-write. Returns the resolved prefs, or null when
 * the device does not follow that entity.
 */
export async function updateFollowNotify(
  deviceId: string,
  entityType: FollowEntityType,
  entityKey: string,
  patch: Partial<Record<NotifyKey, boolean>>
): Promise<NotifyPrefs | null> {
  // Only defined booleans reach the database (the schema allow-lists keys).
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => typeof v === 'boolean')
  )
  const rows = await getDb()
    .update(follows)
    .set({ notify: sql`${follows.notify} || ${JSON.stringify(clean)}::jsonb` })
    .where(
      and(
        eq(follows.deviceId, deviceId),
        eq(follows.entityType, entityType),
        eq(follows.entityKey, entityKey)
      )
    )
    .returning({ notify: follows.notify })
  if (rows.length === 0) return null
  return resolvePrefs(entityType, rows[0].notify)
}

/** Sets quiet hours (and optionally the zone) on every subscription of this device. */
export async function updateQuietHours(
  deviceId: string,
  quiet: { quietStartHour: number | null; quietEndHour: number | null; timezone?: string }
): Promise<number> {
  const rows = await getDb()
    .update(pushSubscriptions)
    .set({
      quietStartHour: quiet.quietStartHour,
      quietEndHour: quiet.quietEndHour,
      ...(quiet.timezone ? { timezone: quiet.timezone } : {}),
    })
    .where(eq(pushSubscriptions.deviceId, deviceId))
    .returning({ id: pushSubscriptions.id })
  return rows.length
}
