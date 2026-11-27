import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'
import { getDb } from './index'
import { matches, teams } from './schema'

/**
 * Reads used only by server-rendered pages and the sitemap.
 *
 * Kept apart from queries.ts so the API routes' read paths stay untouched.
 * Everything here is a plain SELECT: page rendering never talks to the
 * provider or triggers a sync.
 */

export interface TeamRow {
  id: number
  name: string
  shortName: string | null
  tla: string | null
  crest: string | null
}

/** One team, or null. */
export async function getTeamById(id: number): Promise<TeamRow | null> {
  const db = getDb()
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      shortName: teams.shortName,
      tla: teams.tla,
      crest: teams.crest,
    })
    .from(teams)
    .where(eq(teams.id, id))
    .limit(1)
  return rows[0] ?? null
}

/**
 * The stored venue of a match. `getMatchById` does not select it because the
 * API's match shape has no use for it; structured data does.
 */
export async function getMatchVenue(id: number): Promise<string | null> {
  const db = getDb()
  const rows = await db
    .select({ venue: matches.venue })
    .from(matches)
    .where(eq(matches.id, id))
    .limit(1)
  return rows[0]?.venue ?? null
}

export interface SitemapRow {
  id: number
  lastModified: Date | null
}

/** Every team that appears in at least one stored match. */
export async function getSitemapTeams(): Promise<SitemapRow[]> {
  const db = getDb()
  return db
    .select({ id: teams.id, lastModified: teams.updatedAt })
    .from(teams)
    .where(
      sql`exists (select 1 from ${matches} m where m.home_team_id = ${teams.id} or m.away_team_id = ${teams.id})`
    )
    .orderBy(asc(teams.id))
}

/**
 * Matches kicking off between two instants, capped so the sitemap can never
 * pass the protocol's 50,000-URL limit however much history accumulates.
 */
export async function getSitemapMatches(from: Date, to: Date, limit = 40_000): Promise<SitemapRow[]> {
  const db = getDb()
  return db
    .select({
      id: matches.id,
      lastModified: sql<Date | null>`coalesce(${matches.lastUpdated}, ${matches.syncedAt})`.mapWith(
        (v: string | Date | null) => (v ? new Date(v) : null)
      ),
    })
    .from(matches)
    .where(and(gte(matches.utcDate, from), lte(matches.utcDate, to)))
    .orderBy(asc(matches.utcDate), asc(matches.id))
    .limit(limit)
}
