import type { DispatchStore, FollowRef, MatchContext, PendingSignal, SubscriptionRef } from '@/lib/notify/store'

/*
 * The dispatcher against an in-memory store, with web-push's sendNotification
 * mocked: nothing here reaches a real push service or the database.
 */

const webPush = vi.hoisted(() => {
  class WebPushError extends Error {
    statusCode: number
    body: string
    constructor(message: string, statusCode: number, body = '') {
      super(message)
      this.statusCode = statusCode
      this.body = body
    }
  }
  return {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
    WebPushError,
  }
})

vi.mock('web-push', () => webPush)

import { dispatchPendingSignals, MAX_CONSECUTIVE_FAILURES } from '@/lib/notify/dispatch'
import { resetPushConfigForTests } from '@/lib/notify/push'

const NOW = new Date('2026-11-28T15:00:00Z') // 15:00 UTC, 20:00 in Karachi

const CTX: MatchContext = {
  matchId: 900,
  homeTeamId: 57,
  awayTeamId: 61,
  competitionCode: 'PL',
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  competitionName: 'Premier League',
}

function signal(id: number, type: PendingSignal['type'], extra: Partial<PendingSignal['payload']> = {}): PendingSignal {
  return {
    id,
    matchId: 900,
    seq: id,
    type,
    payload: {
      status: 'IN_PLAY',
      home: 2,
      away: 1,
      prevStatus: 'IN_PLAY',
      prevHome: 1,
      prevAway: 1,
      ...extra,
    },
    createdAt: new Date(NOW.getTime() - 60_000),
  }
}

function sub(id: string, deviceId: string, extra: Partial<SubscriptionRef> = {}): SubscriptionRef {
  return {
    id,
    deviceId,
    endpoint: `https://push.example.test/${id}`,
    p256dh: 'p256dh-key',
    auth: 'auth-key',
    timezone: 'UTC',
    locale: 'en',
    quietStartHour: null,
    quietEndHour: null,
    ...extra,
  }
}

/** A store whose `log` behaves like notification_log's primary key. */
function memoryStore(init: { signals: PendingSignal[]; follows: FollowRef[]; subs: SubscriptionRef[] }) {
  const log = new Map<string, { subscriptionId: string; signalId: number; status: string; error: string | null }>()
  const subs = new Map(init.subs.map((s) => [s.id, { ...s, failureCount: 0 }]))
  let signals = init.signals

  const store: DispatchStore = {
    async recentSignals(since) {
      return signals.filter((s) => s.createdAt >= since)
    },
    async matchContexts(ids) {
      return new Map(ids.includes(CTX.matchId) ? [[CTX.matchId, CTX]] : [])
    },
    async followers() {
      return init.follows
    },
    async subscriptionsForDevices(deviceIds) {
      return [...subs.values()].filter((s) => deviceIds.includes(s.deviceId))
    },
    async subscriptionsToldOfGoal(_matchId, ids) {
      const goalIds = new Set(signals.filter((s) => s.type === 'GOAL').map((s) => s.id))
      return new Set(
        [...log.values()]
          .filter((r) => r.status === 'sent' && goalIds.has(r.signalId) && ids.includes(r.subscriptionId))
          .map((r) => r.subscriptionId)
      )
    },
    async claim(e) {
      if (log.has(e.dedupeKey)) return false
      log.set(e.dedupeKey, { subscriptionId: e.subscriptionId, signalId: e.signalId, status: e.status, error: e.error })
      return true
    },
    async markSent(key) {
      log.get(key)!.status = 'sent'
    },
    async markFailed(key, subscriptionId, error) {
      Object.assign(log.get(key)!, { status: 'failed', error })
      const s = subs.get(subscriptionId)!
      s.failureCount += 1
      return s.failureCount
    },
    async deleteSubscription(id) {
      subs.delete(id)
      // ON DELETE CASCADE
      for (const [k, r] of log) if (r.subscriptionId === id) log.delete(k)
    },
  }
  return { store, log, subs, setSignals: (s: PendingSignal[]) => (signals = s) }
}

