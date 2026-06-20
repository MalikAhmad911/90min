import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { readUsers, writeUsers, type User } from './store'
import { SESSION_COOKIE, verifySession, type SessionPayload } from './session'

// Node-runtime auth helpers (bcrypt + fs + next/headers). Not edge-safe.

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/** Creates the seed admin from env on first run if no users exist yet. */
export async function seedAdminIfEmpty(): Promise<void> {
  const users = await readUsers()
  if (users.length > 0) return

  const username = process.env.ADMIN_USERNAME
  const password = process.env.ADMIN_PASSWORD
  if (!username || !password) return

  const passwordHash = await hashPassword(password)
  await writeUsers([{ id: 'admin', username, passwordHash, role: 'admin' }])
}

/** Returns the user on valid credentials, else null. */
export async function authenticate(username: string, password: string): Promise<User | null> {
  await seedAdminIfEmpty()
  const users = await readUsers()
  const user = users.find((u) => u.username === username)
  if (!user) return null
  const ok = await verifyPassword(password, user.passwordHash)
  return ok ? user : null
}

/** Reads + verifies the session cookie (server components / route handlers). */
export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value
  return verifySession(token)
}

/** Returns the admin session or null. */
export async function requireAdmin(): Promise<SessionPayload | null> {
  const session = await getSession()
  return session?.role === 'admin' ? session : null
}
