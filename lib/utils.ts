import type { Match, GroupedMatches, MatchStatus } from './types'

export function groupByLeague(matches: Match[]): GroupedMatches[] {
  const map = new Map<number, GroupedMatches>()

  for (const match of matches) {
    const { id, name, emblem } = match.competition
    if (!map.has(id)) {
      map.set(id, { competitionId: id, competitionName: name, competitionEmblem: emblem, matches: [] })
    }
    map.get(id)!.matches.push(match)
  }

  return Array.from(map.values())
}

export function formatKickoffTime(utcDate: string): string {
  return new Date(utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function getStatusLabel(status: MatchStatus, minute: number | undefined, utcDate: string): string {
  switch (status) {
    case 'IN_PLAY':
      return `${minute ?? '?'}'`
    case 'PAUSED':
      return 'HT'
    case 'FINISHED':
      return 'FT'
    case 'CANCELLED':
      return 'CANC'
    case 'POSTPONED':
      return 'PPD'
    default:
      return formatKickoffTime(utcDate)
  }
}

export function isLive(status: MatchStatus): boolean {
  return status === 'IN_PLAY' || status === 'PAUSED'
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function getDateRange(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return formatDate(d)
}
