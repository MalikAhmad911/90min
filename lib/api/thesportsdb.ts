/**
 * TheSportsDB's public test key.
 *
 * The long-standing key "3" was permanently disabled in November 2026 and now
 * answers every request with HTTP 403 - which our callers swallow as "no
 * badge", so crest fallbacks broke with nothing in the logs. "123" is the
 * current free key. A paid key can be supplied through THESPORTSDB_API_KEY.
 *
 * Free-tier terms allow public display, including on ad-supported sites, but
 * not publishing in app stores; images carry their own licence flags.
 */
const API_KEY = process.env.THESPORTSDB_API_KEY || '123'
const BASE = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`

export interface TSDBTeam {
  idTeam: string
  strTeam: string
  strBadge: string
  strLogo: string
  strColour1?: string
  strColour2?: string
}

export async function searchTeam(name: string): Promise<TSDBTeam | null> {
  try {
    const res = await fetch(`${BASE}/searchteams.php?t=${encodeURIComponent(name)}`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.teams?.[0] ?? null
  } catch {
    return null
  }
}

export async function getTeamBadge(name: string): Promise<string | null> {
  const team = await searchTeam(name)
  return team?.strBadge || null
}
