import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/server/session'

// Fails closed: an invalid session redirects to login, and a production deploy
// without a proper AUTH_SECRET makes verifySession throw (an error page)
// rather than accept tokens signed with a public fallback key.
export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const session = await verifySession(token)

  if (session?.role === 'admin') {
    return NextResponse.next()
  }

  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('next', req.nextUrl.pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/admin/:path*'],
}
