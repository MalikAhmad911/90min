// @vitest-environment node
import { signSession, verifySession } from '@/lib/server/session'

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-for-session-roundtrip'
})

describe('session', () => {
  it('signs and verifies a valid session round-trip', async () => {
    const token = await signSession({ sub: 'admin', username: 'admin', role: 'admin' })
    const payload = await verifySession(token)
    expect(payload).not.toBeNull()
    expect(payload?.username).toBe('admin')
    expect(payload?.role).toBe('admin')
  })

  it('returns null for a missing token', async () => {
    expect(await verifySession(undefined)).toBeNull()
  })

  it('returns null for a tampered token', async () => {
    const token = await signSession({ sub: 'admin', username: 'admin', role: 'admin' })
    expect(await verifySession(token + 'x')).toBeNull()
  })

  it('returns null when signed with a different secret', async () => {
    const token = await signSession({ sub: 'a', username: 'a', role: 'admin' })
    process.env.AUTH_SECRET = 'a-completely-different-secret'
    const payload = await verifySession(token)
    process.env.AUTH_SECRET = 'test-secret-for-session-roundtrip'
    expect(payload).toBeNull()
  })
})
