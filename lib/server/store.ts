import { eq, and, asc, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { users, channels, streamOverrides } from '@/lib/db/schema'
import type { StreamOverrides, FreeStream, Channel } from '@/lib/tv/types'

/**
 * Admin-owned data: accounts, stream overrides and Live TV channels.
 *
 * This used to be three JSON files under `data/`. That had two problems. On a
 * serverless host the filesystem is read-only and per-instance, so nothing an
 * admin saved survived a deploy - or even reached the next request. And every
 * write was a read-modify-write of the whole collection, so two admins saving
 * at the same time silently lost one of the changes.
 *
 * Both are gone: each row is written on its own, by primary key.
 */

export interface User {
  id: string
  username: string
  passwordHash: string
  role: 'admin'
}

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

/** Case-insensitive lookup, matching the unique index on lower(username). */
export async function findUserByUsername(username: string): Promise<User | null> {
  const db = getDb()
  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1)

  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    role: 'admin',
  }
}

export async function countUsers(): Promise<number> {
  const db = getDb()
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(users)
  return rows[0]?.n ?? 0
}

/**
 * Creates the seed admin, doing nothing if that username already exists.
 *
 * `onConflictDoNothing` rather than "check then insert": two cold starts can
 * run the seed at the same moment, and the unique index is what actually
 * decides the winner.
 */
export async function createUserIfAbsent(
  username: string,
  passwordHash: string
): Promise<void> {
  const db = getDb()
  await db
    .insert(users)
    .values({ username, passwordHash, role: 'admin' })
    .onConflictDoNothing()
}

export async function recordLogin(id: string): Promise<void> {
  const db = getDb()
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id))
}

/* ------------------------------------------------------------------ *
 * Stream overrides
 * ------------------------------------------------------------------ */

export async function readStreams(): Promise<StreamOverrides> {
  const db = getDb()
  const rows = await db.select().from(streamOverrides)

  const result: StreamOverrides = { byMatch: {}, byCompetition: {} }
  for (const row of rows) {
    const bucket = row.scope === 'match' ? result.byMatch : result.byCompetition
    bucket[row.key] = {
      kind: row.kind as FreeStream['kind'],
      src: row.src,
      title: row.title,
    }
  }
  return result
}

/** Writes exactly one override. */
export async function setStreamOverride(
  scope: 'match' | 'competition',
  key: string,
  stream: FreeStream
): Promise<void> {
  const db = getDb()
  await db
    .insert(streamOverrides)
    .values({ scope, key, kind: stream.kind, src: stream.src, title: stream.title ?? '' })
    .onConflictDoUpdate({
      target: [streamOverrides.scope, streamOverrides.key],
      set: {
        kind: sql`excluded.kind`,
        src: sql`excluded.src`,
        title: sql`excluded.title`,
        updatedAt: sql`now()`,
      },
    })
}

export async function deleteStreamOverride(
  scope: 'match' | 'competition',
  key: string
): Promise<void> {
  const db = getDb()
  await db
    .delete(streamOverrides)
    .where(and(eq(streamOverrides.scope, scope), eq(streamOverrides.key, key)))
}

/* ------------------------------------------------------------------ *
 * Live TV channels
 * ------------------------------------------------------------------ */

export async function readChannels(): Promise<Channel[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(channels)
    .orderBy(asc(channels.sortOrder), asc(channels.createdAt))

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind as Channel['kind'],
    src: r.src,
  }))
}

export async function addChannel(channel: Omit<Channel, 'id'>): Promise<Channel> {
  const db = getDb()
  const rows = await db
    .insert(channels)
    .values({ name: channel.name, kind: channel.kind, src: channel.src })
    .returning()

  const row = rows[0]
  return { id: row.id, name: row.name, kind: row.kind as Channel['kind'], src: row.src }
}

/** Returns true when a row was actually removed. */
export async function removeChannel(id: string): Promise<boolean> {
  // A malformed id would make Postgres reject the whole statement.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false

  const db = getDb()
  const rows = await db.delete(channels).where(eq(channels.id, id)).returning({ id: channels.id })
  return rows.length > 0
}
