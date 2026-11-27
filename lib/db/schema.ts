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
  jsonb,
  boolean,
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
    /** Main referee's name, when the provider sends one (PRD MC-1). */
    referee: text('referee'),
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

/* ------------------------------------------------------------------ *
 * Provider mapping (PRD section 10, ProviderMap)
 * ------------------------------------------------------------------ */

/**
 * Translates a provider's ids into ours.
 *
 * football-data.org was the first provider, so its ids became the canonical
 * keys (a team's `teams.id` IS its football-data id). Every later provider -
 * OpenLigaDB, TheSportsDB, a paid feed - maps its own ids onto those keys
 * through this table, so adding or swapping a provider never rewrites a
 * primary key or touches a client.
 *
 * `our_key` is text because competitions are keyed by code ('PL') while
 * everything else is an integer; ingestion is the only reader, so the cast
 * never sits on a hot path.
 */
export const providerMap = pgTable(
  'provider_map',
  {
    provider: text('provider').notNull(),
    entityType: text('entity_type').notNull(),
    providerId: text('provider_id').notNull(),
    ourKey: text('our_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.entityType, t.providerId] }),
    // Each provider names a given entity of ours at most once.
    uniqueIndex('provider_map_our_key_key').on(t.provider, t.entityType, t.ourKey),
    check(
      'provider_map_entity_type_valid',
      sql`entity_type = ANY (ARRAY['competition','season','team','match','player'])`
    ),
    check('provider_map_provider_not_blank', sql`length(btrim(provider)) > 0`),
  ]
)

/* ------------------------------------------------------------------ *
 * Seasons and players (PRD section 10)
 * ------------------------------------------------------------------ */

export const seasons = pgTable(
  'seasons',
  {
    /** football-data season id. */
    id: integer('id').primaryKey(),
    competitionCode: text('competition_code')
      .notNull()
      .references(() => competitions.code, { onDelete: 'cascade' }),
    startDate: date('start_date'),
    endDate: date('end_date'),
    currentMatchday: integer('current_matchday'),
    winnerTeamId: integer('winner_team_id').references(() => teams.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('seasons_competition_idx').on(t.competitionCode, t.startDate),
    check(
      'seasons_dates_ordered',
      sql`start_date IS NULL OR end_date IS NULL OR start_date <= end_date`
    ),
  ]
)

export const players = pgTable(
  'players',
  {
    /** football-data person id. */
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    dateOfBirth: date('date_of_birth'),
    nationality: text('nationality'),
    position: text('position'),
    shirtNumber: integer('shirt_number'),
    heightCm: integer('height_cm'),
    /** Only a URL we are allowed to display - see the licence notes where it is set. */
    photoUrl: text('photo_url'),
    currentTeamId: integer('current_team_id').references(() => teams.id, {
      onDelete: 'set null',
    }),
    /** Wikidata Q-id, when matched, for CC0 biographical enrichment. */
    wikidataId: text('wikidata_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('players_team_idx').on(t.currentTeamId),
    check('players_name_not_blank', sql`length(btrim(name)) > 0`),
    check(
      'players_shirt_number_range',
      sql`shirt_number IS NULL OR (shirt_number BETWEEN 0 AND 99)`
    ),
    check('players_height_range', sql`height_cm IS NULL OR (height_cm BETWEEN 120 AND 230)`),
  ]
)

/* ------------------------------------------------------------------ *
 * Personalisation (PRD MAT-2, ON-1, NT-1)
 * ------------------------------------------------------------------ */

/** Entity kinds a device can follow. */
export const FOLLOWABLE = ['team', 'competition', 'match', 'player'] as const

/**
 * What a device follows.
 *
 * Device-based rather than account-based (PRD section 17 leaves accounts
 * optional): the browser generates an opaque random id on first visit and
 * sends it with follow requests. Nothing here identifies a person.
 *
 * `notify` holds per-follow alert toggles (PRD NT-1), e.g.
 * {"goals": true, "kickoff": false}. Unknown keys are rejected by the API,
 * not by the database.
 */
export const follows = pgTable(
  'follows',
  {
    deviceId: text('device_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityKey: text('entity_key').notNull(),
    notify: jsonb('notify').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.deviceId, t.entityType, t.entityKey] }),
    // Fan-out: "every device following team 64".
    index('follows_entity_idx').on(t.entityType, t.entityKey),
    check(
      'follows_entity_type_valid',
      sql`entity_type = ANY (ARRAY['team','competition','match','player'])`
    ),
    check('follows_device_id_shape', sql`length(device_id) BETWEEN 16 AND 64`),
    check('follows_notify_is_object', sql`jsonb_typeof(notify) = 'object'`),
  ]
)

/* ------------------------------------------------------------------ *
 * Notifications (PRD section 6.4, section 9 event differ)
 * ------------------------------------------------------------------ */

/** A browser's Web Push subscription (VAPID). */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: text('device_id').notNull(),
    /** The push service URL. Unique: resubscribing updates in place. */
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    /** IANA zone, for quiet hours (PRD NT-4). */
    timezone: text('timezone').notNull().default('UTC'),
    locale: text('locale').notNull().default('en'),
    /** Quiet hours in the device's own zone, 0-23. Both null = never quiet. */
    quietStartHour: integer('quiet_start_hour'),
    quietEndHour: integer('quiet_end_hour'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    /** Consecutive delivery failures; a dead endpoint is pruned past a threshold. */
    failureCount: integer('failure_count').notNull().default(0),
  },
  (t) => [
    uniqueIndex('push_subscriptions_endpoint_key').on(t.endpoint),
    index('push_subscriptions_device_idx').on(t.deviceId),
    check('push_subscriptions_device_id_shape', sql`length(device_id) BETWEEN 16 AND 64`),
    check('push_subscriptions_endpoint_https', sql`endpoint LIKE 'https://%'`),
    check(
      'push_subscriptions_quiet_hours_range',
      sql`(quiet_start_hour IS NULL OR quiet_start_hour BETWEEN 0 AND 23)
          AND (quiet_end_hour IS NULL OR quiet_end_hour BETWEEN 0 AND 23)`
    ),
  ]
)

