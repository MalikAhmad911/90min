import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import {
  findUserByUsername,
  countUsers,
  createUserIfAbsent,
  recordLogin,
  type User,
} from './store'
import { SESSION_COOKIE, verifySession, type SessionPayload } from './session'

// Node-runtime auth helpers (bcrypt + next/headers). Not edge-safe.

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/** Creates the seed admin from env on first run if no users exist yet. */
export async function seedAdminIfEmpty(): Promise<void> {
  const username = process.env.ADMIN_USERNAME
  const password = process.env.ADMIN_PASSWORD
  if (!username || !password) return

  if ((await countUsers()) > 0) return

  const passwordHash = await hashPassword(password)
  // Racing cold starts are settled by the unique index, not by the check above.
  await createUserIfAbsent(username, passwordHash)
}

/**
 * Returns the user on valid credentials, else null.
 *
 * The bcrypt comparison runs even when the username is unknown. Returning
 * early would make "no such user" measurably faster than "wrong password",
 * which is enough to enumerate accounts.
 */
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

export async function authenticate(username: string, password: string): Promise<User | null> {
  await seedAdminIfEmpty()

  const user = await findUserByUsername(username)
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)

  if (!user || !ok) return null

  await recordLogin(user.id).catch(() => {
    // Login must not fail because we could not write a timestamp.
  })
  return user
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
