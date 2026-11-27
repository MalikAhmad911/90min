// @vitest-environment node
import {
  isHlsUrl,
  isYoutubeId,
  isValidStreamSource,
  freeStreamSchema,
  streamsPostSchema,
  channelsPostSchema,
} from '@/lib/validation/streams'
import { loginSchema } from '@/lib/validation/auth'
import { parseJsonBody } from '@/lib/validation/request'

const VIDEO_ID = 'dQw4w9WgXcQ'
const HLS = 'https://cdn.example.com/live/stream.m3u8'

describe('stream source validation', () => {
  it('accepts an 11-character YouTube id', () => {
    expect(isYoutubeId(VIDEO_ID)).toBe(true)
    expect(isYoutubeId('a-b_c-d_e-f')).toBe(true)
  })

  it.each([
    ['too short', 'dQw4w9WgXc'],
    ['too long', 'dQw4w9WgXcQQ'],
    ['a full URL', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['javascript:', 'javascript:x'],
    ['bad characters', 'dQw4w9WgX<Q'],
    ['empty', ''],
  ])('rejects a YouTube source that is %s', (_, src) => {
    expect(isYoutubeId(src)).toBe(false)
  })

  it.each([
    HLS,
    'https://cdn.example.com/live/stream.M3U8',
    'https://cdn.example.com/a/b.m3u8?token=abc&exp=123',
    'https://cdn.example.com:8443/index.m3u8',
  ])('accepts the https m3u8 URL %s', (src) => {
    expect(isHlsUrl(src)).toBe(true)
  })

  it.each([
    ['http', 'http://cdn.example.com/live/stream.m3u8'],
    ['javascript:', 'javascript:alert(1)//.m3u8'],
    ['javascript: with https in it', 'javascript://https://x.m3u8'],
    ['data:', 'data:application/vnd.apple.mpegurl;base64,AAAA.m3u8'],
    ['not m3u8', 'https://cdn.example.com/live/stream.mp4'],
    ['m3u8 only in the query', 'https://cdn.example.com/video.mp4?f=x.m3u8'],
    ['credentials', 'https://user:pass@cdn.example.com/stream.m3u8'],
    ['a fragment', 'https://cdn.example.com/stream.m3u8#x'],
    ['embedded whitespace', 'https://cdn.example.com/str eam.m3u8'],
    ['an embedded newline', 'https://cdn.example.com/\nstream.m3u8'],
    ['protocol-relative', '//cdn.example.com/stream.m3u8'],
    ['missing slashes', 'https:cdn.example.com/stream.m3u8'],
    ['ftp', 'ftp://cdn.example.com/stream.m3u8'],
    ['too long', `https://cdn.example.com/${'a'.repeat(2100)}.m3u8`],
    ['empty', ''],
  ])('rejects an HLS source that is %s', (_, src) => {
    expect(isHlsUrl(src)).toBe(false)
  })

  it('checks the source against its own kind', () => {
    expect(isValidStreamSource('youtube', VIDEO_ID)).toBe(true)
    expect(isValidStreamSource('hls', HLS)).toBe(true)
    expect(isValidStreamSource('youtube', HLS)).toBe(false)
    expect(isValidStreamSource('hls', VIDEO_ID)).toBe(false)
    expect(isValidStreamSource('iframe', HLS)).toBe(false)
  })
})

describe('freeStreamSchema', () => {
  it('trims and accepts a valid stream, defaulting the title', () => {
    expect(freeStreamSchema.parse({ kind: 'youtube', src: `  ${VIDEO_ID} ` })).toEqual({
      kind: 'youtube',
      src: VIDEO_ID,
      title: '',
    })
  })

  it('rejects an unknown kind', () => {
    expect(freeStreamSchema.safeParse({ kind: 'iframe', src: HLS, title: 'x' }).success).toBe(false)
  })

  it('rejects extra fields instead of carrying them through', () => {
    const r = freeStreamSchema.safeParse({ kind: 'hls', src: HLS, title: 'x', id: 'evil' })
    expect(r.success).toBe(false)
  })

  it('caps the title length', () => {
    expect(freeStreamSchema.safeParse({ kind: 'hls', src: HLS, title: 'x'.repeat(81) }).success).toBe(false)
    expect(freeStreamSchema.safeParse({ kind: 'hls', src: HLS, title: 'x'.repeat(80) }).success).toBe(true)
  })

  it('rejects control characters in the title', () => {
    expect(freeStreamSchema.safeParse({ kind: 'hls', src: HLS, title: 'a\u0000b' }).success).toBe(false)
  })
})

describe('streamsPostSchema', () => {
  const valid = { scope: 'match', key: '497412', stream: { kind: 'hls', src: HLS, title: 'Live' } }

  it('accepts an upsert and a removal', () => {
    expect(streamsPostSchema.safeParse(valid).success).toBe(true)
    expect(streamsPostSchema.safeParse({ scope: 'competition', key: 'PL', stream: null }).success).toBe(true)
  })

  it('rejects a javascript: source', () => {
    const r = streamsPostSchema.safeParse({
      ...valid,
      stream: { kind: 'hls', src: 'javascript:alert(document.cookie)', title: 'x' },
    })
    expect(r.success).toBe(false)
  })

  it('rejects a plain-http source', () => {
    const r = streamsPostSchema.safeParse({
      ...valid,
      stream: { kind: 'hls', src: 'http://cdn.example.com/a.m3u8', title: 'x' },
    })
    expect(r.success).toBe(false)
  })

  it('requires stream to be present (null to remove)', () => {
    expect(streamsPostSchema.safeParse({ scope: 'match', key: '1' }).success).toBe(false)
  })

  it.each([
    ['bad scope', { ...valid, scope: 'global' }],
    ['empty key', { ...valid, key: '' }],
    ['key with odd characters', { ...valid, key: '../etc' }],
    ['key too long', { ...valid, key: 'k'.repeat(33) }],
    ['unknown top-level field', { ...valid, admin: true }],
  ])('rejects %s', (_, body) => {
    expect(streamsPostSchema.safeParse(body).success).toBe(false)
  })
})

describe('channelsPostSchema', () => {
  it('accepts add with trimmed name and a valid source', () => {
    const r = channelsPostSchema.parse({
      action: 'add',
      channel: { name: '  Sky News  ', kind: 'youtube', src: VIDEO_ID },
    })
    expect(r).toEqual({ action: 'add', channel: { name: 'Sky News', kind: 'youtube', src: VIDEO_ID } })
  })

  it('accepts remove with a uuid', () => {
    const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    expect(channelsPostSchema.parse({ action: 'remove', id })).toEqual({ action: 'remove', id })
  })

  it.each([
    ['javascript: source', { action: 'add', channel: { name: 'x', kind: 'hls', src: 'javascript:alert(1)' } }],
    ['data: source', { action: 'add', channel: { name: 'x', kind: 'hls', src: 'data:text/html,hi' } }],
    ['http source', { action: 'add', channel: { name: 'x', kind: 'hls', src: 'http://a.b/c.m3u8' } }],
    ['YouTube URL instead of id', { action: 'add', channel: { name: 'x', kind: 'youtube', src: 'https://youtu.be/dQw4w9WgXcQ' } }],
    ['blank name', { action: 'add', channel: { name: '   ', kind: 'youtube', src: VIDEO_ID } }],
    ['name too long', { action: 'add', channel: { name: 'n'.repeat(61), kind: 'youtube', src: VIDEO_ID } }],
    ['client-supplied id on add', { action: 'add', channel: { id: 'x', name: 'n', kind: 'youtube', src: VIDEO_ID } }],
    ['remove with a non-uuid', { action: 'remove', id: '1 or 1=1' }],
    ['unknown action', { action: 'drop' }],
  ])('rejects %s', (_, body) => {
    expect(channelsPostSchema.safeParse(body).success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('accepts and trims the username but not the password', () => {
    expect(loginSchema.parse({ username: ' admin ', password: ' pw ' })).toEqual({
      username: 'admin',
      password: ' pw ',
    })
  })

  it.each([
    ['missing password', { username: 'a' }],
    ['empty username', { username: '  ', password: 'x' }],
    ['non-string password', { username: 'a', password: 123 }],
    ['oversized username', { username: 'u'.repeat(65), password: 'x' }],
    ['oversized password', { username: 'a', password: 'p'.repeat(257) }],
    ['extra field', { username: 'a', password: 'x', role: 'admin' }],
  ])('rejects %s', (_, body) => {
    expect(loginSchema.safeParse(body).success).toBe(false)
  })
})

describe('parseJsonBody', () => {
  function post(body: string, contentType = 'application/json') {
    return new Request('http://localhost/api/x', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
    })
  }

  it('returns the validated data', async () => {
    const r = await parseJsonBody(post(JSON.stringify({ username: 'a', password: 'b' })), loginSchema)
    expect(r).toEqual({ ok: true, data: { username: 'a', password: 'b' } })
  })

  it('rejects a non-JSON content type with 415', async () => {
    const r = await parseJsonBody(post('username=a', 'application/x-www-form-urlencoded'), loginSchema)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(415)
  })

  it('rejects malformed JSON with 400', async () => {
    const r = await parseJsonBody(post('{nope'), loginSchema)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(400)
  })

  it('rejects an oversized body with 413', async () => {
    const r = await parseJsonBody(post(JSON.stringify({ pad: 'x'.repeat(100) })), loginSchema, { maxBytes: 50 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(413)
  })

  it('names the failing field by default', async () => {
    const r = await parseJsonBody(
      post(JSON.stringify({ scope: 'match', key: '1', stream: { kind: 'hls', src: 'http://a/b.m3u8' } })),
      streamsPostSchema
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.response.status).toBe(400)
      expect((await r.response.json()).error).toMatch(/^stream\.src: HLS source must be/)
    }
  })

  it('uses the generic message when one is given', async () => {
    const r = await parseJsonBody(post(JSON.stringify({ username: 'a' })), loginSchema, {
      publicError: 'Username and password required',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(await r.response.json()).toEqual({ error: 'Username and password required' })
  })
})
