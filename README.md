# 90 Min Tactics

A FotMob-style live football app: scores, league tables, match centre, team
pages and a "where to watch" section — built entirely on **free** data sources.

Next.js 14 (App Router) · TypeScript · Tailwind · SWR · Vitest

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in the values below
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | Required | What it does |
|---|---|---|
| `FOOTBALL_DATA_API_KEY` | yes | Free key from [football-data.org](https://www.football-data.org/client/register). Without it every data route returns an error. |
| `DATABASE_URL` | yes | Neon **pooled** connection string, used by the app. |
| `DATABASE_URL_UNPOOLED` | migrations | Neon **direct** connection string. The pooler cannot hold the session state DDL needs. |
| `CRON_SECRET` | yes | Bearer token guarding `/api/cron/sync`. Unset means the route refuses everything. |
| `AUTH_SECRET` | yes in production | Signs the admin session JWT. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | first run only | Seeds the admin account used by `/admin/streams`. |

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest (run once) |
| `npm run test:watch` | Vitest watch mode |

## Architecture

Football data lives in **Neon Postgres**, not in the request path. An ingestion
job pulls from football-data.org and upserts normalised rows; every page then
reads SQL. Users never wait on the provider, and the provider's quota is spent
by one background job rather than by every visitor.

```
football-data.org
      | rate limiter (9 req/min, 429-aware)
      v
  ingestion  ->  Postgres (competitions, teams, matches, standings, scorers)
                     |
                 /api/*  ->  SWR hooks  ->  UI
```

### Keeping it fresh without a scheduler

Vercel's free plan runs cron **once per day**, which is useless for live
scores. So the app refreshes itself: a request that notices stale data starts a
sync in the background and serves what is already stored. Only a completely
cold database makes a request wait.

For proactive refreshes, point any external scheduler at the sync endpoint:

```
GET /api/cron/sync        Authorization: Bearer $CRON_SECRET
GET /api/cron/sync?resource=live-window
GET /api/cron/sync?resource=season:PL
```

Each call refreshes only the few stalest resources, so it can never exhaust the
provider quota. Without `CRON_SECRET` set the route refuses every request.

### Database

| Table | Holds |
|---|---|
| `competitions`, `teams` | reference data |
| `matches` | every fixture and result, with a generated `match_date` column the feed indexes on |
| `standings`, `scorers` | league tables and top scorers per season |
| `users`, `channels`, `stream_overrides` | admin-owned data |
| `sync_state` | what was last pulled, and what failed |

Invariants are constraints, not conventions: statuses, stream kinds and scopes
are `CHECK`ed, usernames are unique case-insensitively, a match cannot have the
same team twice, and scores cannot be negative.

Migrations are Drizzle Kit:

```bash
npx drizzle-kit generate   # schema -> SQL in drizzle/
npx drizzle-kit migrate    # apply (uses the DIRECT, non-pooled URL)
```

## What the free tier gives you

Measured against a real free-tier key, not taken from the docs.

**Available:** live scores, fixtures and results for any date, league tables,
top scorers, head-to-head, squads, referees and venue.

**Not available on the free plan:** goals/cards/substitutions, lineups and
formations, and match statistics. The API reference documents these fields, but
a TIER_ONE key does not receive them. The Lineups and Stats tabs show an
explicit "not available on this plan" state and will work unchanged on a paid
key.

**Not available anywhere for free:** xG, shot maps, heatmaps and player
ratings. Those are Opta-licensed.

### How a date is fetched

The free tier blocks `/v4/matches` when a date range is passed — and answers
`200` with an empty list rather than an error, so an empty result proves
nothing. Two paths are used instead:

- **today / tomorrow** — the bare `/v4/matches` endpoint. One request, live scores.
- **any other date** — a per-competition season cache. Twelve requests warm it
  once (~60s), then every other date is served with zero upstream calls.

## Routes

| Route | What it is |
|---|---|
| `/` | Live scores, grouped by league, with date navigation |
| `/match/[id]` | Match centre: summary, lineups, stats, H2H |
| `/leagues` | All available competitions |
| `/leagues/[id]` | Table and top scorers (accepts `PL` or `2021`) |
| `/team/[id]` | Fixtures, results and squad |
| `/watch` | Where to watch + admin-managed streams |
| `/admin/streams` | Stream/channel CMS (session-protected) |

## Known limitations

- The admin CMS stores JSON under `data/`. That **will not persist on a
  serverless host** such as Vercel — it needs a real database before the CMS is
  deployed there.
- `AUTH_SECRET` falls back to a development default if unset. Set it in
  production, or admin sessions can be forged.