/** Change signals the event differ can emit (PRD section 9). */
export const SIGNAL_TYPES = [
  'KICKOFF',
  'GOAL',
  'HALF_TIME',
  'SECOND_HALF',
  'FULL_TIME',
  'SCORE_CORRECTION',
  'POSTPONED',
  'CANCELLED',
] as const

/**
 * What changed in a match between two syncs.
 *
 * The event differ compares a freshly ingested match with the stored row and
 * writes one signal per change: a score going 1-0 to 2-0 is a GOAL, 2-0 back
 * to 1-0 is a SCORE_CORRECTION (a VAR-disallowed goal, PRD NT-3). Signals
 * drive notifications; they are not the event timeline a user reads.
 *
 * `seq` is monotonic per match (PRD section 11), and UNIQUE(match_id, seq)
 * means two racing syncs cannot both record the same change.
 */
export const matchSignals = pgTable(
  'match_signals',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    matchId: integer('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    /** Score and status after the change, plus the score before it for goals. */
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('match_signals_match_seq_key').on(t.matchId, t.seq),
    // The notifier scans recent signals.
    index('match_signals_created_idx').on(t.createdAt),
    check(
      'match_signals_type_valid',
      sql`type = ANY (ARRAY['KICKOFF','GOAL','HALF_TIME','SECOND_HALF','FULL_TIME','SCORE_CORRECTION','POSTPONED','CANCELLED'])`
    ),
    check('match_signals_seq_positive', sql`seq > 0`),
  ]
)

/**
 * One row per push attempted. The dedupe key is the primary key, so the same
 * goal reaching one device through three follows sends one push (PRD NT-2).
 */
