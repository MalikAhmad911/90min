import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/server/auth'
import {
  signSession,
  sessionCookieOptions,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
} from '@/lib/server/session'
import {
  clientIp,
  consume,
  reset,
  tooManyRequests,
  LOGIN_IP_LIMIT,
  LOGIN_USER_LIMIT,
} from '@/lib/server/rate-limit'
import { loginSchema } from '@/lib/validation/auth'
import { parseJsonBody } from '@/lib/validation/request'

// One message for every throttled case: saying which limit tripped would tell
// an attacker whether rotating IPs or usernames gets them further.
const THROTTLED = 'Too many login attempts. Try again later.'

export async function POST(req: NextRequest) {
  // Counted before the body is even read, so malformed requests spend the
  // same budget as real guesses.
  const byIp = await consume('login-ip', clientIp(req.headers), LOGIN_IP_LIMIT)
  if (!byIp.allowed) return tooManyRequests(byIp, THROTTLED)

  const parsed = await parseJsonBody(req, loginSchema, {
    publicError: 'Username and password required',
  })
  if (!parsed.ok) return parsed.response
  const { username, password } = parsed.data

  // Keyed on the name as typed (case-folded, as the lookup is), whether or
  // not the account exists. Unknown and real usernames are throttled alike,
  // so a 429 says nothing about which accounts exist. The attempt is recorded
  // before the password check rather than after a failure: recording after
  // would let a burst of parallel guesses all pass the check together.
  const userKey = username.toLowerCase()
  const byUser = await consume('login-user', userKey, LOGIN_USER_LIMIT)
  if (!byUser.allowed) return tooManyRequests(byUser, THROTTLED)

  // authenticate() runs bcrypt even for unknown users (constant time).
  const user = await authenticate(username, password)
  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // The per-username limit counts failures; a success wipes the slate. The
  // per-IP limit is left alone - it bounds request volume, not guesses.
  await reset('login-user', userKey).catch(() => {})

  const token = await signSession({ sub: user.id, username: user.username, role: user.role })
  const res = NextResponse.json({ ok: true, username: user.username })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE_SEC))
  return res
}
