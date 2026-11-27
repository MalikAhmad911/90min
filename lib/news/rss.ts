/**
 * A small parser for RSS 2.0 news feeds, limited to what a headline needs:
 * title, link, a short plain-text summary, date and an optional image.
 *
 * Not a general XML parser: publishers' feeds are machine-generated and flat.
 * Full article bodies (<content:encoded>) are deliberately never read - we
 * show headlines and send readers to the publisher.
 *
 * Everything returned is untrusted text: links and images are https-only and
 * the summary has every tag stripped. It is rendered as React text only.
 */

export interface FeedItem {
  title: string
  link: string
  summary: string
  publishedAt: Date
  imageUrl: string | null
}

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
      if (!Number.isFinite(code) || code < 1 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole
      return String.fromCodePoint(code)
    }
    return NAMED[ref.toLowerCase()] ?? whole
  })
}

function unwrapCdata(raw: string): string {
  return raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
}

/** Tags out, entities decoded, whitespace collapsed. */
export function toPlainText(raw: string): string {
  const once = decodeEntities(unwrapCdata(raw))
  // Feeds often entity-encode their HTML, so strip after decoding, then
  // decode again for entities that were inside the markup.
  return decodeEntities(once.replace(/<[^>]*>/g, ' '))
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cut on a word boundary with an ellipsis. */
export function truncate(text: string, max = 220): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, '')}…`
}

/** https URLs only (http is upgraded); anything else is dropped. */
export function safeHttpsUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(decodeEntities(unwrapCdata(raw)).trim())
    if (url.protocol === 'http:') url.protocol = 'https:'
    if (url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

function escapeTag(tag: string): string {
  return tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function firstInner(xml: string, tag: string): string | null {
  const t = escapeTag(tag)
  const m = xml.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, 'i'))
  return m ? m[1] : null
}

function firstAttr(xml: string, tag: string, attr: string): string | null {
  const t = escapeTag(tag)
  const m = xml.match(new RegExp(`<${t}\\s[^>]*?${attr}\\s*=\\s*["']([^"']+)["'][^>]*>`, 'i'))
  return m ? m[1] : null
}

function imageOf(item: string): string | null {
  // media:content / media:thumbnail / enclosure, images only.
  const media = item.match(/<media:(?:content|thumbnail)\s[^>]*>/gi) ?? []
  for (const tag of media) {
    const url = tag.match(/url\s*=\s*["']([^"']+)["']/i)?.[1]
    const medium = tag.match(/medium\s*=\s*["']([^"']+)["']/i)?.[1]
    const type = tag.match(/type\s*=\s*["']([^"']+)["']/i)?.[1]
    if (url && (!medium || medium === 'image') && (!type || type.startsWith('image/'))) {
      const safe = safeHttpsUrl(url)
      if (safe) return safe
    }
  }
  const enclosure = item.match(/<enclosure\s[^>]*>/i)?.[0]
  if (enclosure && /type\s*=\s*["']image\//i.test(enclosure)) {
    return safeHttpsUrl(enclosure.match(/url\s*=\s*["']([^"']+)["']/i)?.[1])
  }
  return null
}

/** Parses an RSS 2.0 document. Bad items are skipped one by one, never thrown. */
export function parseRss(xml: string, limit = 40): FeedItem[] {
  if (typeof xml !== 'string' || !/<rss[\s>]|<channel[\s>]/i.test(xml)) return []
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? []
  const out: FeedItem[] = []
  const seen = new Set<string>()

  for (const item of items) {
    if (out.length >= limit) break
    // Drop the full body before looking at anything else.
    const head = item.replace(/<(content:encoded|dc:content)>[\s\S]*?<\/\1>/gi, '')
    const title = toPlainText(firstInner(head, 'title') ?? '').slice(0, 300)
    const link = safeHttpsUrl(firstInner(head, 'link') ?? firstAttr(head, 'link', 'href'))
    const date = new Date(toPlainText(firstInner(head, 'pubDate') ?? firstInner(head, 'dc:date') ?? ''))
    if (!title || !link || Number.isNaN(date.getTime()) || seen.has(link)) continue
    seen.add(link)
    out.push({
      title,
      link,
      summary: truncate(toPlainText(firstInner(head, 'description') ?? '')),
      publishedAt: date,
      imageUrl: imageOf(head),
    })
  }
  return out
}
