/**
 * YouTube channels we read highlights from.
 *
 * Only official channels: the league's or governing body's own, so that
 * embedding is the rights holder's choice (they enable embedding per video;
 * a video they block simply fails to play in the player, with a link out).
 * Broadcaster channels (CBS Sports Golazo, DAZN, ESPN) are deliberately left
 * out even where they carry more match highlights.
 *
 * Every id below was resolved from the channel's @handle page and its feed
 * fetched and parsed on 2026-11-28. Many of these channels geo-restrict
 * match highlights (typically in the league's home market or where a
 * broadcaster holds the rights): the video then shows YouTube's "not
 * available in your country" message inside the player. That is expected.
 *
 * Considered and dropped (2026-11-28):
 *   - Eredivisie (DED): no official league channel found. ESPN NL (the rights
 *     holder, UCXnPiEv1DoUCDAqDUXT9shQ) posts talk shows and clips, not
 *     match highlights, and is a broadcaster.
 *   - Brasileirao (BSA): @brasileirao (UCrf4Fr6uTCoU9RkYa5CbzcA) last posted
 *     in 2018; CBF's channel (@brasil, UCdQuDaRww5NkKpQQ1BJBWww) covers the
 *     national teams. Club highlights are with Globo / broadcasters.
 *   - Champions League broadcasters (CBS Sports Golazo, DAZN UEFA Champions
 *     League): not official. UEFA's own channel only posts matchday
 *     compilations, which still appear on /highlights.
 */

export interface HighlightChannel {
  /** Competition code from lib/competitions.ts. */
  competitionCode: string
  /** Display name, used for attribution ("via Bundesliga"). */
  name: string
  /** YouTube channel id (UC + 22 chars). */
  channelId: string
  handle: string
  /** What to expect from this channel; shown to nobody, kept for maintainers. */
  note: string
}

export const HIGHLIGHT_CHANNELS: readonly HighlightChannel[] = [
  {
    competitionCode: 'PL',
    name: 'Premier League',
    channelId: 'UCG5qGWdu8nIRZqJ_GgDwQ-w',
    handle: '@premierleague',
    note: 'Official. Mostly matchweek compilations and features; current-season per-match highlights are with broadcasters.',
  },
  {
    competitionCode: 'ELC',
    name: 'EFL',
    channelId: 'UCCmo_NIuQR5eU4AvBa6sEQQ',
    handle: '@theEFL',
    note: 'Official. Per-match highlights for all EFL divisions; geo-blocked in the UK.',
  },
  {
    competitionCode: 'PD',
    name: 'LALIGA EA SPORTS',
    channelId: 'UCTv-XvfzLX3i4IGWAm4sbmA',
    handle: '@LaLiga',
    note: 'Official. Per-match "RESUMEN" videos; availability varies by country.',
  },
  {
    competitionCode: 'BL1',
    name: 'Bundesliga',
    channelId: 'UC6UL29enLNe4mqwTfAyeNuw',
    handle: '@bundesliga',
    note: 'Official international channel. Per-match highlights; restricted in some territories.',
  },
  {
    competitionCode: 'SA',
    name: 'Serie A',
    channelId: 'UCBJeMCIeLQos7wacox4hmLQ',
    handle: '@SerieA',
    note: 'Official. Extended highlights per match; restricted in some territories.',
  },
  {
    competitionCode: 'FL1',
    name: "Ligue 1 McDonald's",
    channelId: 'UCQsH5XtIc9hONE1BQjucM0g',
    handle: '@Ligue1',
    note: 'Official. Per-match highlights titled "HOME - AWAY (x-y)"; restricted in some territories.',
  },
  {
    competitionCode: 'PPL',
    name: 'VSPORTS - Liga Portugal',
    channelId: 'UCuIlu5oGIj1RzHOYmeSV5Eg',
    handle: '@VSPORTSPORTUGAL',
    note:
      "Verified channel carrying Liga Portugal's own goals, round compilations and flash interviews. " +
      "The league's main channel (@LigaPortugalOfficial) posts no highlights.",
  },
  {
    competitionCode: 'CL',
    name: 'UEFA',
    channelId: 'UCyGa1YEx9ST66rYrJTGIKOw',
    handle: '@UEFA',
    note: 'Official. Matchday goal compilations only; per-match highlights are with broadcasters.',
  },
  {
    competitionCode: 'WC',
    name: 'FIFA',
    channelId: 'UCpcTrCXblq78GZrTUTLWeBw',
    handle: '@fifa',
    note: 'Official. Per-match highlights of FIFA tournaments.',
  },
]

const BY_ID = new Map(HIGHLIGHT_CHANNELS.map((c) => [c.channelId, c]))

export function channelById(channelId: string): HighlightChannel | undefined {
  return BY_ID.get(channelId)
}

/** Competitions that have at least one highlights channel, for filter chips. */
export const HIGHLIGHT_COMPETITIONS: readonly string[] = [
  ...new Set(HIGHLIGHT_CHANNELS.map((c) => c.competitionCode)),
]

/**
 * Feed URLs for a channel, best first.
 *
 * The plain channel feed lists the last 15 uploads including Shorts, which
 * for these channels crowd out most highlights. YouTube also serves each
 * channel's long-form uploads as the playlist "UULF" + the id without "UC";
 * that convention is undocumented, so the channel feed stays as a fallback.
 */
export function feedUrls(channelId: string): string[] {
  const base = 'https://www.youtube.com/feeds/videos.xml'
  // The channel feed first: the UULF playlist feed answered 503 when checked
  // on 2026-11-28, and a failed attempt costs a request on every refresh.
  return [`${base}?channel_id=${channelId}`, `${base}?playlist_id=UULF${channelId.slice(2)}`]
}
