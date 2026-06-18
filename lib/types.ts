export type MatchStatus =
  | 'SCHEDULED'
  | 'TIMED'
  | 'IN_PLAY'
  | 'PAUSED'
  | 'FINISHED'
  | 'CANCELLED'
  | 'POSTPONED'

export interface Team {
  id: number
  name: string
  shortName: string
  tla: string
  crest: string
}

export interface Score {
  home: number | null
  away: number | null
}

export interface Match {
  id: number
  status: MatchStatus
  utcDate: string
  minute?: number
  homeTeam: Team
  awayTeam: Team
  score: {
    fullTime: Score
    halfTime: Score
  }
  competition: {
    id: number
    name: string
    code: string
    emblem: string
  }
}

export interface GroupedMatches {
  competitionId: number
  competitionName: string
  competitionEmblem: string
  matches: Match[]
}

export interface MatchesApiResponse {
  matches: Match[]
  date: string
  error?: string
}
