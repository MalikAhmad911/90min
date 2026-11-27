import { z } from 'zod'
import { RateLimiter } from '@/lib/server/rate-limiter'
import { USER_AGENT, normaliseName } from '@/lib/providers/wikidata'

/**
 * TheSportsDB player lookups: shirt number, height fallback, and a photo we
 * are allowed to show.
 *
 * Licence handling (verified against live responses, Nov 2026): a player
 * record carries `strCreativeCommons` ("Yes"/"No") and
 * `strCreativeCommonsAttribution`, e.g. "By Bryan Berlin - Own work, CC BY-SA
 * 4.0, https://commons.wikimedia.org/...". "Yes" with a credit is the only
 * case where we know the licence of the image, and those licences (CC BY-SA,
 * public domain) require or welcome the credit - so a photo is stored only
 * with its credit attached, and shown only with the credit beside it.
 * Anything else falls back to initials.
 */

const API_KEY = process.env.THESPORTSDB_API_KEY || '123'
const BASE = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`

/** Free tier allows 30 requests a minute; leave headroom for the crest fallback. */
const limiter = new RateLimiter({ capacity: 20, intervalMs: 60_000, name: 'thesportsdb' })

/* ------------------------------------------------------------------ *
 * Pure parsing
 * ------------------------------------------------------------------ */

/**
 * Height in whole centimetres from TheSportsDB's free-text field.
 *
 * Seen in the wild: "1.95 m (6 ft 5 in)", "178 cm", "189cm / 6'2\"",
 * "6 ft 2 in". Metric is preferred when present; imperial is the fallback.
 */
export function parseHeightCm(raw: string | null | undefined): number | null {
  if (!raw) return null
  const text = raw.toLowerCase().replace(',', '.')

  const inRange = (cm: number) => (cm >= 120 && cm <= 230 ? cm : null)

  const cm = /(\d{3})\s*cm/.exec(text)
  if (cm) return inRange(Number(cm[1]))

  const metres = /(\d\.\d{1,2})\s*m\b/.exec(text)
  if (metres) return inRange(Math.round(Number(metres[1]) * 100))

  const imperial = /(\d)\s*(?:ft|foot|feet|')\s*(\d{1,2})?\s*(?:in|"|'')?/.exec(text)
  if (imperial) {
    const inches = Number(imperial[1]) * 12 + Number(imperial[2] ?? 0)
    return inRange(Math.round(inches * 2.54))
  }

  return null
}

/** A shirt number the players table accepts (0-99), or null. */
export function parseShirtNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const t = String(raw).trim()
  if (!/^\d{1,2}$/.test(t)) return null
  return Number(t)
}

/** The licence fields we act on. */
export interface LicenceFields {
  strCreativeCommons?: string | null
  strCreativeCommonsAttribution?: string | null
}

/** The credit to show for a player's photo, or null when it must not be shown. */
export function photoCredit(p: LicenceFields): string | null {
  if ((p.strCreativeCommons ?? '').trim().toLowerCase() !== 'yes') return null
  const credit = (p.strCreativeCommonsAttribution ?? '').trim()
  return credit.length > 0 ? credit.slice(0, 300) : null
}

/**
 * The players table has a single `photo_url` column and no credit column.
 * Rather than show a CC BY-SA image without its credit, the credit travels in
 * the URL fragment - browsers never send a fragment to the server, so the
 * image still loads, and the page splits it back out to print the credit.
 * A dedicated `photo_credit` column would be cleaner (schema follow-up).
 */
export function encodePhotoUrl(url: string, credit: string): string {
  return `${url.split('#')[0]}#credit=${encodeURIComponent(credit)}`
}

export function decodePhotoUrl(stored: string | null | undefined): { src: string; credit: string } | null {
  if (!stored) return null
  const [src, fragment] = stored.split('#', 2)
  const match = /^credit=(.+)$/.exec(fragment ?? '')
  // No credit means we cannot honour the licence, so treat it as no photo.
  if (!src || !match) return null
  try {
    return { src, credit: decodeURIComponent(match[1]) }
  } catch {
    return null
  }
}

/** True when TheSportsDB's team name and ours plausibly name the same club. */
export function sameClub(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const strip = (s: string) =>
    normaliseName(s)
      .replace(/\b(fc|afc|cf|sc)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const x = strip(a)
  const y = strip(b)
  return x.length > 0 && y.length > 0 && (x === y || x.includes(y) || y.includes(x))
}

/* ------------------------------------------------------------------ *
 * Network
 * ------------------------------------------------------------------ */

const searchSchema = z.object({
  player: z
    .array(
      z.object({
        idPlayer: z.string(),
        strPlayer: z.string(),
        dateBorn: z.string().nullable().optional(),
        strSport: z.string().nullable().optional(),
      })
    )
    .nullable()
    .optional(),
})

const lookupSchema = z.object({
  players: z
    .array(
      z.object({
        idPlayer: z.string(),
        strPlayer: z.string(),
        strTeam: z.string().nullable().optional(),
        dateBorn: z.string().nullable().optional(),
        strNumber: z.string().nullable().optional(),
        strHeight: z.string().nullable().optional(),
        strThumb: z.string().nullable().optional(),
        strCreativeCommons: z.string().nullable().optional(),
        strCreativeCommonsAttribution: z.string().nullable().optional(),
        idWikidata: z.string().nullable().optional(),
      })
    )
    .nullable()
    .optional(),
})

async function get(path: string): Promise<unknown> {
  return limiter.schedule(async () => {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'User-Agent': USER_AGENT },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`TheSportsDB responded ${res.status}`)
    return res.json()
  })
}

export interface TsdbPlayer {
  idPlayer: string
  team: string | null
  shirtNumber: number | null
  heightCm: number | null
  /** Photo URL with its credit encoded (see encodePhotoUrl), or null. */
  photoUrl: string | null
  wikidataId: string | null
}

/**
 * The TheSportsDB record for this player, matched on name search plus an
 * exact date of birth. Searching "Mohamed Salah" returns an Egyptian
 * namesake born in 1998, so the date is what makes the match safe.
 * Two requests per player (search + lookup).
 */
export async function findTsdbPlayer(player: {
  name: string
  dateOfBirth: string
}): Promise<TsdbPlayer | null> {
  const dob = player.dateOfBirth.slice(0, 10)
  const search = searchSchema.parse(
    await get(`/searchplayers.php?p=${encodeURIComponent(player.name)}`)
  )
  const hits = (search.player ?? []).filter(
    (p) => (p.strSport ?? 'Soccer') === 'Soccer' && (p.dateBorn ?? '').slice(0, 10) === dob
  )
  if (hits.length !== 1) return null

  const lookup = lookupSchema.parse(
    await get(`/lookupplayer.php?id=${encodeURIComponent(hits[0].idPlayer)}`)
  )
  const p = lookup.players?.[0]
  if (!p || (p.dateBorn ?? '').slice(0, 10) !== dob) return null

  const credit = photoCredit(p)
  const thumb = p.strThumb && /^https:\/\//.test(p.strThumb) ? p.strThumb : null

  return {
    idPlayer: p.idPlayer,
    team: p.strTeam ?? null,
    shirtNumber: parseShirtNumber(p.strNumber),
    heightCm: parseHeightCm(p.strHeight),
    // strThumb is the image the licence fields describe; cutouts and renders
    // are TheSportsDB derivatives whose licence is not stated.
    photoUrl: thumb && credit ? encodePhotoUrl(thumb, credit) : null,
    wikidataId: p.idWikidata && /^Q\d+$/.test(p.idWikidata) ? p.idWikidata : null,
  }
}
