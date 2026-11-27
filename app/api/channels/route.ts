import { NextRequest, NextResponse } from 'next/server'
import { readChannels, addChannel, removeChannel } from '@/lib/server/store'
import { requireAdmin } from '@/lib/server/auth'
import { consume, tooManyRequests, ADMIN_MUTATION_LIMIT } from '@/lib/server/rate-limit'
import { channelsPostSchema } from '@/lib/validation/streams'
import { parseJsonBody } from '@/lib/validation/request'

// Public: the Live TV section reads channels. Not rate limited - see
// ADMIN_MUTATION_LIMIT for why public reads stay write-free.
export async function GET() {
  const channels = await readChannels()
  return NextResponse.json({ channels })
}

// Admin only: add a channel, or remove one by id.
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limited = await consume('admin-mutation', session.sub, ADMIN_MUTATION_LIMIT)
  if (!limited.allowed) return tooManyRequests(limited)

  const parsed = await parseJsonBody(req, channelsPostSchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  if (body.action === 'add') {
    // Explicit fields from the validated payload, never a spread of the request.
    const { name, kind, src } = body.channel
    await addChannel({ name, kind, src })
  } else {
    await removeChannel(body.id)
  }

  return NextResponse.json({ channels: await readChannels() })
}
