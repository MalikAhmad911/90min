# Live TV / "Watch" feature — Design

Date: 2026-06-21
Status: Approved

## Goal

Add a FotMob-style **"Where to watch"** experience to the 90min football app. For
each match, show the broadcaster(s) for the user's country with a link. Where a
**legal free stream** exists (official league/club YouTube live stream, or a free
HLS feed), play it embedded in-app via a "Watch" button.

No pirated/unlicensed streams. The player only loads URLs present in the curated
data set, and that set contains only legal/free sources.

## Non-goals (YAGNI)

- No new backend service, auth, or database.
- No real-time third-party TV-listings API (no reliable free one exists).
- No DRM / paid stream playback.

## Architecture

Reuses the existing `/api/matches` route for the match list. All watch information
is resolved client-side via curated static lookups.

### Data layer (`lib/tv/`)

- `types.ts`
  - `Country { code: string; name: string; flag: string }`
  - `Broadcaster { name: string; url: string; kind: 'tv' | 'stream' }`
  - `FreeStream { kind: 'youtube' | 'hls'; src: string; title: string }`
- `broadcasters.ts`
  - `COUNTRIES: Country[]` — starter set: GB 🇬🇧, US 🇺🇸, IN 🇮🇳, PK 🇵🇰.
  - `BROADCASTERS: Record<CompetitionCode, Record<CountryCode, Broadcaster[]>>`
    covering free-tier competitions (PL, CL, EL, PD, SA, BL1, FL1, ELC, DED, PPL).
  - `getWatchOptions(competitionCode, countryCode): Broadcaster[]` — returns `[]`
    when no data, so the UI can show a "Check local listings" fallback.
- `free-streams.ts`
  - `getFreeStream(match): FreeStream | null` — keyed by competition code and/or
    match id. Mostly `null`; seeded with a couple of real official examples so the
    player is demonstrably functional.

### Region (`hooks/useCountry.ts`)

- localStorage-backed (`90min:tv-country`). Default guessed from
  `navigator.language`, fallback `GB`. Returns `[country, setCountry]`.

### Player (`components/watch/StreamPlayer.tsx`)

- `'use client'`. Rendered inside a modal/lightbox.
- `youtube`: responsive iframe embed.
- `hls`: a `<video>` element. Native HLS on Safari; otherwise lazy
  `import('hls.js')` (only this component pulls the library in).
- On playback error: friendly message + external broadcaster link fallback.
- Adds `hls.js` to dependencies.

### Page & navigation

- `app/watch/page.tsx` → renders `<WatchFeed />` (mirrors `app/page.tsx`).
- `components/watch/WatchFeed.tsx` — `'use client'`. Uses `useMatches(today)` and
  `useCountry()`. Reuses `DateNav` and `groupByLeague`. Header contains the
  `CountryPicker`. Reuses loading / empty / error patterns from `HomeFeed`.
- `components/watch/WatchMatchRow.tsx` — match line (teams / score / time, styled
  like `MatchCard`) + broadcaster chips for the selected country; a green
  **Watch** button when `getFreeStream` returns a stream, opening `StreamPlayer`.
- `components/watch/CountryPicker.tsx` — dropdown of `COUNTRIES`.
- Navigation: add **"Watch"** (Tv icon) to `BottomNav` (5 tabs) and to `TopNav`
  desktop links.

## Data flow

1. `WatchFeed` fetches today's matches via existing `useMatches` (SWR, 30s poll).
2. `useCountry` provides the selected country.
3. For each match: `getWatchOptions(match.competition.code, country.code)` →
   broadcaster chips; `getFreeStream(match)` → optional Watch button.
4. Clicking Watch opens `StreamPlayer` in a modal with the `FreeStream`.

## Error handling

- No matches on date → empty state (reuse HomeFeed pattern).
- No broadcaster data for competition/country → "Check local listings" text.
- HLS playback failure → message + external broadcaster link.
- Missing/invalid free stream → no Watch button (graceful absence).

## Testing

- `getWatchOptions`: correct broadcasters per country; `[]` fallback.
- `getFreeStream`: returns stream for seeded matches, `null` otherwise.
- `useCountry`: default guess + persistence (where feasible in jsdom).
- Render smoke test for `WatchMatchRow` (mirrors `MatchCard.test.tsx`).

## Notes

- `AGENTS.md` references `node_modules/next/dist/docs/`; that path does not exist
  in this install (standard `next@14.2.35`). Normal App Router conventions apply.
