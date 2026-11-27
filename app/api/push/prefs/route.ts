import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { headerDeviceId, jsonError, readJson } from '@/lib/notify/http'
import { getDevicePrefs, updateFollowNotify, updateQuietHours } from '@/lib/notify/subscriptions'
import { firstIssue, prefsPatchSchema } from '@/lib/notify/validation'

/**
 * Notification preferences for the device named in the x-device-id header.
 *
 * GET   -> { subscribed, quietStartHour, quietEndHour, timezone, follows: [...] }
 * PATCH { follow: { entityType, entityKey, notify: { goals?: bool, ... } } }
 *       | { quietHours: { quietStartHour, quietEndHour, timezone? } }
 *
 * Every read and write is filtered by that device id, so one device can never
 * see or change another's follows. Toggle keys are allow-listed by the schema.
 */

export const dynamic = 'force-dynamic'
// The Neon driver queries over fetch(); without this Next can replay a cached
// query result here instead of reading the database.
export const fetchCache = 'force-no-store'

const noStore = { 'Cache-Control': 'no-store' }

export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured()) return jsonError('Notifications are unavailable', 503)
  const deviceId = headerDeviceId(req)
  if (!deviceId) return jsonError('Missing or invalid x-device-id header', 400)

  try {
    return NextResponse.json(await getDevicePrefs(deviceId), { headers: noStore })
  } catch (err) {
    console.warn('[notify] prefs read failed:', err instanceof Error ? err.message.split('\nparams:')[0] : err)
    return jsonError('Could not load preferences', 500)
  }
}

export async function PATCH(req: NextRequest) {
  if (!isDatabaseConfigured()) return jsonError('Notifications are unavailable', 503)
  const deviceId = headerDeviceId(req)
  if (!deviceId) return jsonError('Missing or invalid x-device-id header', 400)

  const parsed = await readJson(req)
  if (!parsed.ok) return parsed.res

  const result = prefsPatchSchema.safeParse(parsed.body)
  if (!result.success) return jsonError(firstIssue(result.error), 400)

  try {
    if ('follow' in result.data) {
      const { entityType, entityKey, notify } = result.data.follow
      const prefs = await updateFollowNotify(deviceId, entityType, entityKey, notify)
      if (!prefs) return jsonError('Not following that', 404)
      return NextResponse.json({ ok: true, entityType, entityKey, prefs }, { headers: noStore })
    }

    const updated = await updateQuietHours(deviceId, result.data.quietHours)
    if (updated === 0) return jsonError('Enable notifications on this device first', 409)
    return NextResponse.json({ ok: true, ...result.data.quietHours }, { headers: noStore })
  } catch (err) {
    console.warn('[notify] prefs write failed:', err instanceof Error ? err.message.split('\nparams:')[0] : err)
    return jsonError('Could not save preferences', 500)
  }
}