export const notificationLog = pgTable(
  'notification_log',
  {
    dedupeKey: text('dedupe_key').primaryKey(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => pushSubscriptions.id, { onDelete: 'cascade' }),
    signalId: integer('signal_id')
      .notNull()
      .references(() => matchSignals.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notification_log_signal_idx').on(t.signalId),
    check('notification_log_status_valid', sql`status = ANY (ARRAY['sent','failed','skipped'])`),
  ]
)

/* ------------------------------------------------------------------ *
 * Abuse control (PRD section 12, security)
 * ------------------------------------------------------------------ */

/**
 * Hits against a rate-limited action, e.g. bucket 'login', key = client IP.
 *
 * In the database rather than in memory because a serverless host runs many
 * short-lived instances: an in-memory counter would give every instance its
 * own fresh budget, which is no limit at all.
 */
export const rateLimitEvents = pgTable(
  'rate_limit_events',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    bucket: text('bucket').notNull(),
    key: text('key').notNull(),
    hitAt: timestamp('hit_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('rate_limit_events_lookup_idx').on(t.bucket, t.key, t.hitAt)]
)

/* ------------------------------------------------------------------ *
 * Match events from providers (PRD section 10, MatchEvent)
 * ------------------------------------------------------------------ */

/** Event kinds a provider can report. */
export const MATCH_EVENT_TYPES = [
  'GOAL',
  'OWN_GOAL',
  'PENALTY_GOAL',
  'MISSED_PENALTY',
  'YELLOW_CARD',
  'SECOND_YELLOW',
  'RED_CARD',
  'SUBSTITUTION',
  'VAR',
] as const

/**
 * What happened in a match, as a provider reported it - the timeline a user
 * reads on the Facts tab.
 *
 * Distinct from match_signals: a signal is our own inference from two
 * consecutive scorelines ("it went 1-0 to 2-0"), produced for every
 * competition; an event is a provider's fact ("Wirtz, 90+11, penalty"),
 * available only where some provider covers that competition.
 *
 * Unique on (provider, provider_event_id), so re-ingesting is a no-op.
 * player_name is kept even when player_id cannot be resolved: an unmapped
 * scorer is still worth showing.
 */
export const matchEvents = pgTable(
  'match_events',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    matchId: integer('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    type: text('type').notNull(),
    minute: integer('minute'),
    /** Stoppage-time minutes, e.g. 11 for "90+11". */
    addedTime: integer('added_time'),
    teamId: integer('team_id').references(() => teams.id),
    playerId: integer('player_id').references(() => players.id, { onDelete: 'set null' }),
    playerName: text('player_name'),
    /** Assist provider for a goal, or the player leaving for a substitution. */
    relatedPlayerName: text('related_player_name'),
    /** Running score after this event, for goals. */
    scoreHome: integer('score_home'),
    scoreAway: integer('score_away'),
    detail: text('detail'),
    /** VAR-disallowed goals stay visible, struck through (PRD section 11). */
    isCancelled: boolean('is_cancelled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('match_events_provider_key').on(t.provider, t.providerEventId),
    index('match_events_match_idx').on(t.matchId, t.minute),
    check(
      'match_events_type_valid',
      sql`type = ANY (ARRAY['GOAL','OWN_GOAL','PENALTY_GOAL','MISSED_PENALTY','YELLOW_CARD','SECOND_YELLOW','RED_CARD','SUBSTITUTION','VAR'])`
    ),
    check('match_events_minute_range', sql`minute IS NULL OR (minute BETWEEN 0 AND 150)`),
    check('match_events_added_time_range', sql`added_time IS NULL OR (added_time BETWEEN 0 AND 30)`),
  ]
)

export type CompetitionRow = typeof competitions.$inferSelect
export type TeamRow = typeof teams.$inferSelect
export type MatchRow = typeof matches.$inferSelect
export type StandingDbRow = typeof standings.$inferSelect
export type ScorerDbRow = typeof scorers.$inferSelect
export type UserRow = typeof users.$inferSelect
export type ChannelRow = typeof channels.$inferSelect
export type StreamOverrideRow = typeof streamOverrides.$inferSelect
export type SyncStateRow = typeof syncState.$inferSelect
export type ProviderMapRow = typeof providerMap.$inferSelect
export type SeasonRow = typeof seasons.$inferSelect
export type PlayerRow = typeof players.$inferSelect
export type FollowRow = typeof follows.$inferSelect
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
export type MatchSignalRow = typeof matchSignals.$inferSelect
export type NotificationLogRow = typeof notificationLog.$inferSelect
export type MatchEventRow = typeof matchEvents.$inferSelect
