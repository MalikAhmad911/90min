import { NextRequest, NextResponse } from 'next/server'
import { runSync, syncResource } from '@/lib/server/ingest'
import { isDatabaseConfigured } from '@/lib/db'
import { dispatchPendingSignals } from '@/lib/notify/dispatch'

/**
 * Pulls fresh data from football-data into Postgres.
 *
 * Triggered by a scheduler, not by users. Vercel's Hobby plan caps cron at
 * once per day, so for live scores point an external scheduler
 * (cron-job.org, GitHub Actions, UptimeRobot) at this route instead - it is
 * a plain authenticated GET.
 *
 * Each call refreshes only the few stalest resources, because the provider
 * allows ten requests a minute and this must never be the thing that
 * exhausts that budget.
 */

export const dynamic = 'force-dynamic'
// The Neon driver queries over fetch(); without this Next can replay a cached
// query result here instead of reading the database.
export const fetchCache = 'force-no-store'
export const maxDuration = 60

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // With no secret configured the route is refused outright rather than
  // left open - an unauthenticated endpoint that burns API quota is a gift
  // to anyone who finds it.
  if (!secret) return false

  const header = req.headers.get('authorization')
  return header === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'DATABASE_URL is not set' }, { status: 503 })
  }
  if (!authorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  const only = params.get('resource')
  const limit = Math.min(12, Math.max(1, Number(params.get('limit')) || 4))

  try {
    const results = only ? [await syncResource(only)] : await runSync(limit)
    const failed = results.filter((r) => !r.ok)
    // Sends pushes for whatever the sync just detected. Never throws, and
    // claims nothing when VAPID keys are not configured.
    const notify = await dispatchPendingSignals({ windowMinutes: 15 })

    return NextResponse.json(
      {
        ok: failed.length === 0,
        synced: results.length,
        rows: results.reduce((n, r) => n + r.rows, 0),
        results,
        notify,
      },
      { status: failed.length === results.length && results.length > 0 ? 502 : 200 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
