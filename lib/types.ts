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
  group?: string
  stage?: string
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
  /** Round number within the season, when the provider sends it. */
  matchday?: number | null
  venue?: string | null
  /** Main referee's name. */
  referee?: string | null
  /** Red cards per side, when a details provider reported any (PRD MAT-4). */
  redCards?: { home: number; away: number }
  season?: {
    id: number
    startDate?: string | null
    endDate?: string | null
    currentMatchday?: number | null
  } | null
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
  /** True when the payload was served from cache while a refresh runs. */
  stale?: boolean
  /** Epoch ms the data was fetched from the provider. */
  updatedAt?: number
}

/* ------------------------------------------------------------------ *
 * Extended resources (league tables, scorers, match detail, teams).
 * All of these are available on football-data.org's free tier for the
 * 12 free competitions. Fields the plan does not expose come back as
 * null/undefined, so every consumer must treat them as optional.
 * ------------------------------------------------------------------ */

export interface Area {
  id: number
  name: string
  code: string
  flag: string | null
}

export interface CompetitionInfo {
  id: number
  name: string
  code: string
  type?: string
  emblem: string
  area?: Area
  currentSeason?: {
    id: number
    startDate: string
    endDate: string
    currentMatchday: number | null
  }
}

/** One row of a league table. */
export interface StandingRow {
  position: number
  team: Team
  playedGames: number
  /** Recent results, e.g. "W,W,D,L,W". Null on some competitions. */
  form: string | null
  won: number
  draw: number
  lost: number
  points: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
}

/** A table — leagues have one, cups have one per group. */
export interface StandingsTable {
  stage: string
  type: string
  group: string | null
  table: StandingRow[]
}

export interface CompetitionStandings {
  competition: CompetitionInfo
  season: {
    id: number
    startDate: string
    endDate: string
    currentMatchday: number | null
  } | null
  standings: StandingsTable[]
}

export interface Scorer {
  player: {
    id: number
    name: string
    nationality: string | null
    position: string | null
  }
  team: Team
  goals: number
  assists: number | null
  penalties: number | null
  playedMatches: number
}

export interface LineupPlayer {
  id: number
  name: string
  position: string | null
  shirtNumber: number | null
}

/** Per-team match statistics. Every field is optional — coverage varies. */
export interface TeamStatistics {
  corner_kicks?: number
  free_kicks?: number
  goal_kicks?: number
  offsides?: number
  fouls?: number
  ball_possession?: number
  saves?: number
  throw_ins?: number
  shots?: number
  shots_on_goal?: number
  shots_off_goal?: number
  yellow_cards?: number
  yellow_red_cards?: number
  red_cards?: number
}

export interface MatchTeam extends Team {
  formation?: string | null
  leagueRank?: number | null
  coach?: { id: number | null; name: string | null; nationality: string | null }
  lineup?: LineupPlayer[]
  bench?: LineupPlayer[]
  statistics?: TeamStatistics
}

export interface MatchGoal {
  minute: number
  injuryTime: number | null
  type: string
  team: { id: number; name: string }
  scorer: { id: number; name: string }
  assist: { id: number; name: string } | null
  score: Score
}

export interface MatchBooking {
  minute: number
  team: { id: number; name: string }
  player: { id: number; name: string }
  card: string
}

export interface MatchSubstitution {
  minute: number
  team: { id: number; name: string }
  playerOut: { id: number; name: string }
  playerIn: { id: number; name: string }
}

/** Full match resource from `/v4/matches/{id}`. */
export interface MatchDetail extends Omit<Match, 'homeTeam' | 'awayTeam'> {
  homeTeam: MatchTeam
  awayTeam: MatchTeam
  venue?: string | null
  attendance?: number | null
  matchday?: number | null
  injuryTime?: number | null
  referees?: { id: number; name: string; type: string; nationality: string | null }[]
  goals?: MatchGoal[]
  bookings?: MatchBooking[]
  substitutions?: MatchSubstitution[]
  score: {
    winner?: string | null
    duration?: string
    fullTime: Score
    halfTime: Score
  }
}

export interface TeamDetail extends Team {
  address?: string | null
  website?: string | null
  founded?: number | null
  clubColors?: string | null
  venue?: string | null
  area?: Area
  coach?: { id: number | null; name: string | null; nationality: string | null }
  squad?: {
    id: number
    name: string
    position: string | null
    dateOfBirth: string | null
    nationality: string | null
  }[]
  runningCompetitions?: CompetitionInfo[]
}

/* ------------------------------------------------------------------ *
 * Match details from an enrichment provider (Highlightly).
 * Normalised on ingest, so the client never sees a provider's raw shape.
 * ------------------------------------------------------------------ */

export type TimelineEventType =
  | 'GOAL'
  | 'OWN_GOAL'
  | 'PENALTY_GOAL'
  | 'MISSED_PENALTY'
  | 'YELLOW_CARD'
  | 'SECOND_YELLOW'
  | 'RED_CARD'
  | 'SUBSTITUTION'
  | 'VAR'

/** One timeline entry, oriented to OUR home/away. */
export interface MatchTimelineEvent {
  type: TimelineEventType
  minute: number | null
  addedTime: number | null
  side: 'home' | 'away' | null
  /** Scorer, booked player, or the player coming ON for a substitution. */
  player: string | null
  /** Assist for a goal, or the player going OFF for a substitution. */
  related: string | null
  /** e.g. the VAR decision text. */
  detail: string | null
  cancelled: boolean
}

export interface LineupEntry {
  name: string
  number: number | null
  /** Goalkeeper / Defender / Midfielder / Forward, as the provider says. */
  position: string | null
}

export interface TeamLineupData {
  formation: string | null
  /** Rows from goalkeeper to attack, as the formation draws them. */
  rows: LineupEntry[][]
  bench: LineupEntry[]
}

export interface MatchLineupsData {
  home: TeamLineupData
  away: TeamLineupData
}

/** Keys of the normalised statistics, in display order. */
export type MatchStatKey =
  | 'possession'
  | 'xg'
  | 'shots'
  | 'shots_on_target'
  | 'shots_off_target'
  | 'blocked_shots'
  | 'big_chances'
  | 'corners'
  | 'fouls'
  | 'offsides'
  | 'yellow_cards'
  | 'red_cards'
  | 'saves'
  | 'passes'
  | 'pass_accuracy'
  | 'xa'

export interface MatchStatLine {
  key: MatchStatKey
  label: string
  home: number
  away: number
  /** percent: 0-100 integer; decimal: two places (xG); count: integer. */
  format: 'percent' | 'decimal' | 'count'
}

/** Present on a match payload when a details provider covers it. */
export interface MatchDetailsExtras {
  events?: MatchTimelineEvent[]
  lineups?: MatchLineupsData | null
  statistics?: MatchStatLine[] | null
  /** Attribution: which provider the events/lineups/stats came from. */
  detailsSource?: 'highlightly' | null
}
