import { NextRequest, NextResponse } from 'next/server'
import { readStreams, writeStreams } from '@/lib/server/store'
import { requireAdmin } from '@/lib/server/auth'
import type { FreeStream } from '@/lib/tv/types'

// Public: anyone can read the overrides (the Watch page needs them).
export async function GET() {
  const overrides = await readStreams()
  return NextResponse.json(overrides)
}

function isValidStream(s: unknown): s is FreeStream {
  if (!s || typeof s !== 'object') return false
  const v = s as Record<string, unknown>
  return (
    (v.kind === 'youtube' || v.kind === 'hls') &&
    typeof v.src === 'string' &&
    v.src.trim().length > 0 &&
    typeof v.title === 'string'
  )
}

// Admin only: upsert (stream provided) or remove (stream null) one entry.
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { scope?: string; key?: string; stream?: FreeStream | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { scope, key, stream } = body
  if ((scope !== 'match' && scope !== 'competition') || !key) {
    return NextResponse.json({ error: 'scope (match|competition) and key are required' }, { status: 400 })
  }
  if (stream !== null && !isValidStream(stream)) {
    return NextResponse.json({ error: 'Invalid stream payload' }, { status: 400 })
  }

  const overrides = await readStreams()
  const bucket = scope === 'match' ? overrides.byMatch : overrides.byCompetition

  if (stream === null) {
    delete bucket[key]
  } else {
    bucket[key] = stream
  }

  await writeStreams(overrides)
  return NextResponse.json(overrides)
}
