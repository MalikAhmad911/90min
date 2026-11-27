import { isValidChannelId, isValidVideoId, thumbnailUrl } from './youtube'

/**
 * Parser for YouTube's Atom video feeds
 * (https://www.youtube.com/feeds/videos.xml?channel_id=... / ?playlist_id=...).
 *
 * Not a general XML parser. YouTube's feed is a flat, machine-generated
 * document: a <feed> of <entry> elements, each with <yt:videoId>,
 * <yt:channelId>, <title>, <published> and a <media:group>. This reads exactly
 * those fields and decodes the five XML entities plus numeric references.
 * Anything malformed is dropped entry by entry, never thrown: one odd video
 * must not cost a whole channel.
 *
 * The output is untrusted text either way - ids are validated here, and titles
 * are only ever rendered as React text.
 */

export interface FeedVideo {
  videoId: string
  channelId: string
  title: string
  publishedAt: Date
  /** Always https://i.ytimg.com/... (built from the id, not taken from the feed). */
  thumbnailUrl: string
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function decodeXmlText(raw: string): string {
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  if (cdata) return cdata[1]
  return raw.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
      // Outside Unicode, or a lone surrogate: keep the text as written.
      if (!Number.isFinite(code) || code < 1 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return whole
      }
      return String.fromCodePoint(code)
    }
    return NAMED[ref.toLowerCase()] ?? whole
  })
}

function escapeTag(tag: string): string {
  return tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Text content of the first <tag>...</tag> in `xml`, decoded; null if absent. */
function firstText(xml: string, tag: string): string | null {
  const re = new RegExp(`<${escapeTag(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeTag(tag)}>`)
  const m = xml.match(re)
  return m ? decodeXmlText(m[1]).trim() : null
}

/** Collapses whitespace and strips control characters from a title. */
function cleanTitle(title: string): string {
  return title
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}

/**
 * Parses one feed document. `expectedChannelId`, when given, drops entries
 * from any other channel (a playlist feed can in principle contain them).
 */
export function parseYouTubeFeed(xml: string, expectedChannelId?: string): FeedVideo[] {
  if (typeof xml !== 'string' || !xml.includes('<feed')) return []

  const out: FeedVideo[] = []
  const seen = new Set<string>()
  const entries = xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/g) ?? []

  for (const entry of entries) {
    const videoId = firstText(entry, 'yt:videoId') ?? firstText(entry, 'id')?.replace(/^yt:video:/, '') ?? ''
    if (!isValidVideoId(videoId) || seen.has(videoId)) continue

    const channelId = firstText(entry, 'yt:channelId') ?? ''
    if (!isValidChannelId(channelId)) continue
    if (expectedChannelId && channelId !== expectedChannelId) continue

    // <title> is the entry's; <media:title> inside media:group is the same text.
    const title = cleanTitle(firstText(entry, 'title') ?? firstText(entry, 'media:title') ?? '')
    if (!title) continue

    const published = new Date(firstText(entry, 'published') ?? '')
    if (Number.isNaN(published.getTime())) continue

    const thumb = thumbnailUrl(videoId)
    if (!thumb) continue

    seen.add(videoId)
    out.push({ videoId, channelId, title, publishedAt: published, thumbnailUrl: thumb })
  }
  return out
}
