import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { readChannels, writeChannels } from '@/lib/server/store'
import { requireAdmin } from '@/lib/server/auth'
import type { Channel } from '@/lib/tv/types'

// Public: the Live TV section reads channels.
export async function GET() {
  const channels = await readChannels()
  return NextResponse.json({ channels })
}

function isValidNewChannel(c: unknown): c is Omit<Channel, 'id'> {
  if (!c || typeof c !== 'object') return false
  const v = c as Record<string, unknown>
  return (
    typeof v.name === 'string' &&
    v.name.trim().length > 0 &&
    (v.kind === 'youtube' || v.kind === 'hls') &&
    typeof v.src === 'string' &&
    v.src.trim().length > 0
  )
}

// Admin only: add a channel, or remove one by id.
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { action?: string; channel?: unknown; id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const channels = await readChannels()

  if (body.action === 'add') {
    if (!isValidNewChannel(body.channel)) {
      return NextResponse.json({ error: 'Invalid channel payload' }, { status: 400 })
    }
    const c = body.channel
    channels.push({ id: randomUUID(), name: c.name.trim(), kind: c.kind, src: c.src.trim() })
  } else if (body.action === 'remove') {
    if (!body.id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }
    const idx = channels.findIndex((c) => c.id === body.id)
    if (idx >= 0) channels.splice(idx, 1)
  } else {
    return NextResponse.json({ error: 'action must be add or remove' }, { status: 400 })
  }

  await writeChannels(channels)
  return NextResponse.json({ channels })
}
