-- Search (PRD SR-1) and provider mapping backfill (PRD section 10).
--
-- Hand-written: Drizzle cannot declare an extension, and the backfill is data,
-- not schema. Every statement is idempotent so re-running is harmless.

-- Trigram matching makes "man cit" find "Manchester City" and tolerates typos,
-- which a plain ILIKE '%q%' cannot do and cannot index.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "teams_name_trgm_idx"
  ON "teams" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_short_name_trgm_idx"
  ON "teams" USING gin ("short_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competitions_name_trgm_idx"
  ON "competitions" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_name_trgm_idx"
  ON "players" USING gin ("name" gin_trgm_ops);--> statement-breakpoint

-- Every row ingested so far came from football-data.org, whose ids are our
-- canonical keys, so each one maps to itself.
INSERT INTO "provider_map" ("provider", "entity_type", "provider_id", "our_key")
SELECT 'football-data', 'competition', "external_id"::text, "code"
FROM "competitions"
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "provider_map" ("provider", "entity_type", "provider_id", "our_key")
SELECT 'football-data', 'team', "id"::text, "id"::text
FROM "teams"
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "provider_map" ("provider", "entity_type", "provider_id", "our_key")
SELECT 'football-data', 'match', "id"::text, "id"::text
FROM "matches"
ON CONFLICT DO NOTHING;
