/**
 * YouTube helpers shared by the highlights sync, the API and the UI.
 *
 * Everything that ends up in an `src` or `href` is built here from a video id
 * that has passed `isValidVideoId`, never taken from a feed or a database row
 * as-is. A stored title or URL can therefore never turn into a script URL,
 * another host or an attribute break-out.
 *
 * Client-safe: no server imports.
 */

/** YouTube video ids: exactly 11 characters of the URL-safe base64 alphabet. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export function isValidVideoId(id: unknown): id is string {
  return typeof id === 'string' && VIDEO_ID.test(id)
}

/** Channel ids are "UC" plus 22 characters of the same alphabet. */
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/

export function isValidChannelId(id: unknown): id is string {
  return typeof id === 'string' && CHANNEL_ID.test(id)
}

/**
 * The thumbnail we show. Always i.ytimg.com, whatever host the feed named
 * (feeds use i1-i4.ytimg.com): one host to allow in CSP and next/image.
 * `hqdefault` exists for every public video and is 480x360 (4:3, letterboxed).
 */
export function thumbnailUrl(videoId: string): string | null {
  return isValidVideoId(videoId) ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null
}

/** True only for an https URL on i.ytimg.com. */
export function isYouTubeThumbnail(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === 'i.ytimg.com'
  } catch {
    return false
  }
}

/**
 * Privacy-enhanced embed. youtube-nocookie.com sets no cookies until the
 * viewer presses play; `rel=0` keeps related videos to the same channel.
 */
export function embedUrl(videoId: string, options: { autoplay?: boolean } = {}): string | null {
  if (!isValidVideoId(videoId)) return null
  const params = new URLSearchParams({ rel: '0' })
  if (options.autoplay) params.set('autoplay', '1')
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
}

/** "Watch on YouTube" link. */
export function watchUrl(videoId: string): string | null {
  return isValidVideoId(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : null
}
