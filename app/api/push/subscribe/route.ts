import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { DEVICE_ID_HEADER } from '@/lib/device'
import { headerDeviceId, jsonError, readJson } from '@/lib/notify/http'
import { removeSubscription, upsertSubscription } from '@/lib/notify/subscriptions'
import { firstIssue, subscribeSchema, unsubscribeSchema } from '@/lib/notify/validation'

/**
 * Web Push subscriptions for this device.
 *
 * POST   { endpoint, keys: { p256dh, auth }, deviceId, timezone, locale,
 *          quietStartHour?, quietEndHour? }        -> upsert by endpoint
 * DELETE { endpoint } with the x-device-id header   -> unsubscribe
 *
 * No account: the device id is the bearer (see lib/device.ts). A delete is
 * scoped to the endpoint AND the device, so knowing someone's endpoint alone
 * is not enough to remove it.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) return jsonError('Notifications are unavailable', 503)

  const parsed = await readJson(req)
  if (!parsed.ok) return parsed.res

  const result = subscribeSchema.safeParse(parsed.body)
  if (!result.success) return jsonError(firstIssue(result.error), 400)

  // When the header is sent it must agree with the body, so a client cannot
  // act as one device in the header and another in the payload.
  const header = req.headers.get(DEVICE_ID_HEADER)
  if (header !== null && header !== result.data.deviceId) {
    return jsonError('Device id mismatch', 400)
  }

  try {
    await upsertSubscription(result.data)
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.warn('[notify] subscribe failed:', err instanceof Error ? err.message.split('\nparams:')[0] : err)
    return jsonError('Could not save the subscription', 500)
  }
}

export async function DELETE(req: NextRequest) {
  if (!isDatabaseConfigured()) return jsonError('Notifications are unavailable', 503)

  const deviceId = headerDeviceId(req)
  if (!deviceId) return jsonError('Missing or invalid x-device-id header', 400)

  const parsed = await readJson(req)
  if (!parsed.ok) return parsed.res

  const result = unsubscribeSchema.safeParse(parsed.body)
  if (!result.success) return jsonError(firstIssue(result.error), 400)

  try {
    const removed = await removeSubscription(deviceId, result.data.endpoint)
    return NextResponse.json({ ok: true, removed }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.warn('[notify] unsubscribe failed:', err instanceof Error ? err.message.split('\nparams:')[0] : err)
    return jsonError('Could not remove the subscription', 500)
  }
}
