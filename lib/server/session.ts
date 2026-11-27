import { SignJWT, jwtVerify } from 'jose'

// Edge-safe: jose only, no Node APIs. Imported by middleware and by auth.ts.

export const SESSION_COOKIE = 'session'

/** Session lifetime, shared by the JWT expiry and the cookie's max-age. */
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7

export interface SessionPayload {
  sub: string
  username: string
  role: 'admin'
}

/**
 * HS256 is only as strong as its key; 32 characters is the floor for a
 * random secret (e.g. `openssl rand -base64 32` gives 44).
 */
export const MIN_SECRET_LENGTH = 32

const DEV_FALLBACK_SECRET = 'dev-insecure-secret-change-me'

/**
 * The signing secret.
 *
 * In production a missing or short AUTH_SECRET throws. Falling back to a
 * built-in string there would mean the key is public - it is in this file - and
 * anyone could mint an admin session. Failing loudly turns that into a broken
 * login, which gets noticed and fixed, instead of a silent takeover.
 *
 * The fallback survives only for local development and tests.
 */
export function resolveAuthSecret(): string {
  const configured = process.env.AUTH_SECRET
  if (process.env.NODE_ENV === 'production') {
    if (!configured || configured.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `AUTH_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters in production`
      )
    }
    return configured
  }
  return configured || DEV_FALLBACK_SECRET
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(resolveAuthSecret())
}

/** Cookie flags used for both setting and clearing the session, so they cannot drift. */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ username: payload.username, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(secretKey())
}

export async function verifySession(token?: string): Promise<SessionPayload | null> {
  if (!token) return null
  // Resolved outside the try: a misconfigured secret must surface as an error,
  // not quietly read as "nobody is logged in".
  const key = secretKey()
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
    if (payload.role !== 'admin' || typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
      return null
    }
    return { sub: payload.sub, username: payload.username, role: 'admin' }
  } catch {
    return null
  }
}
