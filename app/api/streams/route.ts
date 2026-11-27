import { NextRequest, NextResponse } from 'next/server'
import { readStreams, setStreamOverride, deleteStreamOverride } from '@/lib/server/store'
import { requireAdmin } from '@/lib/server/auth'
import { consume, tooManyRequests, ADMIN_MUTATION_LIMIT } from '@/lib/server/rate-limit'
import { streamsPostSchema } from '@/lib/validation/streams'
import { parseJsonBody } from '@/lib/validation/request'

// Public: anyone can read the overrides (the Watch page needs them). Not rate
// limited - see ADMIN_MUTATION_LIMIT for why public reads stay write-free.
export async function GET() {
  const overrides = await readStreams()
  return NextResponse.json(overrides)
}

// Admin only: upsert (stream provided) or remove (stream null) one entry.
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limited = await consume('admin-mutation', session.sub, ADMIN_MUTATION_LIMIT)
  if (!limited.allowed) return tooManyRequests(limited)

  const parsed = await parseJsonBody(req, streamsPostSchema)
  if (!parsed.ok) return parsed.response
  const { scope, key, stream } = parsed.data

  // One row, by primary key - no read-modify-write of the whole set, so two
  // admins saving at once can no longer clobber each other. Fields are picked
  // one by one from the validated payload, never spread from the request.
  if (stream === null) {
    await deleteStreamOverride(scope, key)
  } else {
    await setStreamOverride(scope, key, { kind: stream.kind, src: stream.src, title: stream.title })
  }

  return NextResponse.json(await readStreams())
}
