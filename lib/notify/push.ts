import { setVapidDetails, sendNotification, WebPushError } from 'web-push'

/**
 * Web Push delivery (VAPID). The only module that talks to push services.
 *
 * Configuration comes from the environment:
 *   VAPID_PUBLIC_KEY (or NEXT_PUBLIC_VAPID_PUBLIC_KEY), VAPID_PRIVATE_KEY,
 *   VAPID_SUBJECT - an https: URL or mailto: address push services can use to
 *   contact the sender. When it is unset, the deployed site URL (`URL`, which
 *   Netlify sets) is used if it is https.
 * Anything missing or invalid disables sending with a warning instead of
 * throwing: a misconfigured notifier must not take the sync job down with it.
 */

export interface VapidConfig {
  subject: string
  publicKey: string
  privateKey: string
}

type Env = Record<string, string | undefined>

function validSubject(value: string | undefined, allowMailto: boolean): string | null {
  const v = value?.trim()
  if (!v) return null
  try {
    const u = new URL(v)
    if (u.protocol === 'https:' && u.hostname) return v
    if (allowMailto && u.protocol === 'mailto:' && u.pathname.includes('@')) return v
  } catch {
    // not a URL at all
  }
  return null
}

/** VAPID_SUBJECT if valid, else the site URL when it is https, else null. */
export function resolveVapidSubject(env: Env = process.env): string | null {
  return validSubject(env.VAPID_SUBJECT, true) ?? validSubject(env.URL, false)
}

export function readVapidConfig(env: Env = process.env): VapidConfig | null {
  const publicKey = (env.VAPID_PUBLIC_KEY || env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)?.trim()
  const privateKey = env.VAPID_PRIVATE_KEY?.trim()
  const subject = resolveVapidSubject(env)
  if (!publicKey || !privateKey || !subject) return null
  return { subject, publicKey, privateKey }
}

let configured: boolean | null = null
let warned = false

function warnOnce(message: string) {
  if (warned) return
  warned = true
  console.warn(`[notify] ${message}`)
}

/**
 * Applies the VAPID details once per process. Returns false (after a single
 * warning) when sending is not possible.
 */
export function ensurePushConfigured(env: Env = process.env): boolean {
  if (configured !== null) return configured
  const config = readVapidConfig(env)
  if (!config) {
    warnOnce(
      'Web Push disabled: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and an https:/mailto: VAPID_SUBJECT (or an https URL).'
    )
    configured = false
    return false
  }
  try {
    setVapidDetails(config.subject, config.publicKey, config.privateKey)
    configured = true
  } catch (err) {
    // web-push validates key lengths and the subject; report the reason, not the keys.
    warnOnce(`Web Push disabled: ${err instanceof Error ? err.message.split('.')[0] : 'invalid VAPID details'}`)
    configured = false
  }
  return configured
}

/** Test hook: forget the cached configuration. */
export function resetPushConfigForTests() {
  configured = null
  warned = false
}

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushOptions {
  /** Collapse key: a queued push with the same topic is replaced by a newer one. */
  topic: string
  /** Seconds the push service may hold the message for an offline device. */
  ttl: number
  urgency: 'very-low' | 'low' | 'normal' | 'high'
}

export type PushOutcome =
  | { ok: true; statusCode: number }
  | {
      ok: false
      /** 404/410: the subscription no longer exists and must be deleted. */
      gone: boolean
      statusCode?: number
      error: string
    }

export type PushSender = (
  target: PushTarget,
  payload: Record<string, unknown>,
  options: PushOptions
) => Promise<PushOutcome>

/** Sends one push. Never throws; the outcome says what happened. */
export const sendPush: PushSender = async (target, payload, options) => {
  if (!ensurePushConfigured()) {
    return { ok: false, gone: false, error: 'push not configured' }
  }
  try {
    const res = await sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { TTL: options.ttl, urgency: options.urgency, topic: options.topic, timeout: 10_000 }
    )
    return { ok: true, statusCode: res.statusCode }
  } catch (err) {
    if (err instanceof WebPushError) {
      return {
        ok: false,
        gone: err.statusCode === 404 || err.statusCode === 410,
        statusCode: err.statusCode,
        error: `${err.statusCode} ${(err.body || err.message || '').slice(0, 200)}`.trim(),
      }
    }
    return { ok: false, gone: false, error: err instanceof Error ? err.message.slice(0, 200) : String(err) }
  }
}
