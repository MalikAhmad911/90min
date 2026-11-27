CREATE TABLE "follows" (
	"device_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_key" text NOT NULL,
	"notify" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_device_id_entity_type_entity_key_pk" PRIMARY KEY("device_id","entity_type","entity_key"),
	CONSTRAINT "follows_entity_type_valid" CHECK (entity_type = ANY (ARRAY['team','competition','match','player'])),
	CONSTRAINT "follows_device_id_shape" CHECK (length(device_id) BETWEEN 16 AND 64),
	CONSTRAINT "follows_notify_is_object" CHECK (jsonb_typeof(notify) = 'object')
);
--> statement-breakpoint
CREATE TABLE "match_signals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "match_signals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"match_id" integer NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_signals_type_valid" CHECK (type = ANY (ARRAY['KICKOFF','GOAL','HALF_TIME','SECOND_HALF','FULL_TIME','SCORE_CORRECTION','POSTPONED','CANCELLED'])),
	CONSTRAINT "match_signals_seq_positive" CHECK (seq > 0)
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"dedupe_key" text PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"signal_id" integer NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_log_status_valid" CHECK (status = ANY (ARRAY['sent','failed','skipped']))
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"date_of_birth" date,
	"nationality" text,
	"position" text,
	"shirt_number" integer,
	"height_cm" integer,
	"photo_url" text,
	"current_team_id" integer,
	"wikidata_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_name_not_blank" CHECK (length(btrim(name)) > 0),
	CONSTRAINT "players_shirt_number_range" CHECK (shirt_number IS NULL OR (shirt_number BETWEEN 0 AND 99)),
	CONSTRAINT "players_height_range" CHECK (height_cm IS NULL OR (height_cm BETWEEN 120 AND 230))
);
--> statement-breakpoint
CREATE TABLE "provider_map" (
	"provider" text NOT NULL,
	"entity_type" text NOT NULL,
	"provider_id" text NOT NULL,
	"our_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_map_provider_entity_type_provider_id_pk" PRIMARY KEY("provider","entity_type","provider_id"),
	CONSTRAINT "provider_map_entity_type_valid" CHECK (entity_type = ANY (ARRAY['competition','season','team','match','player'])),
	CONSTRAINT "provider_map_provider_not_blank" CHECK (length(btrim(provider)) > 0)
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"quiet_start_hour" integer,
	"quiet_end_hour" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "push_subscriptions_device_id_shape" CHECK (length(device_id) BETWEEN 16 AND 64),
	CONSTRAINT "push_subscriptions_endpoint_https" CHECK (endpoint LIKE 'https://%'),
	CONSTRAINT "push_subscriptions_quiet_hours_range" CHECK ((quiet_start_hour IS NULL OR quiet_start_hour BETWEEN 0 AND 23)
          AND (quiet_end_hour IS NULL OR quiet_end_hour BETWEEN 0 AND 23))
);
--> statement-breakpoint
CREATE TABLE "rate_limit_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rate_limit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bucket" text NOT NULL,
	"key" text NOT NULL,
	"hit_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" integer PRIMARY KEY NOT NULL,
	"competition_code" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"current_matchday" integer,
	"winner_team_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_dates_ordered" CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "referee" text;--> statement-breakpoint
ALTER TABLE "match_signals" ADD CONSTRAINT "match_signals_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_subscription_id_push_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."push_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_signal_id_match_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."match_signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_current_team_id_teams_id_fk" FOREIGN KEY ("current_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_competition_code_competitions_code_fk" FOREIGN KEY ("competition_code") REFERENCES "public"."competitions"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_winner_team_id_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follows_entity_idx" ON "follows" USING btree ("entity_type","entity_key");--> statement-breakpoint
CREATE UNIQUE INDEX "match_signals_match_seq_key" ON "match_signals" USING btree ("match_id","seq");--> statement-breakpoint
CREATE INDEX "match_signals_created_idx" ON "match_signals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notification_log_signal_idx" ON "notification_log" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX "players_team_idx" ON "players" USING btree ("current_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_map_our_key_key" ON "provider_map" USING btree ("provider","entity_type","our_key");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_device_idx" ON "push_subscriptions" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "rate_limit_events_lookup_idx" ON "rate_limit_events" USING btree ("bucket","key","hit_at");--> statement-breakpoint
CREATE INDEX "seasons_competition_idx" ON "seasons" USING btree ("competition_code","start_date");