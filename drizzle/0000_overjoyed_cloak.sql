CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"src" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channels_kind_valid" CHECK (kind = ANY (ARRAY['youtube','hls'])),
	CONSTRAINT "channels_name_not_blank" CHECK (length(btrim(name)) > 0),
	CONSTRAINT "channels_src_not_blank" CHECK (length(btrim(src)) > 0)
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"code" text PRIMARY KEY NOT NULL,
	"external_id" integer NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"country" text NOT NULL,
	"flag" text DEFAULT '' NOT NULL,
	"emblem" text,
	"current_season_id" integer,
	"current_matchday" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" integer PRIMARY KEY NOT NULL,
	"competition_code" text NOT NULL,
	"season_id" integer,
	"utc_date" timestamp with time zone NOT NULL,
	"match_date" date GENERATED ALWAYS AS (((utc_date AT TIME ZONE 'UTC')::date)) STORED NOT NULL,
	"status" text NOT NULL,
	"minute" integer,
	"matchday" integer,
	"stage" text,
	"group_name" text DEFAULT '' NOT NULL,
	"home_team_id" integer NOT NULL,
	"away_team_id" integer NOT NULL,
	"home_score_ft" integer,
	"away_score_ft" integer,
	"home_score_ht" integer,
	"away_score_ht" integer,
	"winner" text,
	"venue" text,
	"last_updated" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_status_valid" CHECK (status = ANY (ARRAY['SCHEDULED','TIMED','IN_PLAY','PAUSED','FINISHED','SUSPENDED','POSTPONED','CANCELLED','AWARDED'])),
	CONSTRAINT "matches_scores_non_negative" CHECK ((home_score_ft IS NULL OR home_score_ft >= 0)
          AND (away_score_ft IS NULL OR away_score_ft >= 0)
          AND (home_score_ht IS NULL OR home_score_ht >= 0)
          AND (away_score_ht IS NULL OR away_score_ht >= 0)),
	CONSTRAINT "matches_teams_differ" CHECK (home_team_id <> away_team_id)
);
--> statement-breakpoint
CREATE TABLE "scorers" (
	"competition_code" text NOT NULL,
	"season_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"player_name" text NOT NULL,
	"nationality" text,
	"position" text,
	"team_id" integer NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer,
	"penalties" integer,
	"played_matches" integer,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scorers_competition_code_season_id_player_id_pk" PRIMARY KEY("competition_code","season_id","player_id"),
	CONSTRAINT "scorers_goals_non_negative" CHECK (goals >= 0)
);
--> statement-breakpoint
CREATE TABLE "standings" (
	"competition_code" text NOT NULL,
	"season_id" integer NOT NULL,
	"stage" text NOT NULL,
	"type" text NOT NULL,
	"group_name" text DEFAULT '' NOT NULL,
	"team_id" integer NOT NULL,
	"position" integer NOT NULL,
	"played_games" integer DEFAULT 0 NOT NULL,
	"won" integer DEFAULT 0 NOT NULL,
	"draw" integer DEFAULT 0 NOT NULL,
	"lost" integer DEFAULT 0 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"goals_for" integer DEFAULT 0 NOT NULL,
	"goals_against" integer DEFAULT 0 NOT NULL,
	"goal_difference" integer DEFAULT 0 NOT NULL,
	"form" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "standings_competition_code_season_id_stage_type_group_name_team_id_pk" PRIMARY KEY("competition_code","season_id","stage","type","group_name","team_id"),
	CONSTRAINT "standings_type_valid" CHECK (type = ANY (ARRAY['TOTAL','HOME','AWAY'])),
	CONSTRAINT "standings_position_positive" CHECK (position > 0)
);
--> statement-breakpoint
CREATE TABLE "stream_overrides" (
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"src" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stream_overrides_scope_key_pk" PRIMARY KEY("scope","key"),
	CONSTRAINT "stream_overrides_scope_valid" CHECK (scope = ANY (ARRAY['match','competition'])),
	CONSTRAINT "stream_overrides_kind_valid" CHECK (kind = ANY (ARRAY['youtube','hls'])),
	CONSTRAINT "stream_overrides_src_not_blank" CHECK (length(btrim(src)) > 0)
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"resource" text PRIMARY KEY NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"rows_written" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"tla" text,
	"crest" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_role_valid" CHECK (role = ANY (ARRAY['admin'])),
	CONSTRAINT "users_username_not_blank" CHECK (length(btrim(username)) > 0)
);
--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_competition_code_competitions_code_fk" FOREIGN KEY ("competition_code") REFERENCES "public"."competitions"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorers" ADD CONSTRAINT "scorers_competition_code_competitions_code_fk" FOREIGN KEY ("competition_code") REFERENCES "public"."competitions"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorers" ADD CONSTRAINT "scorers_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_competition_code_competitions_code_fk" FOREIGN KEY ("competition_code") REFERENCES "public"."competitions"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channels_order_idx" ON "channels" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "competitions_external_id_key" ON "competitions" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "matches_match_date_idx" ON "matches" USING btree ("match_date","utc_date");--> statement-breakpoint
CREATE INDEX "matches_competition_date_idx" ON "matches" USING btree ("competition_code","utc_date");--> statement-breakpoint
CREATE INDEX "matches_home_team_idx" ON "matches" USING btree ("home_team_id","utc_date");--> statement-breakpoint
CREATE INDEX "matches_away_team_idx" ON "matches" USING btree ("away_team_id","utc_date");--> statement-breakpoint
CREATE INDEX "matches_live_idx" ON "matches" USING btree ("utc_date") WHERE status IN ('IN_PLAY', 'PAUSED');--> statement-breakpoint
CREATE INDEX "scorers_leaderboard_idx" ON "scorers" USING btree ("competition_code","season_id","goals");--> statement-breakpoint
CREATE INDEX "standings_lookup_idx" ON "standings" USING btree ("competition_code","season_id","type","position");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" USING btree (lower("username"));