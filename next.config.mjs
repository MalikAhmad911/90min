const isProduction = process.env.NODE_ENV === 'production'

/**
 * Security headers sent with every response.
 *
 * Deliberately no enforcing Content-Security-Policy. Pages embed YouTube
 * iframes, play HLS from arbitrary admin-chosen hosts and load crests from
 * several image CDNs; a CSP that misses one of those breaks the page silently
 * for visitors, with nothing in our logs. If one is added, ship it as
 * Content-Security-Policy-Report-Only first and promote it once clean.
 */
const securityHeaders = [
  // Stop browsers guessing a script out of a JSON or image response.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Full URL to our own pages, origin only to other sites, nothing over http.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nobody frames this site (clickjacking on the admin pages).
  { key: 'X-Frame-Options', value: 'DENY' },
  // Turn off powerful features the app never uses. Autoplay, fullscreen,
  // encrypted-media and picture-in-picture are left alone: the YouTube and HLS
  // players need them.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  // Production only: HSTS on localhost would pin the browser to https for
  // every local project. No `preload` - that is hard to undo and a decision
  // for whoever owns the domain.
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
]

/** @type {import('next').NextConfig} */
const config = {
  // No reason to advertise the framework.
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'crests.football-data.org' },
      { protocol: 'https', hostname: 'www.thesportsdb.com' },
      { protocol: 'https', hostname: 'r2.thesportsdb.com' },
      { protocol: 'https', hostname: 'media.api-sports.io' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default config
