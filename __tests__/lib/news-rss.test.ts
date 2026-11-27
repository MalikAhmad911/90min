import { parseRss, toPlainText, truncate, safeHttpsUrl } from '@/lib/news/rss'

const FEED = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<item><title><![CDATA[Arsenal &amp; Chelsea draw]]></title>
<link><![CDATA[https://example.com/a?x=1&amp;y=2]]></link>
<description><![CDATA[<p>A <b>tense</b> game &hellip; ended 1-1.</p>]]></description>
<pubDate>Fri, 27 Nov 2026 14:11:00 EST</pubDate>
<media:thumbnail url="https://img.example.com/a.jpg" /></item>
<item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>Fri, 27 Nov 2026 14:11:00 GMT</pubDate></item>
<item><title>Full body</title><link>http://example.com/b</link><pubDate>Fri, 27 Nov 2026 15:00:00 GMT</pubDate>
<content:encoded><![CDATA[<p>SECRET FULL ARTICLE</p>]]></content:encoded>
<enclosure url="https://img.example.com/b.png" type="image/png" /></item>
</channel></rss>`

describe('parseRss', () => {
  it('reads headline fields, cleans text, keeps https only', () => {
    const items = parseRss(FEED)
    expect(items).toHaveLength(2)
    expect(items[0].title).toBe('Arsenal & Chelsea draw')
    expect(items[0].link).toBe('https://example.com/a?x=1&y=2')
    expect(items[0].summary).toBe('A tense game … ended 1-1.')
    expect(items[0].imageUrl).toBe('https://img.example.com/a.jpg')
    expect(items[1].link).toBe('https://example.com/b')
    expect(items[1].imageUrl).toBe('https://img.example.com/b.png')
  })

  it('never reads the article body', () => {
    expect(JSON.stringify(parseRss(FEED))).not.toContain('SECRET')
  })

  it('ignores non-RSS input', () => {
    expect(parseRss('<html></html>')).toEqual([])
  })
})

describe('helpers', () => {
  it('strips tags and decodes entities', () => {
    expect(toPlainText('&lt;b&gt;Hi&lt;/b&gt; &amp; bye')).toBe('Hi & bye')
  })
  it('truncates on a word boundary', () => {
    expect(truncate('one two three four five', 12)).toBe('one two…')
  })
  it('rejects non-http schemes', () => {
    expect(safeHttpsUrl('data:text/html,x')).toBeNull()
    expect(safeHttpsUrl('http://a.com/x')).toBe('https://a.com/x')
  })
})
