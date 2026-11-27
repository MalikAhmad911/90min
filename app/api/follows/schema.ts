import { z } from 'zod'
import { FREE_COMPETITION_CODES } from '@/lib/competitions'
import { DEVICE_ID_HEADER, isDeviceId } from '@/lib/device'

/**
 * Allow-list validation for the follows API.
 *
 * Every field a client can send is named here; anything else is rejected
 * rather than ignored, so a client bug (or a probe) fails loudly with a 400
 * instead of being half-applied. Nothing from the request body reaches the
 * database except through the parsed values below.
 */

export const NOTIFY_KEYS = ['goals', 'kickoff', 'halfTime', 'fullTime', 'redCards', 'lineups'] as const
export type NotifyKey = (typeof NOTIFY_KEYS)[number]
export type NotifyPrefs = Partial<Record<NotifyKey, boolean>>

/** Per-device ceiling. Bounds storage and the notifier's fan-out per device. */
export const MAX_FOLLOWS_PER_DEVICE = 200

/** Per-follow alert toggles: only the known keys, only booleans. */
export const notifySchema = z.strictObject({
  goals: z.boolean().optional(),
  kickoff: z.boolean().optional(),
  halfTime: z.boolean().optional(),
  fullTime: z.boolean().optional(),
  redCards: z.boolean().optional(),
  lineups: z.boolean().optional(),
})

/**
 * Provider ids are positive 32-bit integers. Kept as a string because that is
 * how `follows.entity_key` stores every kind of key; the canonical form (no
 * leading zeros, no sign) means one entity can never be followed twice under
 * two spellings.
 */
const integerKey = z
  .string()
  .regex(/^[1-9][0-9]{0,9}$/, 'Expected a positive integer id')
  .refine((v) => Number(v) <= 2_147_483_647, 'Id out of range')

const competitionKey = z
  .string()
  .refine((v) => FREE_COMPETITION_CODES.includes(v), 'Unknown competition')

const target = {
  team: z.strictObject({ entityType: z.literal('team'), entityKey: integerKey }),
  match: z.strictObject({ entityType: z.literal('match'), entityKey: integerKey }),
  player: z.strictObject({ entityType: z.literal('player'), entityKey: integerKey }),
  competition: z.strictObject({ entityType: z.literal('competition'), entityKey: competitionKey }),
}

/** PUT body: follow (idempotent), optionally setting notification toggles. */
export const followInputSchema = z.discriminatedUnion('entityType', [
  target.team.extend({ notify: notifySchema.optional() }),
  target.match.extend({ notify: notifySchema.optional() }),
  target.player.extend({ notify: notifySchema.optional() }),
  target.competition.extend({ notify: notifySchema.optional() }),
])

/** DELETE body: unfollow (idempotent). */
export const unfollowInputSchema = z.discriminatedUnion('entityType', [
  target.team,
  target.match,
  target.player,
  target.competition,
])

export type FollowInput = z.infer<typeof followInputSchema>
export type UnfollowInput = z.infer<typeof unfollowInputSchema>

/**
 * The device id from the request headers, or null when absent or malformed.
 *
 * The id is a bearer secret: whoever holds it can read and change that
 * device's follows. That is acceptable because follows are low-value,
 * non-personal preferences (no account, no name, no contact details), the id
 * is 128 random bits so it cannot be guessed, and it only ever travels in a
 * header over HTTPS - never in a URL, where it would end up in logs.
 */
export function deviceIdFrom(headers: Headers): string | null {
  const value = headers.get(DEVICE_ID_HEADER)
  return isDeviceId(value) ? value : null
}

/** First validation message, for a terse 400 body. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid request'
  const path = issue.path.join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}
