import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import {
  deleteFollow,
  entityExists,
  listFollows,
  upsertFollow,
} from '@/lib/db/follow-queries'
import {
  MAX_FOLLOWS_PER_DEVICE,
  deviceIdFrom,
  firstIssue,
  followInputSchema,
  unfollowInputSchema,
} from './schema'

/**
 * A device's follows (PRD MAT-2, ON-1).
 *
 *   GET    -> { follows: FollowRecord[] }
 *   PUT    { entityType, entityKey, notify? } -> follow / update toggles
 *   DELETE { entityType, entityKey }           -> unfollow
 *
 * Authorisation is possession of the device id in the `x-device-id` header:
 * every read and write is scoped to that id, and no request can name another
 * device. See `deviceIdFrom` for why a bearer id is acceptable here.
 */

export const dynamic = 'force-dynamic'

/** Personal to one device: never let a shared cache keep it. */
const NO_STORE = { 'Cache-Control': 'private, no-store' }

/** Bodies are a few dozen bytes; refuse anything that is plainly not a follow. */
const MAX_BODY_BYTES = 2_048

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE })
}

async function readJson(req: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    const text = await req.text()
    if (text.length > MAX_BODY_BYTES) return { ok: false }
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

function preconditions(req: NextRequest): { deviceId: string } | NextResponse {
  const deviceId = deviceIdFrom(req.headers)
  if (!deviceId) return error('Missing or invalid device id', 400)
  if (!isDatabaseConfigured()) return error('Follows are unavailable', 503)
  return { deviceId }
}

export async function GET(req: NextRequest) {
  const pre = preconditions(req)
  if (pre instanceof NextResponse) return pre
  try {
    const follows = await listFollows(pre.deviceId)
    return NextResponse.json({ follows }, { headers: NO_STORE })
  } catch {
    return error('Could not load follows', 502)
  }
}

export async function PUT(req: NextRequest) {
  const pre = preconditions(req)
  if (pre instanceof NextResponse) return pre

  const body = await readJson(req)
  if (!body.ok) return error('Body must be a small JSON object', 400)
  const parsed = followInputSchema.safeParse(body.value)
  if (!parsed.success) return error(firstIssue(parsed.error), 400)
  const input = parsed.data

  try {
    if (!(await entityExists(input.entityType, input.entityKey))) {
      return error(`Unknown ${input.entityType}`, 404)
    }
    const result = await upsertFollow(pre.deviceId, input, MAX_FOLLOWS_PER_DEVICE)
    if (result.status === 'limit') {
      return error(`You can follow up to ${MAX_FOLLOWS_PER_DEVICE} things`, 409)
    }
    return NextResponse.json(
      { follow: result.follow, status: result.status },
      { status: result.status === 'created' ? 201 : 200, headers: NO_STORE }
    )
  } catch {
    return error('Could not save follow', 502)
  }
}

export async function DELETE(req: NextRequest) {
  const pre = preconditions(req)
  if (pre instanceof NextResponse) return pre

  const body = await readJson(req)
  if (!body.ok) return error('Body must be a small JSON object', 400)
  const parsed = unfollowInputSchema.safeParse(body.value)
  if (!parsed.success) return error(firstIssue(parsed.error), 400)

  try {
    const removed = await deleteFollow(pre.deviceId, parsed.data.entityType, parsed.data.entityKey)
    // Idempotent: unfollowing something not followed is still a success.
    return NextResponse.json({ removed }, { headers: NO_STORE })
  } catch {
    return error('Could not remove follow', 502)
  }
}