beforeEach(() => {
  webPush.sendNotification.mockReset()
  webPush.setVapidDetails.mockReset()
  webPush.sendNotification.mockResolvedValue({ statusCode: 201, body: '', headers: {} })
  vi.stubEnv('VAPID_PUBLIC_KEY', 'test-public-key')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private-key')
  vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.com')
  resetPushConfigForTests()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('dispatchPendingSignals', () => {
  it('sends one push per device even when three of its follows match (NT-2)', async () => {
    const { store, log } = memoryStore({
      signals: [signal(1, 'GOAL', { side: 'home', delta: 1 })],
      follows: [
        { deviceId: 'device-a', entityType: 'team', entityKey: '57', notify: {} },
        { deviceId: 'device-a', entityType: 'competition', entityKey: 'PL', notify: { goals: true } },
        { deviceId: 'device-a', entityType: 'match', entityKey: '900', notify: {} },
      ],
      subs: [sub('sub-a', 'device-a')],
    })

    const result = await dispatchPendingSignals({ store, now: NOW })

    expect(webPush.sendNotification).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ ok: true, signals: 1, sent: 1, failed: 0, deduped: 0 })
    expect(log.get('sub-a:1')?.status).toBe('sent')

    const [target, body, options] = webPush.sendNotification.mock.calls[0]
    expect(target).toEqual({ endpoint: 'https://push.example.test/sub-a', keys: { p256dh: 'p256dh-key', auth: 'auth-key' } })
    expect(JSON.parse(body)).toMatchObject({
      title: 'GOAL! Arsenal 2–1 Chelsea',
      url: '/match/900',
      tag: 'match-900',
    })
    expect(options).toMatchObject({ topic: 'match-900', urgency: 'high' })
    expect(webPush.setVapidDetails).toHaveBeenCalledWith('mailto:test@example.com', 'test-public-key', 'test-private-key')
  })

  it('a second run sends nothing for the same signal', async () => {
    const { store } = memoryStore({
      signals: [signal(1, 'GOAL', { side: 'home', delta: 1 })],
      follows: [{ deviceId: 'device-a', entityType: 'team', entityKey: '57', notify: {} }],
      subs: [sub('sub-a', 'device-a')],
    })
    await dispatchPendingSignals({ store, now: NOW })
    const again = await dispatchPendingSignals({ store, now: NOW })
    expect(webPush.sendNotification).toHaveBeenCalledTimes(1)
    expect(again).toMatchObject({ sent: 0, deduped: 1 })
  })

  it('two overlapping runs still send once', async () => {
    const { store } = memoryStore({
      signals: [signal(1, 'GOAL', { side: 'home', delta: 1 })],
      follows: [{ deviceId: 'device-a', entityType: 'team', entityKey: '57', notify: {} }],
      subs: [sub('sub-a', 'device-a')],
    })
    await Promise.all([
      dispatchPendingSignals({ store, now: NOW }),
      dispatchPendingSignals({ store, now: NOW }),
    ])
    expect(webPush.sendNotification).toHaveBeenCalledTimes(1)
  })

  it('sends nothing during quiet hours, in the subscriber\'s own zone (NT-4)', async () => {
    const { store, log } = memoryStore({
      signals: [signal(1, 'GOAL', { side: 'home', delta: 1 })],
      follows: [
        { deviceId: 'device-k', entityType: 'team', entityKey: '57', notify: {} },
        { deviceId: 'device-l', entityType: 'team', entityKey: '57', notify: {} },
      ],
      subs: [
        // 20:00 in Karachi: inside 19 -> 7.
        sub('sub-k', 'device-k', { timezone: 'Asia/Karachi', quietStartHour: 19, quietEndHour: 7 }),
        // 15:00 in London: outside the same window.
        sub('sub-l', 'device-l', { timezone: 'Europe/London', quietStartHour: 19, quietEndHour: 7 }),
      ],
    })

    const result = await dispatchPendingSignals({ store, now: NOW })

    expect(webPush.sendNotification).toHaveBeenCalledTimes(1)
    expect(webPush.sendNotification.mock.calls[0][0].endpoint).toContain('sub-l')
    expect(result).toMatchObject({ sent: 1, skipped: 1 })
    expect(log.get('sub-k:1')).toMatchObject({ status: 'skipped', error: 'quiet-hours' })
  })

  it('respects a follow that turned the toggle off', async () => {
    const { store } = memoryStore({
      signals: [signal(1, 'GOAL', { side: 'home', delta: 1 })],
      follows: [{ deviceId: 'device-a', entityType: 'team', entityKey: '57', notify: { goals: false } }],
      subs: [sub('sub-a', 'device-a')],
    })
    await dispatchPendingSignals({ store, now: NOW })
    expect(webPush.sendNotification).not.toHaveBeenCalled()
  })

  it('deletes the subscription on 410 Gone', async () => {
    webPush.sendNotification.mockRejectedValueOnce(new webPush.WebPushError('Gone', 410, 'expired'))
    const { store, subs } = memoryStore({
      signals: [signal(1, 'GOAL', { side: 'home', delta: 1 })],
      follows: [{ deviceId: 'device-a', entityType: 'team', entityKey: '57', notify: {} }],
      subs: [sub('sub-a', 'device-a')],
    })
    const result = await dispatchPendingSignals({ store, now: NOW })
    expect(result).toMatchObject({ failed: 1, pruned: 1, sent: 0 })
    expect(subs.has('sub-a')).toBe(false)
  })

  it('counts other failures and prunes past the threshold', async () => {
    webPush.sendNotification.mockRejectedValue(new webPush.WebPushError('Server error', 500))
    const { store, subs, log, setSignals } = memoryStore({
      signals: [],
      follows: [{ deviceId: 'device-a', entityType: 'team', entityKey: '57', notify: {} }],
      subs: [sub('sub-a', 'device-a')],
    })

    for (let i = 1; i < MAX_CONSECUTIVE_FAILURES; i++) {
      setSignals([signal(i, 'GOAL', { side: 'home', delta: 1 })])
      await dispatchPendingSignals({ store, now: NOW })
      expect(subs.get('sub-a')?.failureCount).toBe(i)
    }
    expect(log.get('sub-a:1')).toMatchObject({ status: 'failed' })

    setSignals([signal(MAX_CONSECUTIVE_FAILURES, 'GOAL', { side: 'home', delta: 1 })])
    const last = await dispatchPendingSignals({ store, now: NOW })
    expect(last.pruned).toBe(1)
    expect(subs.has('sub-a')).toBe(false)
  })

  it('sends a correction only to subscriptions that were told about the goal (NT-3)', async () => {
    const goal = signal(1, 'GOAL', { side: 'home', delta: 1 })
    const correction = signal(2, 'SCORE_CORRECTION', {
      home: 1,
      away: 1,
      prevHome: 2,
      prevAway: 1,
      side: 'home',
      delta: -1,
    })
    const { store, setSignals } = memoryStore({
      signals: [goal],
      follows: [
        { deviceId: 'device-a', entityType: 'team', entityKey: '57', notify: {} },
        { deviceId: 'device-b', entityType: 'team', entityKey: '61', notify: {} },
      ],
      subs: [sub('sub-a', 'device-a')],
    })
    await dispatchPendingSignals({ store, now: NOW })

    // Twenty minutes later the goal has left the window and device-b, which
    // subscribed in between, never heard of it. Only device-a gets corrected.
    const later = new Date(NOW.getTime() + 20 * 60_000)
    setSignals([goal, { ...correction, createdAt: new Date(later.getTime() - 60_000) }])
    const subsForB = sub('sub-b', 'device-b')
    const original = store.subscriptionsForDevices
    store.subscriptionsForDevices = async (ids) => [...(await original(ids)), ...(ids.includes('device-b') ? [subsForB] : [])]

    const result = await dispatchPendingSignals({ store, now: later })
    expect(result).toMatchObject({ signals: 1, sent: 1 })
    const calls = webPush.sendNotification.mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[1][0].endpoint).toContain('sub-a')
    expect(JSON.parse(calls[1][1]).title).toBe('Goal disallowed: Arsenal 1–1 Chelsea')
  })

  it('ignores signals older than the window', async () => {
    const old = { ...signal(1, 'GOAL', { side: 'home', delta: 1 }), createdAt: new Date(NOW.getTime() - 30 * 60_000) }
    const { store } = memoryStore({
      signals: [old],
      follows: [{ deviceId: 'device-a', entityType: 'team', entityKey: '57', notify: {} }],
      subs: [sub('sub-a', 'device-a')],
    })
    const result = await dispatchPendingSignals({ store, now: NOW, windowMinutes: 15 })
    expect(result.signals).toBe(0)
    expect(webPush.sendNotification).not.toHaveBeenCalled()
  })

  it('dry run claims rows as skipped and sends nothing', async () => {
    const { store, log } = memoryStore({
      signals: [signal(1, 'KICKOFF')],
      follows: [{ deviceId: 'device-a', entityType: 'match', entityKey: '900', notify: {} }],
      subs: [sub('sub-a', 'device-a')],
    })
    const result = await dispatchPendingSignals({ store, now: NOW, dryRun: true })
    expect(result).toMatchObject({ skipped: 1, sent: 0 })
    expect(log.get('sub-a:1')).toMatchObject({ status: 'skipped', error: 'dry-run' })
    expect(webPush.sendNotification).not.toHaveBeenCalled()
  })

  it('without VAPID configuration it claims nothing and says why', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    resetPushConfigForTests()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { store, log } = memoryStore({
      signals: [signal(1, 'GOAL', { side: 'home', delta: 1 })],
      follows: [{ deviceId: 'device-a', entityType: 'team', entityKey: '57', notify: {} }],
      subs: [sub('sub-a', 'device-a')],
    })
    const result = await dispatchPendingSignals({ store, now: NOW })
    expect(result).toMatchObject({ ok: false, reason: 'push-not-configured' })
    expect(log.size).toBe(0)
    expect(webPush.sendNotification).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
