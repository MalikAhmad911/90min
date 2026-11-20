import type { Config } from '@netlify/functions'

/**
 * Hourly catch-up sync.
 *
 * Calls the app's own protected sync route rather than importing the
 * ingestion code, so there is exactly one implementation of "refresh the
 * data" and it is the same one a browser would trigger.
 *
 * Scheduled functions get 30 seconds, so this asks for a small batch and
 * lets the next run continue where this one stopped - `staleResources`
 * always returns the stalest first, so nothing is starved.
 */
const scheduledSync = async (): Promise<Response> => {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('scheduled-sync: CRON_SECRET is not set; skipping')
    return new Response('CRON_SECRET not configured', { status: 503 })
  }

  const base =
    process.env.URL ?? process.env.DEPLOY_PRIME_URL ?? 'http://localhost:3000'

  try {
    const res = await fetch(`${base}/api/cron/sync?limit=3`, {
      headers: { Authorization: `Bearer ${secret}` },
    })
    const body = await res.json().catch(() => ({}))
    console.log('scheduled-sync:', res.status, JSON.stringify(body))
    return new Response(JSON.stringify(body), {
      status: res.ok ? 200 : 502,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('scheduled-sync failed:', message)
    return new Response(message, { status: 500 })
  }
}

export default scheduledSync

export const config: Config = {
  schedule: '@hourly',
}
