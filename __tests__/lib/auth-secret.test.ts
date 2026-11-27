// @vitest-environment node
import {
  resolveAuthSecret,
  signSession,
  verifySession,
  sessionCookieOptions,
  MIN_SECRET_LENGTH,
} from '@/lib/server/session'

const STRONG = 'x'.repeat(MIN_SECRET_LENGTH)
const ADMIN = { sub: 'u1', username: 'admin', role: 'admin' as const }

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('AUTH_SECRET in production', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
  })

  it('throws when unset', () => {
    vi.stubEnv('AUTH_SECRET', '')
    expect(() => resolveAuthSecret()).toThrow(/AUTH_SECRET/)
  })

  it('throws when shorter than the minimum', () => {
    vi.stubEnv('AUTH_SECRET', 'x'.repeat(MIN_SECRET_LENGTH - 1))
    expect(() => resolveAuthSecret()).toThrow(/at least 32/)
  })

  it('refuses to sign or verify a session rather than use the fallback', async () => {
    vi.stubEnv('AUTH_SECRET', '')
    await expect(signSession(ADMIN)).rejects.toThrow(/AUTH_SECRET/)
    await expect(verifySession('any.token.here')).rejects.toThrow(/AUTH_SECRET/)
  })

  it('does not accept a token forged with the old dev fallback', async () => {
    // What an attacker could mint from the public source code.
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('AUTH_SECRET', '')
    const forged = await signSession(ADMIN)

    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AUTH_SECRET', STRONG)
    expect(await verifySession(forged)).toBeNull()
  })

  it('works with a long enough secret', async () => {
    vi.stubEnv('AUTH_SECRET', STRONG)
    expect(resolveAuthSecret()).toBe(STRONG)
    expect(await verifySession(await signSession(ADMIN))).toEqual(ADMIN)
  })

  it('marks the cookie secure', () => {
    expect(sessionCookieOptions(10)).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 10,
    })
  })
})

describe('AUTH_SECRET outside production', () => {
  it('falls back to the dev secret so local development works', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('AUTH_SECRET', '')
    expect(resolveAuthSecret()).toBeTruthy()
    expect(await verifySession(await signSession(ADMIN))).toEqual(ADMIN)
  })

  it('does not mark the cookie secure (localhost is http)', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(sessionCookieOptions(0).secure).toBe(false)
  })
})

describe('verifySession claims', () => {
  it('rejects a validly signed token whose role is not admin', async () => {
    vi.stubEnv('AUTH_SECRET', STRONG)
    const { SignJWT } = await import('jose')
    const token = await new SignJWT({ username: 'x', role: 'viewer' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(STRONG))
    expect(await verifySession(token)).toBeNull()
  })
})
