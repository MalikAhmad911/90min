import { NextRequest, NextResponse } from 'next/server'
import { DEVICE_ID_HEADER, isDeviceId } from '@/lib/device'

/** Small helpers shared by the /api/push routes. */

/** Request bodies here are a few hundred bytes; anything big is not a client of ours. */
const MAX_BODY_BYTES = 8 * 1024

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** Parses a JSON body with a size cap. Returns a NextResponse on failure. */
export async function readJson(req: NextRequest): Promise<{ ok: true; body: unknown } | { ok: false; res: NextResponse }> {
  let text: string
  try {
    text = await req.text()
  } catch {
    return { ok: false, res: jsonError('Invalid request body', 400) }
  }
  if (text.length > MAX_BODY_BYTES) return { ok: false, res: jsonError('Request body too large', 413) }
  try {
    return { ok: true, body: JSON.parse(text) }
  } catch {
    return { ok: false, res: jsonError('Body must be JSON', 400) }
  }
}

/** The validated `x-device-id` header, or null. */
export function headerDeviceId(req: NextRequest): string | null {
  const value = req.headers.get(DEVICE_ID_HEADER)
  return isDeviceId(value) ? value : null
}
