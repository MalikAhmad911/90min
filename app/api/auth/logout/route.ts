import { NextResponse } from 'next/server'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/server/session'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  // Same flags as when the cookie was set: a browser only overwrites a cookie
  // whose name, path and domain match, and keeping every flag identical means
  // the clearing cookie is never weaker (e.g. sent over http) than the original.
  res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0))
  return res
}
