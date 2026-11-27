CREATE TABLE "match_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "match_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"match_id" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text NOT NULL,
	"minute" integer,
	"added_time" integer,
	"team_id" integer,
	"player_id" integer,
	"player_name" text,
	"related_player_name" text,
	"score_home" integer,
	"score_away" integer,
	"detail" text,
	"is_cancelled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_events_type_valid" CHECK (type = ANY (ARRAY['GOAL','OWN_GOAL','PENALTY_GOAL','MISSED_PENALTY','YELLOW_CARD','SECOND_YELLOW','RED_CARD','SUBSTITUTION','VAR'])),
	CONSTRAINT "match_events_minute_range" CHECK (minute IS NULL OR (minute BETWEEN 0 AND 150)),
	CONSTRAINT "match_events_added_time_range" CHECK (added_time IS NULL OR (added_time BETWEEN 0 AND 30))
);
--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_events_provider_key" ON "match_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "match_events_match_idx" ON "match_events" USING btree ("match_id","minute");