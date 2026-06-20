import { SignJWT, jwtVerify } from 'jose'

// Edge-safe: jose only, no Node APIs. Imported by middleware and by auth.ts.

export const SESSION_COOKIE = 'session'

export interface SessionPayload {
  sub: string
  username: string
  role: 'admin'
}

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-insecure-secret-change-me')
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ username: payload.username, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret())
}

export async function verifySession(token?: string): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    return {
      sub: String(payload.sub),
      username: String(payload.username),
      role: payload.role as 'admin',
    }
  } catch {
    return null
  }
}
