// @vitest-environment node
import { config } from 'dotenv'

/*
 * Notifier against the real database. Skipped unless NOTIFY_DB_TEST=1:
 *
 *   NOTIFY_DB_TEST=1 npx vitest run __tests__/integration/notify-db.test.ts
 *
 * Writes only test rows (a push subscription, a follow, signals, log rows)
 * tied to one made-up device id, never touches `matches`, sends nothing to a
 * push service (the sender is injected), and deletes everything in afterAll.
 */

const enabled = process.env.NOTIFY_DB_TEST === '1'
if (enabled) config({ path: '.env.local', quiet: true })

const DEVICE = 'notifydbtest0000000000000000test'
const ENDPOINT = `https://push.example.invalid/notify-db-test/${Date.now()}`

const suite = enabled ? describe : describe.skip

suite('notifier against the database', () => {
  let db: ReturnType<typeof import('@/lib/db').getDb>
  let sql: typeof import('drizzle-orm').sql
  let matchId = 0
  let subscriptionId = ''
  const signalIds: number[] = []

  beforeAll(async () => {
    ;({ sql } = await import('drizzle-orm'))
    db = (await import('@/lib/db')).getDb()

    // An old finished match: no real sync will record signals for it while we run.
    const found = await db.execute(sql`
      SELECT id FROM matches WHERE status = 'FINISHED' AND utc_date < now() - interval '30 days'
      ORDER BY utc_date ASC LIMIT 1
    `)
    matchId = Number((found.rows[0] as { id: number }).id)

    const sub = await db.execute(sql`
      INSERT INTO push_subscriptions (device_id, endpoint, p256dh, auth, timezone, locale)
      VALUES (${DEVICE}, ${ENDPOINT}, 'test-p256dh', 'test-auth', 'UTC', 'en')
      RETURNING id
    `)
    subscriptionId = String((sub.rows[0] as { id: string }).id)
    await db.execute(sql`
      INSERT INTO follows (device_id, entity_type, entity_key, notify)
      VALUES (${DEVICE}, 'match', ${String(matchId)}, '{}'::jsonb)
    `)
  })

  afterAll(async () => {
    if (!db) return
    // notification_log rows cascade from both the subscription and the signals.
    if (signalIds.length) {
      await db.execute(sql`DELETE FROM match_signals WHERE id IN (${sql.join(signalIds.map((id) => sql`${id}`), sql`, `)})`)
    }
    await db.execute(sql`DELETE FROM follows WHERE device_id = ${DEVICE}`)
    await db.execute(sql`DELETE FROM push_subscriptions WHERE device_id = ${DEVICE}`)
    const left = await db.execute(sql`
      SELECT
        (SELECT count(*) FROM push_subscriptions WHERE device_id = ${DEVICE}) AS subs,
        (SELECT count(*) FROM follows WHERE device_id = ${DEVICE}) AS follows,
        (SELECT count(*) FROM match_signals WHERE match_id = ${matchId}) AS signals,
        (SELECT count(*) FROM notification_log WHERE subscription_id::text = ${subscriptionId}) AS logs
    `)
    console.log('[notify-db] leftovers after cleanup:', JSON.stringify(left.rows[0]))
  })

  it('recordSignals records a goal once, even when called twice with the same payload', async () => {
    const { recordSignals } = await import('@/lib/notify/signals')
    const row = (
      await db.execute(sql`
        SELECT m.id, m.status, m.utc_date, m.home_score_ft, m.away_score_ft, m.competition_code,
               m.home_team_id, m.away_team_id
        FROM matches m WHERE m.id = ${matchId}
      `)
    ).rows[0] as Record<string, unknown>

    const kickoff = new Date(String(row.utc_date))
    const incoming = {
      id: matchId,
      status: 'FINISHED' as const,
      utcDate: kickoff.toISOString(),
      homeTeam: { id: Number(row.home_team_id), name: 'H', shortName: 'H', tla: 'H', crest: '' },
      awayTeam: { id: Number(row.away_team_id), name: 'A', shortName: 'A', tla: 'A', crest: '' },
      // One more home goal than stored: a synthetic late correction-in-reverse.
      score: {
        fullTime: { home: Number(row.home_score_ft ?? 0) + 1, away: Number(row.away_score_ft ?? 0) },
        halfTime: { home: null, away: null },
      },
      competition: { id: 0, name: '', code: String(row.competition_code), emblem: '' },
    }
    // Pretend "now" is an hour after kick-off so the staleness guard lets it through.
    const now = new Date(kickoff.getTime() + 60 * 60_000)

    const first = await recordSignals([incoming], { now })
    expect(first.ok).toBe(true)
    expect(first.recorded.map((r) => r.type)).toEqual(['GOAL'])
    signalIds.push(...first.recorded.map((r) => r.id))
    console.log('[notify-db] recorded:', JSON.stringify(first.recorded))

    // `matches` was deliberately not updated, so this is exactly the
    // "racing run read the old row" case.
    const second = await recordSignals([incoming], { now })
    expect(second).toEqual({ ok: true, recorded: [] })

    // With the real clock the same change is too old to announce.
    const stale = await recordSignals([incoming])
    expect(stale.recorded).toEqual([])
  })

  it('dispatches once per subscription and logs it; a second run creates no row', async () => {
    const { dispatchPendingSignals } = await import('@/lib/notify/dispatch')
    const { dbDispatchStore } = await import('@/lib/notify/store')

    // Only our test device: other people's subscriptions in a shared database
    // are none of this test's business.
    const store = {
      ...dbDispatchStore,
      subscriptionsForDevices: (ids: string[]) =>
        dbDispatchStore.subscriptionsForDevices(ids.filter((id) => id === DEVICE)),
    }
    const sent: unknown[] = []
    const send = async (_t: unknown, payload: unknown) => {
      sent.push(payload)
      return { ok: true as const, statusCode: 201 }
    }

    const first = await dispatchPendingSignals({ store, send, windowMinutes: 10 })
    expect(first.ok).toBe(true)
    expect(first.sent).toBe(1)
    expect(sent).toHaveLength(1)
    console.log('[notify-db] payload:', JSON.stringify(sent[0]))

    const log = await db.execute(sql`
      SELECT dedupe_key, signal_id, status, error FROM notification_log
      WHERE subscription_id::text = ${subscriptionId}
    `)
    console.log('[notify-db] notification_log:', JSON.stringify(log.rows))
    expect(log.rows).toHaveLength(1)
    expect(log.rows[0]).toMatchObject({ dedupe_key: `${subscriptionId}:${signalIds[0]}`, status: 'sent' })

    const second = await dispatchPendingSignals({ store, send, windowMinutes: 10 })
    expect(second.sent).toBe(0)
    expect(second.deduped).toBe(1)
    const again = await db.execute(sql`
      SELECT count(*)::int AS n FROM notification_log WHERE subscription_id::text = ${subscriptionId}
    `)
    expect((again.rows[0] as { n: number }).n).toBe(1)
    expect(sent).toHaveLength(1)
  })
})
