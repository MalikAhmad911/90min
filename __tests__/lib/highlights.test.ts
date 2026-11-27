import { parseYouTubeFeed } from '@/lib/highlights/atom'
import { findMatchHighlight, isHighlightOf } from '@/lib/highlights/match'
import { embedUrl, isValidVideoId, thumbnailUrl } from '@/lib/highlights/youtube'

const CHANNEL = 'UCBJeMCIeLQos7wacox4hmLQ'

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <entry>
  <id>yt:video:abcdefghijk</id>
  <yt:videoId>abcdefghijk</yt:videoId>
  <yt:channelId>${CHANNEL}</yt:channelId>
  <title>Inter-Milan 2-1 | Highlights &amp; Goals | Serie A</title>
  <published>2026-11-23T22:30:00+00:00</published>
 </entry>
 <entry>
  <yt:videoId>bad id here</yt:videoId>
  <yt:channelId>${CHANNEL}</yt:channelId>
  <title>Broken</title>
  <published>2026-11-23T22:30:00+00:00</published>
 </entry>
 <entry>
  <yt:videoId>zzzzzzzzzzz</yt:videoId>
  <yt:channelId>UCaaaaaaaaaaaaaaaaaaaaaa</yt:channelId>
  <title>Other channel</title>
  <published>2026-11-23T22:30:00+00:00</published>
 </entry>
</feed>`

describe('parseYouTubeFeed', () => {
  it('reads valid entries, decodes entities, drops bad ids and other channels', () => {
    const videos = parseYouTubeFeed(FEED, CHANNEL)
    expect(videos).toHaveLength(1)
    expect(videos[0].videoId).toBe('abcdefghijk')
    expect(videos[0].title).toBe('Inter-Milan 2-1 | Highlights & Goals | Serie A')
    expect(videos[0].thumbnailUrl).toBe('https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg')
  })

  it('returns nothing for non-feeds', () => {
    expect(parseYouTubeFeed('<html></html>')).toEqual([])
  })
})

describe('youtube helpers', () => {
  it('only builds URLs from valid ids', () => {
    expect(isValidVideoId('abcdefghijk')).toBe(true)
    expect(isValidVideoId('javascript:')).toBe(false)
    expect(embedUrl('"><script>')).toBeNull()
    expect(thumbnailUrl('abc')).toBeNull()
    expect(embedUrl('abcdefghijk')).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0')
  })
})

describe('isHighlightOf', () => {
  const kickoff = '2026-11-22T16:30:00Z'
  const united = { name: 'Manchester United FC', shortName: 'Man United', tla: 'MUN' }
  const city = { name: 'Manchester City FC', shortName: 'Man City', tla: 'MCI' }
  const liverpool = { name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV' }
  const brighton = { name: 'Brighton & Hove Albion FC', shortName: 'Brighton Hove', tla: 'BHA' }
  const at = (h: number) => new Date(Date.parse(kickoff) + h * 3600_000)

  it('matches a title naming both teams soon after kick-off', () => {
    const match = { utcDate: kickoff, homeTeam: liverpool, awayTeam: united }
    expect(isHighlightOf({ title: 'Liverpool 4-0 Man United | Highlights', publishedAt: at(3) }, match)).toBe(true)
  })

  it('does not let a shared city name stand in for the other club', () => {
    const match = { utcDate: kickoff, homeTeam: liverpool, awayTeam: united }
    expect(isHighlightOf({ title: 'Liverpool v Manchester City | Highlights', publishedAt: at(3) }, match)).toBe(false)
    const cityMatch = { utcDate: kickoff, homeTeam: city, awayTeam: liverpool }
    expect(isHighlightOf({ title: 'Man City 1-1 Liverpool', publishedAt: at(2) }, cityMatch)).toBe(true)
  })

  it('accepts a distinctive single word ("Brighton")', () => {
    const match = { utcDate: kickoff, homeTeam: brighton, awayTeam: liverpool }
    expect(isHighlightOf({ title: 'Brighton 0-2 Liverpool', publishedAt: at(5) }, match)).toBe(true)
  })

  it('rejects videos before kick-off or more than 72h later', () => {
    const match = { utcDate: kickoff, homeTeam: liverpool, awayTeam: united }
    expect(isHighlightOf({ title: 'Liverpool v Man United preview', publishedAt: at(-2) }, match)).toBe(false)
    expect(isHighlightOf({ title: 'Liverpool 4-0 Man United', publishedAt: at(80) }, match)).toBe(false)
  })

  it('picks the earliest qualifying upload', () => {
    const match = { utcDate: kickoff, homeTeam: liverpool, awayTeam: united }
    const hit = findMatchHighlight(
      [
        { title: 'Liverpool 4-0 Man United | Extended', publishedAt: at(20) },
        { title: 'Liverpool 4-0 Man United | Highlights', publishedAt: at(3) },
        { title: 'Arsenal 1-0 Chelsea', publishedAt: at(2) },
      ],
      match
    )
    expect(hit?.title).toBe('Liverpool 4-0 Man United | Highlights')
  })
})

import { looksLikeHighlight } from '@/lib/highlights/fetch'

describe('looksLikeHighlight', () => {
  it('keeps match videos and drops shows', () => {
    expect(looksLikeHighlight('COMO-JUVENTUS 2-0 | HIGHLIGHTS')).toBe(true)
    expect(looksLikeHighlight('Real Madrid vs Getafe (3-1) | RESUMEN')).toBe(true)
    expect(looksLikeHighlight("Cesc FABREGAS' Tactical TRAP")).toBe(false)
    expect(looksLikeHighlight('Why Teams Have STOPPED Pressing | Serie A 2026/27')).toBe(false)
  })
})
