import { z } from 'zod'

/**
 * Stream and channel payloads written by the admin UI.
 *
 * A stream `src` ends up in an <iframe> (YouTube) or is handed to the video
 * player (HLS) on public pages, so it is effectively HTML an admin publishes to
 * every visitor. Free-form strings would let a stolen or careless admin session
 * plant `javascript:` / `data:` URLs or plain-http streams there. Each kind
 * therefore accepts exactly one narrow shape and nothing else.
 */

/** A YouTube video (or live) id: exactly 11 URL-safe base64 characters. */
export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

export const MAX_HLS_URL_LENGTH = 2048
export const MAX_TITLE_LENGTH = 80
export const MAX_NAME_LENGTH = 60

// Whitespace or control characters anywhere in a URL are never legitimate, and
// the URL parser silently strips some of them, so a check on the parsed form
// alone would validate something other than what gets stored.
const UNSAFE_URL_CHARS = /[\s\u0000-\u001f\u007f]/

/**
 * True for an `https://` URL whose path ends in `.m3u8`. A query string is
 * allowed (signed CDN URLs need one); credentials and fragments are not.
 */
export function isHlsUrl(value: string): boolean {
  if (value.length > MAX_HLS_URL_LENGTH) return false
  if (UNSAFE_URL_CHARS.test(value)) return false
  // Checked on the raw string too: the parser accepts oddities such as
  // `https:host/x.m3u8` that we have no reason to store.
  if (!/^https:\/\//i.test(value)) return false

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || !url.hostname) return false
  if (url.username || url.password || url.hash) return false
  return url.pathname.toLowerCase().endsWith('.m3u8')
}

export function isYoutubeId(value: string): boolean {
  return YOUTUBE_ID_PATTERN.test(value)
}

/** One check for both kinds, for callers outside a zod schema. */
export function isValidStreamSource(kind: string, src: string): boolean {
  if (kind === 'youtube') return isYoutubeId(src)
  if (kind === 'hls') return isHlsUrl(src)
  return false
}

const youtubeIdSchema = z
  .string()
  .trim()
  .regex(YOUTUBE_ID_PATTERN, { error: 'YouTube source must be an 11-character video id' })

const hlsUrlSchema = z
  .string()
  .trim()
  .refine(isHlsUrl, { error: 'HLS source must be an https:// URL ending in .m3u8' })

/** Display text: trimmed, bounded, no control characters. */
function displayText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), { error: 'Contains control characters' })
}

const titleSchema = displayText(MAX_TITLE_LENGTH).default('')
const nameSchema = displayText(MAX_NAME_LENGTH).pipe(z.string().min(1, { error: 'Name is required' }))

const kindError = { error: 'kind must be youtube or hls' }

export const freeStreamSchema = z.discriminatedUnion(
  'kind',
  [
    z.strictObject({ kind: z.literal('youtube'), src: youtubeIdSchema, title: titleSchema }),
    z.strictObject({ kind: z.literal('hls'), src: hlsUrlSchema, title: titleSchema }),
  ],
  kindError
)

/** Stream overrides are keyed by match id or competition code. */
const streamKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,32}$/, { error: 'key must be a match id or competition code' })

/** POST /api/streams: upsert (stream) or remove (stream: null) one override. */
export const streamsPostSchema = z.strictObject({
  scope: z.enum(['match', 'competition'], { error: 'scope must be match or competition' }),
  key: streamKeySchema,
  stream: freeStreamSchema.nullable(),
})

export const newChannelSchema = z.discriminatedUnion(
  'kind',
  [
    z.strictObject({ name: nameSchema, kind: z.literal('youtube'), src: youtubeIdSchema }),
    z.strictObject({ name: nameSchema, kind: z.literal('hls'), src: hlsUrlSchema }),
  ],
  kindError
)

/** POST /api/channels: add a channel, or remove one by id. */
export const channelsPostSchema = z.discriminatedUnion(
  'action',
  [
    z.strictObject({ action: z.literal('add'), channel: newChannelSchema }),
    z.strictObject({ action: z.literal('remove'), id: z.uuid({ error: 'id must be a channel id' }) }),
  ],
  { error: 'action must be add or remove' }
)

export type StreamsPost = z.infer<typeof streamsPostSchema>
export type ChannelsPost = z.infer<typeof channelsPostSchema>
