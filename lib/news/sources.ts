/**
 * News feeds we show headlines from.
 *
 * Headlines, a short summary and a link only - never the article body. Each
 * feed was fetched and parsed on 2026-11-28. Their RSS terms were NOT
 * individually reviewed yet; before relying on a feed commercially, read the
 * publisher's terms and drop any that restrict third-party display. BBC, Sky
 * Sports and the Guardian are left out on purpose: their RSS terms limit use
 * to personal, non-commercial purposes. 90min.com's feed was dropped because
 * it served only year-old posts when checked.
 */

export interface NewsSource {
  id: string
  name: string
  feedUrl: string
  homepage: string
}

export const NEWS_SOURCES: readonly NewsSource[] = [
  {
    id: 'espn',
    name: 'ESPN FC',
    feedUrl: 'https://www.espn.com/espn/rss/soccer/news',
    homepage: 'https://www.espn.com/soccer/',
  },
  {
    id: 'fourfourtwo',
    name: 'FourFourTwo',
    feedUrl: 'https://www.fourfourtwo.com/feeds.xml',
    homepage: 'https://www.fourfourtwo.com/',
  },
  {
    id: 'caughtoffside',
    name: 'CaughtOffside',
    feedUrl: 'https://www.caughtoffside.com/feed/',
    homepage: 'https://www.caughtoffside.com/',
  },
]
