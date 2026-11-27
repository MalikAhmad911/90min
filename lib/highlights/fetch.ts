import { HIGHLIGHT_CHANNELS, feedUrls, type HighlightChannel } from './channels'
import { parseYouTubeFeed, type FeedVideo } from './atom'

/**
 * Reads the official channels' public Atom feeds (no API key, no quota).
 *
 * Server-only. Each feed is cached by Next's data cache for 30 minutes, so a
 * page or API route that asks for highlights costs YouTube at most one request
 * per channel per half hour, however much traffic we get. Nothing is stored in
 * our database: the feed is the source of truth and is small (15 entries).
 */

export const HIGHLIGHTS_REVALIDATE_SECONDS = 30 * 60

const USER_AGENT = '90MinTactics/1.0 (football scores app)'
const TIMEOUT_MS = 10_000
/** A feed is ~30-60 kB; anything far larger is not what we asked for. */
const MAX_BYTES = 2 * 1024 * 1024

/**
 * Channels also post tactics shows, interviews and shorts. The highlights page
 * keeps titles that read like a match video: "highlights"/"resumen"/"goals",
 * or a scoreline such as "2-0".
 */
export function looksLikeHighlight(title: string): boolean {
  return /highlights?|resumen|sintesi|zusammenfassung|r[eé]sum[eé]|melhores momentos|\bgoals?\b|\b\d{1,2}\s?[-–:]\s?\d{1,2}\b/i.test(
    title
  )
}

export interface HighlightVideo extends FeedVideo {
  competitionCode: string
  channelName: string
}

async function fetchFeed(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/atom+xml, application/xml' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: HIGHLIGHTS_REVALIDATE_SECONDS },
    })
    if (!res.ok) return null
    const text = await res.text()
    return text.length > MAX_BYTES ? null : text
  } catch {
    return null
  }
}

/** Latest long-form uploads of one channel; empty on any failure. */
export async function getChannelVideos(channel: HighlightChannel): Promise<HighlightVideo[]> {
  for (const url of feedUrls(channel.channelId)) {
    const xml = await fetchFeed(url)
    if (!xml) continue
    const videos = parseYouTubeFeed(xml, channel.channelId)
    if (videos.length === 0) continue
    return videos.map((v) => ({
      ...v,
      competitionCode: channel.competitionCode,
      channelName: channel.name,
    }))
  }
  return []
}

/**
 * Latest videos across channels, newest first. `competition` narrows to the
 * channels of one competition. One failing channel never empties the list.
 */
export async function getLatestHighlights(
  options: { competition?: string; limit?: number } = {}
): Promise<HighlightVideo[]> {
  const channels = options.competition
    ? HIGHLIGHT_CHANNELS.filter((c) => c.competitionCode === options.competition)
    : HIGHLIGHT_CHANNELS

  const lists = await Promise.all(channels.map(getChannelVideos))
  return lists
    .flat()
    .filter((v) => looksLikeHighlight(v.title))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, options.limit ?? 48)
}
