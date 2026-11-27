/*
 * 90 Min Tactics service worker: Web Push only.
 *
 * Deliberately no fetch handler and no caching. A caching worker that goes
 * wrong serves stale scores with no way for the user to notice; this one
 * only shows notifications and routes clicks.
 *
 * Payload (JSON, built by lib/notify/dispatch.ts):
 *   { title, body, url: '/match/123', tag: 'match-123', matchId, signalId, type }
 */

self.addEventListener('install', () => {
  // Nothing to precache; take over immediately so a new version applies at once.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/** Only same-origin paths are followed: a payload must not send users off-site. */
function safeUrl(raw) {
  try {
    const url = new URL(typeof raw === 'string' ? raw : '/', self.location.origin)
    return url.origin === self.location.origin ? url.href : self.location.origin + '/'
  } catch {
    return self.location.origin + '/'
  }
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // A non-JSON payload still deserves a visible notification: browsers
    // penalise (and Chrome warns about) pushes that show nothing.
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = typeof data.title === 'string' && data.title ? data.title : '90 Min Tactics'
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/logo.svg',
    badge: '/logo.svg',
    // One tag per match: a newer alert for the same match replaces the old one.
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    // ...but still buzzes, because a second goal is news.
    renotify: typeof data.tag === 'string',
    data: { url: safeUrl(data.url) },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = safeUrl(event.notification.data && event.notification.data.url)

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      // Already open on this match: just bring it forward.
      for (const client of windows) {
        if (client.url === target && 'focus' in client) return client.focus()
      }

      // Another tab of ours: reuse it rather than piling up tabs.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'navigate' in client) {
          try {
            const navigated = await client.navigate(target)
            if (navigated) return navigated.focus()
          } catch {
            // navigate() rejects for uncontrolled clients; fall through.
          }
        }
      }

      return self.clients.openWindow(target)
    })()
  )
})
