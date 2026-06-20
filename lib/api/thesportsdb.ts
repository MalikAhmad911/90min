const BASE = 'https://www.thesportsdb.com/api/v1/json/3'

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
