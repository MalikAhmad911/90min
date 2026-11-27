import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { providerMap } from '@/lib/db/schema'
import type { CandidateTeam } from '@/lib/providers/openligadb'
import { chunk, rowsOf } from '@/lib/server/sync/sync-state'

/**
 * provider_map and fixture reads shared by the enrichment providers
 * (OpenLigaDB, Highlightly). Each provider maps its own ids onto ours; the
 * table's two unique keys guarantee a provider id names one of our rows and
 * one of our rows is named by at most one provider id.
 */

const BATCH = 200

export type MappedEntity = 'team' | 'match'

/** provider id -> our id, for one provider and entity type. */
export async function loadMappings(provider: string, entityType: MappedEntity): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({ providerId: providerMap.providerId, ourKey: providerMap.ourKey })
    .from(providerMap)
    .where(and(eq(providerMap.provider, provider), eq(providerMap.entityType, entityType)))
  return new Map(rows.map((r) => [r.providerId, Number(r.ourKey)]))
}

export async function insertMappings(
  provider: string,
  entityType: MappedEntity,
  pairs: [string, number][]
): Promise<void> {
  for (const part of chunk(pairs, BATCH)) {
    await getDb()
      .insert(providerMap)
      .values(
        part.map(([providerId, ourKey]) => ({
          provider,
          entityType,
          providerId,
          ourKey: String(ourKey),
        }))
      )
      // Either key already taken means someone mapped it first (two racing
      // syncs); the reload that follows shows what won.
      .onConflictDoNothing()
  }
}

/** Every team that plays in one of our competitions - the only candidates a name may map to. */
export async function competitionTeams(code: string): Promise<CandidateTeam[]> {
  const rows = rowsOf(
    await getDb().execute(sql`
      select distinct t.id, t.name, t.short_name as "shortName"
      from teams t
      join matches m on t.id in (m.home_team_id, m.away_team_id)
      where m.competition_code = ${code}`)
  )
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    shortName: (r.shortName as string | null) ?? null,
  }))
}

export interface OurFixture {
  id: number
  homeTeamId: number
  awayTeamId: number
  utcDate: Date
  status: string
  homeScoreFt: number | null
  awayScoreFt: number | null
}

/** Our fixtures of a competition kicking off in [from, to], plus any listed by id. */
export async function ourMatches(code: string, from: Date, to: Date, ids: number[]): Promise<OurFixture[]> {
  const idList = ids.length
    ? sql`or id in (${sql.join(
        ids.map((i) => sql`${i}`),
        sql`, `
      )})`
    : sql``
  const rows = rowsOf(
    await getDb().execute(sql`
      select id, home_team_id as "homeTeamId", away_team_id as "awayTeamId", utc_date as "utcDate",
             status, home_score_ft as "homeScoreFt", away_score_ft as "awayScoreFt"
      from matches
      where competition_code = ${code}
        and (utc_date between ${from.toISOString()}::timestamptz and ${to.toISOString()}::timestamptz ${idList})`)
  )
  return rows.map((r) => ({
    id: Number(r.id),
    homeTeamId: Number(r.homeTeamId),
    awayTeamId: Number(r.awayTeamId),
    utcDate: new Date(r.utcDate as string),
    status: String(r.status),
    homeScoreFt: r.homeScoreFt == null ? null : Number(r.homeScoreFt),
    awayScoreFt: r.awayScoreFt == null ? null : Number(r.awayScoreFt),
  }))
}
