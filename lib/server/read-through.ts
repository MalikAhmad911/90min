import { isDatabaseConfigured } from '@/lib/db'
import { getSyncState } from '@/lib/db/queries'
import { syncResource, ensureCompetitions } from '@/lib/server/ingest'

/**
 * Keeps the database warm without a scheduler.
 *
 * Vercel's free plan runs cron at most once a day, which is useless for live
 * scores, so the app refreshes itself: a request that notices stale data
 * triggers the sync. Readers are never made to wait for it - the exception is
 * a completely cold database, where there is nothing to serve and waiting is
 * better than an empty page.
 */

/** Resources already being refreshed in this process. */
const inFlight = new Set<string>()

/** Starts a sync and returns immediately. Errors are swallowed on purpose. */
function refreshInBackground(resource: string): void {
  if (inFlight.has(resource)) return
  inFlight.add(resource)
  void syncResource(resource)
    .catch(() => undefined)
    .finally(() => inFlight.delete(resource))
}

async function lastSuccess(): Promise<Map<string, number>> {
  const rows = await getSyncState()
  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(r.resource, r.lastSuccessAt ? new Date(r.lastSuccessAt).getTime() : 0)
  }
  return map
}

/** True when nothing has ever been ingested. */
export async function isColdStart(): Promise<boolean> {
  const seen = await lastSuccess()
  for (const age of seen.values()) {
    if (age > 0) return false
  }
  return true
}

export interface EnsureOptions {
  /** Resources to refresh when stale, with how stale is too stale. */
  resources: { resource: string; maxAgeMs: number }[]
  /**
   * Wait for the refresh rather than returning stale data. Used only when
   * there is nothing cached to return at all.
   */
  blocking?: boolean
}

/**
 * Refreshes whatever is stale among `resources`.
 *
 * Returns the resources it started, so a route can report that it is
 * warming rather than pretending the data is complete.
 */
export async function ensureFresh(options: EnsureOptions): Promise<string[]> {
  if (!isDatabaseConfigured()) return []

  let seen: Map<string, number>
  try {
    seen = await lastSuccess()
  } catch {
    // The sync table is unreadable - let the caller serve whatever it has.
    return []
  }

  const now = Date.now()
  const due = options.resources
    .filter(({ resource, maxAgeMs }) => now - (seen.get(resource) ?? 0) > maxAgeMs)
    .map((r) => r.resource)

  if (due.length === 0) return []

  if (options.blocking) {
    await ensureCompetitions()
    for (const resource of due) {
      await syncResource(resource).catch(() => undefined)
    }
    return due
  }

  for (const resource of due) refreshInBackground(resource)
  return due
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** The live window covers today and tomorrow and carries in-play scores. */
export function liveWindowCovers(date: string): boolean {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return date === iso(today) || date === iso(tomorrow)
}

/** What a request for `date` needs kept fresh. */
export function resourcesForDate(date: string, competitionCodes: string[]) {
  if (liveWindowCovers(date)) {
    return [{ resource: 'live-window', maxAgeMs: MINUTE }]
  }
  // Any other date is served from the stored seasons.
  return competitionCodes.map((code) => ({
    resource: `season:${code}`,
    maxAgeMs: 12 * HOUR,
  }))
}

/**
 * Should this refresh be awaited rather than left running?
 *
 * On a serverless host the container can be frozen the moment a response is
 * sent, so work started with `void` may simply never finish - which would
 * leave live scores frozen at whatever the last completed sync wrote.
 *
 * Refreshing the live window is a single upstream request, so awaiting it is
 * cheap insurance; with `s-maxage=20` on the response only about one request
 * a minute pays for it. Season refreshes are twelve requests and stay in the
 * background, where the scheduled function is the real safety net.
 */
export function shouldBlockFor(date: string): boolean {
  return liveWindowCovers(date)
}
