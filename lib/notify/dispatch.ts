import { buildMessage, topicForMatch } from './messages'
import { prefForSignal, resolvePrefs, type SignalType } from './prefs'
import { ensurePushConfigured, sendPush, type PushOptions, type PushSender } from './push'
import { isQuietTime } from './quiet-hours'
import {
  dbDispatchStore,
  type DispatchStore,
  type MatchContext,
  type PendingSignal,
  type SubscriptionRef,
} from './store'

/**
 * Turns recorded match signals into Web Push notifications.
 *
 * Run it after each sync (the cron route). It looks at signals from the last
 * `windowMinutes`, so a run that crashed or was skipped is caught up by the
 * next one, and relies on the notification log - not on "which signals are
 * new" - to never send the same alert twice.
 *
 * Delivery is at-most-once per (subscription, signal): the log row is
 * inserted BEFORE the push is sent (INSERT ... ON CONFLICT DO NOTHING
 * RETURNING), and only the run that inserted it sends. Two overlapping cron
 * runs therefore cannot both push, and a crash between claim and send loses
 * that one push rather than repeating it - for a goal alert, missing beats
 * buzzing twice.
 */

/** Consecutive failures after which a subscription is treated as dead and deleted. */
export const MAX_CONSECUTIVE_FAILURES = 5

/** Upper bound on signals handled per run, so one run cannot balloon. */
const MAX_SIGNALS_PER_RUN = 500

/** Pushes in flight at once. */
const SEND_CONCURRENCY = 10

export function dedupeKey(subscriptionId: string, signalId: number): string {
  return `${subscriptionId}:${signalId}`
}

/** How long a push service should keep trying an offline device, and how urgently. */
export function pushOptionsFor(type: SignalType, matchId: number): PushOptions {
  const topic = topicForMatch(matchId)
  switch (type) {
    case 'GOAL':
    case 'SCORE_CORRECTION':
    case 'KICKOFF':
      return { topic, ttl: 60 * 60, urgency: 'high' }
    case 'HALF_TIME':
    case 'SECOND_HALF':
      return { topic, ttl: 30 * 60, urgency: 'normal' }
    case 'FULL_TIME':
      return { topic, ttl: 3 * 60 * 60, urgency: 'normal' }
    case 'POSTPONED':
    case 'CANCELLED':
      return { topic, ttl: 24 * 60 * 60, urgency: 'normal' }
  }
}

export interface DispatchOptions {
  /** Signals created within this many minutes are considered. Default 15. */
  windowMinutes?: number
  /** Claim log rows as 'skipped' / 'dry-run' and send nothing. */
  dryRun?: boolean
  now?: Date
  store?: DispatchStore
  send?: PushSender
}

export interface DispatchResult {
  ok: boolean
  /** Set when nothing was attempted, e.g. VAPID is not configured. */
  reason?: string
  signals: number
  sent: number
  failed: number
  /** Held back by quiet hours, or claimed by a dry run. */
  skipped: number
  /** Already handled by an earlier or concurrent run. */
  deduped: number
  /** Subscriptions deleted as expired (404/410) or persistently failing. */
  pruned: number
}

/** Device ids that want this signal through at least one of their follows. */
export function devicesWanting(
  type: SignalType,
  followers: { deviceId: string; entityType: string; notify: unknown }[]
): Set<string> {
  const key = prefForSignal(type)
  const out = new Set<string>()
  for (const f of followers) {
    // Signals cannot name a player yet, so a player follow never matches.
    if (f.entityType !== 'team' && f.entityType !== 'competition' && f.entityType !== 'match') continue
    if (resolvePrefs(f.entityType, f.notify)[key]) out.add(f.deviceId)
  }
  return out
}

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn))
  }
}

