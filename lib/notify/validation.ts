import { z } from 'zod'
import { isDeviceId } from '@/lib/device'
import { isValidTimeZone } from '@/lib/timezone'
import { NOTIFY_LOCALES } from './messages'
import { NOTIFY_KEYS } from './prefs'

/**
 * Allow-list schemas for the push APIs. Strict objects throughout: an
 * unexpected field is a 400, never something quietly passed to a write.
 */

/** Push services hand out https endpoints; anything else is not a push service. */
function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && u.hostname.length > 0
  } catch {
    return false
  }
}

// The browser's keys are base64url (RFC 7515), unpadded: p256dh is a 65-byte
// EC point (87 chars), auth a 16-byte secret (22 chars). Generous bounds,
// strict alphabet.
const base64url = /^[A-Za-z0-9_-]+={0,2}$/

const deviceId = z.string().refine(isDeviceId, 'Invalid device id')
const hour = z.number().int().min(0).max(23)

export const subscribeSchema = z
  .strictObject({
    endpoint: z.string().max(2048).refine(isHttpsUrl, 'Endpoint must be an https URL'),
    keys: z.strictObject({
      p256dh: z.string().min(40).max(200).regex(base64url, 'Invalid p256dh key'),
      auth: z.string().min(16).max(64).regex(base64url, 'Invalid auth key'),
    }),
    // PushSubscription.toJSON() includes this; accepted and ignored.
    expirationTime: z.number().nullable().optional(),
    deviceId,
    timezone: z.string().refine(isValidTimeZone, 'Invalid time zone'),
    locale: z.enum(NOTIFY_LOCALES),
    // Omitted = leave whatever is stored; null = quiet hours off.
    quietStartHour: hour.nullable().optional(),
    quietEndHour: hour.nullable().optional(),
  })
  .refine(
    (v) => (v.quietStartHour === undefined) === (v.quietEndHour === undefined),
    'Send both quiet-hour bounds or neither'
  )
  .refine(
    (v) => (v.quietStartHour === null) === (v.quietEndHour === null),
    'Quiet hours need both a start and an end, or neither'
  )

export type SubscribeInput = z.infer<typeof subscribeSchema>

export const unsubscribeSchema = z.strictObject({
  endpoint: z.string().max(2048).refine(isHttpsUrl, 'Endpoint must be an https URL'),
})

const notifyPatch = z
  .strictObject(
    Object.fromEntries(NOTIFY_KEYS.map((k) => [k, z.boolean().optional()])) as Record<
      (typeof NOTIFY_KEYS)[number],
      z.ZodOptional<z.ZodBoolean>
    >
  )
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update')

export const followPrefsSchema = z.strictObject({
  entityType: z.enum(['team', 'competition', 'match', 'player']),
  entityKey: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Invalid entity key'),
  notify: notifyPatch,
})

export const quietHoursSchema = z
  .strictObject({
    quietStartHour: hour.nullable(),
    quietEndHour: hour.nullable(),
    timezone: z.string().refine(isValidTimeZone, 'Invalid time zone').optional(),
  })
  .refine(
    (v) => (v.quietStartHour === null) === (v.quietEndHour === null),
    'Quiet hours need both a start and an end, or neither'
  )

/** PATCH /api/push/prefs: exactly one of the two shapes. */
export const prefsPatchSchema = z.union([
  z.strictObject({ follow: followPrefsSchema }),
  z.strictObject({ quietHours: quietHoursSchema }),
])

export type PrefsPatch = z.infer<typeof prefsPatchSchema>

export { deviceId as deviceIdSchema }

/** First issue as a short, user-safe message. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid request'
  const path = issue.path.join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}
