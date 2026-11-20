import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  date,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * Schema for 90 Min Tactics.
 *
 * This app is single-tenant: one public site, one set of admin accounts.
 * There is deliberately no `tenant_id` column and no row-level security -
 * inventing a tenant key that always holds the same value would add ceremony
 * without adding safety. What the database does enforce is shape: every
 * status, kind and scope is a CHECK constraint and every relation is a
 * foreign key, so a bad ingestion run fails loudly instead of writing
 * nonsense that the UI then has to defend against.
 *
 * Two groups of tables:
 *   - football data    - written only by the ingestion job, read by everyone
 *   - application data - written by admins through the CMS
 */

/* ------------------------------------------------------------------ *
 * Football data
 * ------------------------------------------------------------------ */

export const competitions = pgTable(
  'competitions',
  {
    /** football-data code, e.g. 'PL'. The natural key used across the app. */
    code: text('code').primaryKey(),
    /** football-data numeric id, kept for legacy /leagues/<id> links. */
    externalId: integer('external_id').notNull(),
    name: text('name').notNull(),
    shortName: text('short_name').notNull(),
    country: text('country').notNull(),
    flag: text('flag').notNull().default(''),
    emblem: text('emblem'),
    /** Null until the first sync tells us which season is current. */
    currentSeasonId: integer('current_season_id'),
    currentMatchday: integer('current_matchday'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('competitions_external_id_key').on(t.externalId)]
)

export const teams = pgTable('teams', {
  /** football-data team id. */
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  shortName: text('short_name'),
  tla: text('tla'),
  crest: text('crest'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Every status football-data can report. Anything else is a provider change. */
export const MATCH_STATUSES = [
  'SCHEDULED',
  'TIMED',
  'IN_PLAY',
  'PAUSED',
  'FINISHED',
  'SUSPENDED',
  'POSTPONED',
  'CANCELLED',
  'AWARDED',
] as const

export const matches = pgTable(
  'matches',
  {
    /** football-data match id. Natural key, so re-ingesting is a no-op. */
    id: integer('id').primaryKey(),
    competitionCode: text('competition_code')
      .notNull()
      .references(() => competitions.code, { onDelete: 'cascade' }),
    seasonId: integer('season_id'),
    utcDate: timestamp('utc_date', { withTimezone: true }).notNull(),
    /**
     * The UTC calendar day, maintained by the database.
     *
     * The home feed asks "what is on for this date", which against `utc_date`
     * alone is a range scan per query. A stored generated column makes it a
     * plain index lookup, and it can never drift from `utc_date`.
     */
    matchDate: date('match_date')
      .notNull()
      .generatedAlwaysAs(sql`((utc_date AT TIME ZONE 'UTC')::date)`),
    status: text('status').notNull(),
    minute: integer('minute'),
    matchday: integer('matchday'),
    stage: text('stage'),
    /** '' rather than NULL so grouping and uniqueness stay simple. */
    groupName: text('group_name').notNull().default(''),
    homeTeamId: integer('home_team_id')
      .notNull()
      .references(() => teams.id),
    awayTeamId: integer('away_team_id')
      .notNull()
      .references(() => teams.id),
    homeScoreFt: integer('home_score_ft'),
    awayScoreFt: integer('away_score_ft'),
    homeScoreHt: integer('home_score_ht'),
    awayScoreHt: integer('away_score_ht'),
    winner: text('winner'),
    venue: text('venue'),
    /** The provider's own lastUpdated, used to skip no-op writes. */
    lastUpdated: timestamp('last_updated', { withTimezone: true }),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The home feed: every match on one day, in kickoff order.
    index('matches_match_date_idx').on(t.matchDate, t.utcDate),
    // A competition's fixture list.
    index('matches_competition_date_idx').on(t.competitionCode, t.utcDate),
    // A team's fixtures and results.
    index('matches_home_team_idx').on(t.homeTeamId, t.utcDate),
    index('matches_away_team_idx').on(t.awayTeamId, t.utcDate),
    // "What is live right now" stays a tiny index however big the table grows.
    index('matches_live_idx')
      .on(t.utcDate)
      .where(sql`status IN ('IN_PLAY', 'PAUSED')`),
    check(
      'matches_status_valid',
      sql`status = ANY (ARRAY['SCHEDULED','TIMED','IN_PLAY','PAUSED','FINISHED','SUSPENDED','POSTPONED','CANCELLED','AWARDED'])`
    ),
    check(
      'matches_scores_non_negative',
      sql`(home_score_ft IS NULL OR home_score_ft >= 0)
          AND (away_score_ft IS NULL OR away_score_ft >= 0)
          AND (home_score_ht IS NULL OR home_score_ht >= 0)
          AND (away_score_ht IS NULL OR away_score_ht >= 0)`
    ),
    check('matches_teams_differ', sql`home_team_id <> away_team_id`),
  ]
)

export const standings = pgTable(
  'standings',
  {
    competitionCode: text('competition_code')
      .notNull()
      .references(() => competitions.code, { onDelete: 'cascade' }),
    seasonId: integer('season_id').notNull(),
    stage: text('stage').notNull(),
    /** TOTAL / HOME / AWAY. The app shows TOTAL. */
    type: text('type').notNull(),
    groupName: text('group_name').notNull().default(''),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    position: integer('position').notNull(),
    playedGames: integer('played_games').notNull().default(0),
    won: integer('won').notNull().default(0),
    draw: integer('draw').notNull().default(0),
    lost: integer('lost').notNull().default(0),
    points: integer('points').notNull().default(0),
    goalsFor: integer('goals_for').notNull().default(0),
    goalsAgainst: integer('goals_against').notNull().default(0),
    goalDifference: integer('goal_difference').notNull().default(0),
    form: text('form'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One row per team per table, so re-ingesting overwrites in place.
    primaryKey({
      columns: [t.competitionCode, t.seasonId, t.stage, t.type, t.groupName, t.teamId],
    }),
    index('standings_lookup_idx').on(t.competitionCode, t.seasonId, t.type, t.position),
    check('standings_type_valid', sql`type = ANY (ARRAY['TOTAL','HOME','AWAY'])`),
    check('standings_position_positive', sql`position > 0`),
  ]
)

export const scorers = pgTable(
  'scorers',
  {
    competitionCode: text('competition_code')
      .notNull()
      .references(() => competitions.code, { onDelete: 'cascade' }),
    seasonId: integer('season_id').notNull(),
    playerId: integer('player_id').notNull(),
    playerName: text('player_name').notNull(),
    nationality: text('nationality'),
    position: text('position'),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    goals: integer('goals').notNull().default(0),
    assists: integer('assists'),
    penalties: integer('penalties'),
    playedMatches: integer('played_matches'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.competitionCode, t.seasonId, t.playerId] }),
    index('scorers_leaderboard_idx').on(t.competitionCode, t.seasonId, t.goals),
    check('scorers_goals_non_negative', sql`goals >= 0`),
  ]
)

/* ------------------------------------------------------------------ *
 * Application data
 * ------------------------------------------------------------------ */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    /** bcrypt hash. Never plaintext, never returned to a client. */
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('admin'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [
    // Case-insensitive, so 'Admin' cannot be registered beside 'admin'.
    uniqueIndex('users_username_key').on(sql`lower(${t.username})`),
    check('users_role_valid', sql`role = ANY (ARRAY['admin'])`),
    check('users_username_not_blank', sql`length(btrim(username)) > 0`),
  ]
)

export const streamOverrides = pgTable(
  'stream_overrides',
  {
    /** 'match' (key = match id) or 'competition' (key = competition code). */
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    kind: text('kind').notNull(),
    src: text('src').notNull(),
    title: text('title').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.scope, t.key] }),
    check('stream_overrides_scope_valid', sql`scope = ANY (ARRAY['match','competition'])`),
    check('stream_overrides_kind_valid', sql`kind = ANY (ARRAY['youtube','hls'])`),
    check('stream_overrides_src_not_blank', sql`length(btrim(src)) > 0`),
  ]
)

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    src: text('src').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('channels_order_idx').on(t.sortOrder, t.createdAt),
    check('channels_kind_valid', sql`kind = ANY (ARRAY['youtube','hls'])`),
    check('channels_name_not_blank', sql`length(btrim(name)) > 0`),
    check('channels_src_not_blank', sql`length(btrim(src)) > 0`),
  ]
)

/**
 * One row per thing the ingestion job keeps fresh: 'today', 'season:PL',
 * 'standings:PL', and so on. It lets the job decide what is stale without
 * re-reading the data itself, and gives the admin page something honest to
 * show when the provider is failing.
 */
export const syncState = pgTable('sync_state', {
  resource: text('resource').primaryKey(),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastError: text('last_error'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  rowsWritten: integer('rows_written').notNull().default(0),
})

export type CompetitionRow = typeof competitions.$inferSelect
export type TeamRow = typeof teams.$inferSelect
export type MatchRow = typeof matches.$inferSelect
export type StandingDbRow = typeof standings.$inferSelect
export type ScorerDbRow = typeof scorers.$inferSelect
export type UserRow = typeof users.$inferSelect
export type ChannelRow = typeof channels.$inferSelect
export type StreamOverrideRow = typeof streamOverrides.$inferSelect
export type SyncStateRow = typeof syncState.$inferSelect
