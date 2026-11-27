CREATE TABLE "match_details" (
	"match_id" integer PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"lineups" jsonb,
	"statistics" jsonb,
	"venue" text,
	"referee" text,
	"upstream_state" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lineups_fetched_at" timestamp with time zone,
	"is_final" boolean DEFAULT false NOT NULL,
	CONSTRAINT "match_details_provider_not_blank" CHECK (length(btrim(provider)) > 0),
	CONSTRAINT "match_details_lineups_is_object" CHECK (lineups IS NULL OR jsonb_typeof(lineups) = 'object'),
	CONSTRAINT "match_details_statistics_is_array" CHECK (statistics IS NULL OR jsonb_typeof(statistics) = 'array')
);
--> statement-breakpoint
ALTER TABLE "match_details" ADD CONSTRAINT "match_details_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_details_pending_idx" ON "match_details" USING btree ("fetched_at") WHERE NOT is_final;