export async function dispatchPendingSignals(options: DispatchOptions = {}): Promise<DispatchResult> {
  const windowMinutes = Math.min(24 * 60, Math.max(1, options.windowMinutes ?? 15))
  const now = options.now ?? new Date()
  const store = options.store ?? dbDispatchStore
  const send = options.send ?? sendPush
  const dryRun = options.dryRun ?? false

  const result: DispatchResult = {
    ok: true,
    signals: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    deduped: 0,
    pruned: 0,
  }

  // Claiming rows we then cannot send would silently burn those alerts, so
  // without VAPID details nothing is claimed; signals still in the window are
  // picked up once the configuration is fixed.
  if (!dryRun && !options.send && !ensurePushConfigured()) {
    return { ...result, ok: false, reason: 'push-not-configured' }
  }

  try {
    const since = new Date(now.getTime() - windowMinutes * 60_000)
    const signals = await store.recentSignals(since, MAX_SIGNALS_PER_RUN)
    result.signals = signals.length
    if (signals.length === 0) return result

    const contexts = await store.matchContexts([...new Set(signals.map((s) => s.matchId))])
    const followerCache = new Map<number, Awaited<ReturnType<DispatchStore['followers']>>>()
    const deadSubscriptions = new Set<string>()

    // Signals are ordered by match then seq, and handled one at a time, so a
    // match's GOAL is logged as sent before its SCORE_CORRECTION looks for it.
    for (const signal of signals) {
      const ctx = contexts.get(signal.matchId)
      if (!ctx) continue

      let followers = followerCache.get(ctx.matchId)
      if (!followers) {
        followers = await store.followers(ctx)
        followerCache.set(ctx.matchId, followers)
      }

      const devices = devicesWanting(signal.type, followers)
      if (devices.size === 0) continue

      let subs = (await store.subscriptionsForDevices([...devices])).filter(
        (s) => !deadSubscriptions.has(s.id)
      )
      if (signal.type === 'SCORE_CORRECTION') {
        // Only correct people we actually told about a goal; to anyone else
        // "goal disallowed" is news about a goal they never heard of.
        const told = await store.subscriptionsToldOfGoal(
          ctx.matchId,
          subs.map((s) => s.id)
        )
        subs = subs.filter((s) => told.has(s.id))
      }

      await inBatches(subs, SEND_CONCURRENCY, (sub) =>
        deliver(signal, ctx, sub, { store, send, now, dryRun, result, deadSubscriptions })
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message.split('\nparams:')[0].slice(0, 300) : String(err)
    console.warn('[notify] dispatch failed:', message)
    return { ...result, ok: false, reason: message }
  }

  return result
}

async function deliver(
  signal: PendingSignal,
  ctx: MatchContext,
  sub: SubscriptionRef,
  run: {
    store: DispatchStore
    send: PushSender
    now: Date
    dryRun: boolean
    result: DispatchResult
    deadSubscriptions: Set<string>
  }
) {
  const { store, send, result } = run
  const key = dedupeKey(sub.id, signal.id)

  // Quiet hours are recorded as 'skipped' rather than retried later: a goal
  // alert delivered when the quiet window ends would be hours stale.
  const quiet = isQuietTime(run.now, sub.timezone, sub.quietStartHour, sub.quietEndHour)
  if (quiet || run.dryRun) {
    const claimed = await store.claim({
      dedupeKey: key,
      subscriptionId: sub.id,
      signalId: signal.id,
      status: 'skipped',
      error: quiet ? 'quiet-hours' : 'dry-run',
    })
    if (claimed) result.skipped++
    else result.deduped++
    return
  }

  // Claimed as an in-flight failure, so a crash mid-send leaves an honest row.
  const claimed = await store.claim({
    dedupeKey: key,
    subscriptionId: sub.id,
    signalId: signal.id,
    status: 'failed',
    error: 'in-flight',
  })
  if (!claimed) {
    result.deduped++
    return
  }

  const message = buildMessage(signal.type, signal.payload, ctx, sub.locale)
  const outcome = await send(
    { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
    { ...message, matchId: ctx.matchId, signalId: signal.id, type: signal.type },
    pushOptionsFor(signal.type, ctx.matchId)
  )

  if (outcome.ok) {
    await store.markSent(key, sub.id)
    result.sent++
    return
  }

  result.failed++
  if (outcome.gone) {
    // The browser unsubscribed or the push service expired the endpoint.
    await store.deleteSubscription(sub.id)
    run.deadSubscriptions.add(sub.id)
    result.pruned++
    return
  }
  const failures = await store.markFailed(key, sub.id, outcome.error)
  if (failures >= MAX_CONSECUTIVE_FAILURES) {
    await store.deleteSubscription(sub.id)
    run.deadSubscriptions.add(sub.id)
    result.pruned++
  }
}
