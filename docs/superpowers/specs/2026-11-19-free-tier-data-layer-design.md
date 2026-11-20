# Free-tier data layer + league/match/team pages — Design

Date: 2026-11-19
Status: Implemented

## Goal

Build as much of a FotMob-style experience as football-data.org's **free tier**
allows, and make the app survive that tier's 10-requests-per-minute quota.

## The bug this started from

`lib/api/football-data.ts` fetched **one request per competition** — 14 of them —
for every date the user looked at:

```ts
await Promise.all(COMPETITION_CODES.map((code) => fetchCompetitionMatches(code, date, key)))
```

The free plan allows 10 requests/minute
([policies](https://docs.football-data.org/general/v4/policies.html)). Requests
11–14 came back `429`, and the client's `if (!res.ok) return []` turned each one
into an empty league. The feed silently lost whole competitions and looked like
a quiet day of football.

Two of the 14 codes (`EL`, `CLI`) are not on the free tier at all, so they
answered `403` on every single request — pure waste.

## Architecture

```
                 RateLimiter (9 / 60s, sliding window, 429-aware)
                          |
football-data.org  <------+------  request<T>()   throws, never swallows
                          |
                 cached() stale-while-revalidate
                   memory Map  +  data/cache/*.json
                          |
             /api/matches, /api/standings, /api/scorers,
             /api/match/[id], /api/team/[id]
                          |
                 SWR hooks (poll only when live)
```

### `lib/server/rate-limiter.ts`

Sliding-window limiter. Slots are handed out through a serialised promise chain
so concurrent callers cannot all pass the capacity check at once; the work
itself still runs in parallel. `pauseFor(ms)` is called on a `429` so the whole
process backs off together.

Budget is **9**, not 10, so a stray retry cannot tip the window over.

### `lib/server/cache.ts`

Two layers — an in-memory `Map` and JSON files under `data/cache/`. The disk
layer is best-effort: on a read-only filesystem (serverless) writes fail
harmlessly and memory still works.

Semantics, mirroring the `stale-while-revalidate` / `stale-if-error` headers
FotMob serves its own pages with:

| State | Behaviour |
|---|---|
| fresh | returned immediately |
| stale | returned immediately, refreshed in the background |
| expired | awaits the loader |
| loader throws, stale exists | stale returned — an old table beats an error page |
| concurrent misses | collapsed into one upstream call |

`PolicyInput<T>` lets the policy be **derived from the cached value**, which is
what keeps the quota under control:

- a day with a live match → 30s
- a day with a kickoff within 3h → 60s
- a day where everything finished → 6h
- a **finished match** → 24h (a played match is immutable; refreshing it is
  pure waste)

### `lib/api/football-data.ts`

- One request per date via `/v4/matches?dateFrom=&dateTo=`, replacing 14.
  Falls back to the per-competition loop (throttled) if that endpoint is
  unavailable, and only reports "no matches" when *every* league actually
  returned nothing.
- Errors are typed (`FootballDataError` with `status`) and propagate, so the
  cache can decide to serve stale data. A 429 is never mistaken for "no games".
- New resources: `fetchMatchDetail`, `fetchHeadToHead`, `fetchStandings`,
  `fetchScorers`, `fetchTeam`, `fetchTeamMatches`, `fetchCompetition`.

### `lib/competitions.ts`

The competition catalogue lives here, dependency-free, so client components can
import it without pulling `fs` (via the disk cache) into the browser bundle.

Routes accept either the code (`/leagues/PL`) or the legacy numeric id
(`/leagues/2021`).

## What the free tier actually supports

Measured against a real TIER_ONE key, not read off the docs. The API reference
documents the **full** match resource; the free plan returns a subset of it,
and the difference matters.

| Feature | Free tier | Page |
|---|---|---|
| Live scores, status, minute | yes | `/` |
| Fixtures and results, any date | yes | `/`, `/team/[id]` |
| League tables | yes | `/leagues/[id]` |
| Recent-form string on a table row | no - returns `null`; the column hides itself | — |
| Top scorers | yes | `/leagues/[id]` |
| Head-to-head | yes | `/match/[id]` |
| Squad | yes | `/team/[id]` |
| Referees, venue, matchday | yes | `/match/[id]` |
| **Goals, cards, substitutions** | **no** - absent from the response | — |
| **Lineups, bench, formation** | **no** - absent from the response | — |
| **Match statistics** (possession, shots) | **no** - absent from the response | — |
| **xG, shot maps, heatmaps, player ratings** | **no** - Opta-licensed | — |

A finished match on TIER_ONE returns only:
`area, awayTeam, competition, group, homeTeam, id, lastUpdated, matchday,
odds, referees, score, season, stage, status, utcDate, venue`.

Every optional field is therefore treated as optional in the UI. The Lineups
and Stats tabs render an explicit "not available on this plan" state rather
than crashing or showing a misleading blank. They light up unchanged if the
key is ever upgraded.

### Endpoint behaviour on TIER_ONE

This drove the whole fetch design, and none of it is documented:

| Call | Result |
|---|---|
| `/v4/matches?dateFrom=D&dateTo=D` | **`count: 0`** - a date range is blocked, and it answers **200**, so an empty list is *not* evidence that no football was played |
| `/v4/matches` (no params) | works - covers today + tomorrow, carries live scores |
| `/v4/competitions/{code}/matches` | works - the whole season in one request (380 for the PL) |

Hence two paths in `loadMatchesByDate`:

- **today / tomorrow** -> bare `/v4/matches`. One request, live scores.
- **any other date** -> the per-competition season cache. Twelve requests to
  warm (~60s once), then every other date in the season is served with **zero**
  upstream calls. Measured: a cold date took 62s, the next three took 548ms,
  1.4s and 722ms.

An empty response from the global endpoint is never trusted as "no matches";
the season path is what answers for every date outside the live window.

## Toolchain fixes made along the way

These were blocking and are worth recording.

1. **`npm install` failed outright.** `eslint-config-next@14` declares
   `eslint ^7 || ^8`, the project had `eslint ^9` → `ERESOLVE`. Resolved by
   upgrading to `eslint-config-next@15`, which supports ESLint 9. The whole
   v14 plugin stack used `context.getScope()` / `context.getAncestors()`,
   removed in ESLint 9, so lint could never have run.
2. **The entire test suite was broken** — 0 of 67 tests ran. On Windows, when
   Vite's root (`c:\...`) disagrees with Node's path casing (`C:\...`), the
   `vitest` package resolves twice and every file dies at its first
   `describe()`. Fixed by normalising the root and relying on `globals: true`
   (already set in the config) instead of `import … from 'vitest'`.
3. **ESLint had no `ignores`**, so `eslint .` linted the compiled output in
   `.next/`.
4. Two `MatchCard` tests asserted a `LiveBadge` the component stopped rendering
   when it moved to the FotMob-style minute column. Tests updated to the
   component's actual behaviour.

## Not done

- `LiveBadge`, `DateStrip` and `Sidebar` are now unreferenced by app code
  (`LiveBadge` survives only in its own test). Left in place.
- Following/favourites and push notifications.
- The `data/` JSON store still will not persist on a serverless host; a real
  database is needed before deploying the admin CMS to Vercel.
