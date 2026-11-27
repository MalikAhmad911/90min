import { NextRequest, NextResponse } from 'next/server'
import { fetchMatchesByDate } from '@/lib/api/football-data'
import { formatDate } from '@/lib/utils'
import { isDatabaseConfigured } from '@/lib/db'
import { getMatchesByDate } from '@/lib/db/queries'
import { getMatchesForLocalDay, localDayPlan } from '@/lib/db/home-queries'
import {
  ensureFresh,
  isColdStart,
  resourcesForDate,
  shouldBlockFor,
} from '@/lib/server/read-through'
import { FREE_COMPETITION_CODES } from '@/lib/competitions'
import { addDays, isValidTimeZone, localDateString } from '@/lib/timezone'
import type { Match } from '@/lib/types'

/** YYYY-MM-DD only - the value reaches both a SQL cast and an upstream query. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Shape check plus a real calendar day (rejects 2026-02-31, which Postgres would). */
function isRealDate(value: string): boolean {
  return DATE_RE.test(value) && addDays(value, 0) === value
}

export const dynamic = 'force-dynamic'
// The Neon driver queries over fetch(); without this Next can replay a cached
// query result here instead of reading the database.
export const fetchCache = 'force-no-store'

/**
 * Matches for one day.
 *
 *   ?date=YYYY-MM-DD           the UTC day (the original behaviour)
 *   ?date=YYYY-MM-DD&tz=Zone   the local calendar day in an IANA zone (MAT-1)
 *
 * Without `tz` the route behaves exactly as before, so existing callers are
 * unaffected. With it, the day is [local midnight, next local midnight),
 * which normally spans two UTC dates - and both are kept fresh.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const raw = searchParams.get('date')
  const tzRaw = searchParams.get('tz')

  if (tzRaw !== null && !isValidTimeZone(tzRaw)) {
    return NextResponse.json(
      { matches: [], date: raw ?? '', error: 'Invalid time zone' },
      { status: 400 }
    )
  }
  const tz = tzRaw ?? 'UTC'
  const today = tzRaw ? localDateString(new Date(), tz) : formatDate(new Date())
  const date = raw && isRealDate(raw) ? raw : today

  if (raw && !isRealDate(raw)) {
    return NextResponse.json({ matches: [], date, error: 'Invalid date' }, { status: 400 })
  }

  const plan = localDayPlan(date, tz)

  // Without a database, fall back to talking to the provider directly. This
  // keeps local development working before anyone has run a migration.
  if (!isDatabaseConfigured()) {
    try {
      const days = await Promise.all(plan.utcDates.map((d) => fetchMatchesByDate(d)))
      const start = plan.start.getTime()
      const end = plan.end.getTime()
      const matches: Match[] = days
        .flatMap((d) => d.value)
        .filter((m) => {
          const t = new Date(m.utcDate).getTime()
          return t >= start && t < end
        })
        .sort((a, b) => a.utcDate.localeCompare(b.utcDate) || a.id - b.id)
      const stale = days.some((d) => d.stale)
      const storedAt = Math.min(...days.map((d) => d.storedAt))
      return NextResponse.json({ matches, date, tz, stale, updatedAt: storedAt, source: 'provider' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ matches: [], date, tz, error: message }, { status: 502 })
    }
  }

  try {
    // Every UTC date the local day touches needs the same freshness the
    // single-date route gave it. Deduplicated so the live window is listed once.
    const byResource = new Map<string, { resource: string; maxAgeMs: number }>()
    for (const d of plan.utcDates) {
      for (const r of resourcesForDate(d, FREE_COMPETITION_CODES)) {
        const seen = byResource.get(r.resource)
        if (!seen || r.maxAgeMs < seen.maxAgeMs) byResource.set(r.resource, r)
      }
    }
    const resources = [...byResource.values()]
    const blockForLive = plan.utcDates.some((d) => shouldBlockFor(d))

    // Nothing has ever been ingested: there is no stale data to fall back on,
    // so this one request waits for the sync instead of rendering an empty day.
    const cold = await isColdStart()
    const warming = await ensureFresh({
      resources,
      // Cold: there is nothing to serve, so wait. Live window: one upstream
      // call, awaited so a frozen serverless container cannot drop it.
      blocking: cold || blockForLive,
    })

    const matches = tzRaw ? await getMatchesForLocalDay(date, tz) : await getMatchesByDate(date)

    return NextResponse.json(
      {
        matches,
        date,
        ...(tzRaw ? { tz } : {}),
        source: 'database',
        // True while a refresh is running behind this response.
        stale: warming.length > 0 && !cold && !blockForLive,
        warming: warming.length > 0 ? warming : undefined,
      },
      // Safe to share: the response depends only on the query string.
      { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=300' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ matches: [], date, error: message }, { status: 502 })
  }
}
