# i18n: English + Urdu (RTL)

A small i18n layer with no library, built on Intl. English is the source dictionary. Urdu (`ur`, `ur-PK`, right-to-left) is type-checked against it.

| File | Role |
| --- | --- |
| `config.ts` | Locales, `LOCALE_COOKIE` (`90min-locale`), the allow-list (`resolveLocale`), cookie builder and parser |
| `dictionaries/en.ts`, `ur.ts` | Messages. `ur` is typed `Dictionary`, so a missing or extra key fails `tsc` |
| `translate.ts` | `createTranslator(locale)` returns `t(key, vars)`: `{name}` interpolation, plurals via `Intl.PluralRules` on `vars.count`, fallback to English, and `''` (never the raw key) in production |
| `server.ts` | `getLocale()`, `getT()`, `getHtmlAttributes()` (reads the cookie through `next/headers`) |
| `client.tsx` | `<LocaleProvider>`, `useT()`, `useLocale()`, `useTimeFormat()`, `useFormat()`, `persistLocale()` |
| `format.ts` | `formatNumber/Date/Time/Kickoff/Score/Minute/DayLabel`, `ltrIsolate` |
| `names.ts` | Localised competition, region and country names, with the provider's text as the fallback |
| `time-format.ts`, `preference-store.ts` | The 12h/24h preference (localStorage, synced across tabs) |

**Digits.** Every formatter forces `numberingSystem: 'latn'`. Pakistani sports media print scores and times in Latin digits, and `ur-IN` and older engines would otherwise switch to ۰۱۲.

**Team and player names** stay as the provider sends them. The planned source is Wikidata's Urdu labels (CC0). See `names.ts`.

## Wiring (integrator)

1. **`app/layout.tsx`**:
   ```tsx
   import { getLocale, getT } from '@/lib/i18n/server'
   import { getDirection } from '@/lib/i18n/config'
   import { LocaleProvider } from '@/lib/i18n/client'

   export function generateMetadata() {            // replaces the static `metadata`
     const t = getT()
     return { title: `${t('app.name')} — ${t('app.tagline')}`, description: t('app.description') }
   }

   export default function RootLayout({ children }) {
     const locale = getLocale()
     return (
       <html lang={locale} dir={getDirection(locale)} suppressHydrationWarning>
         <body …>
           <ThemeProvider>
             <LocaleProvider locale={locale}>
               {/* TopNav, sidebars, main, BottomNav, all unchanged */}
             </LocaleProvider>
           </ThemeProvider>
         </body>
       </html>
     )
   }
   ```
   `LocaleProvider` goes inside `ThemeProvider` and wraps everything that renders text, the navs included. Reading the cookie makes every route dynamic, including `generateStaticParams` league pages. If static output matters more, have middleware rewrite to a `[locale]` segment instead.
2. **Urdu font.** Inter has no Urdu glyphs. Load `Noto Nastaliq Urdu` (or Noto Naskh Arabic, which is more compact) with `next/font/google` and apply it when `dir="rtl"`. Nastaliq needs a taller line-height (about 1.8 to 2).
3. **`app/more/page.tsx`** wraps itself in a `LocaleProvider` with `lang` and `dir`, so it works before step 1. Those become redundant afterwards but do no harm. Relabel the nav links to `/more`: TopNav says "About" and BottomNav says "More". Use `nav.settings`.
4. **Notifications.** Replace the `data-slot="notifications"` placeholder in `components/settings/SettingsView.tsx` with the notifications toggle.
5. **Lite mode.** Done: `components/ui/Crest.tsx` (so every crest, TeamCrest included) and `PlayerPhoto` render their initials fallback when `useLiteMode().enabled`, and SWR polling runs at half rate (`litePollInterval`).
6. **Time.** Done: kick-off times go through `useKickoffTime()` (`hooks/useKickoffTime.ts`), which applies the time zone and the 12h/24h choice with or without a `LocaleProvider`, and picks up the locale once the provider is mounted.

### Order of operations
1. Merge the other branches first. The codemod rewrites their className strings, so run it last to avoid conflicts.
2. Run `node scripts/rtl-logical-classes.mjs --dry-run components app` and read the diff, then run it again with `--write`.
3. Fix the "manual review" items (below) and add `dir="ltr"` to the exceptions.
4. Swap literals for `t()` per the map below. Then wire the layout (step 1 above).

## RTL: what must NOT mirror

These are football conventions. Put `dir="ltr"` on the element itself. Do not use `rtl:` overrides.

- **Scorelines** ("2 – 1"): `MatchCard` `CenterDisplay`, `WatchMatchRow` `CenterDisplay`, the `MatchDetailView` score and HT line, `H2HRow`, and `TeamView` `MatchRow`. In running text, use `formatScore()` (LTR-isolated).
- **Kickoff times and minutes** (`20:45`, `45+2'`): use `formatKickoff()` / `formatMinute()`. Otherwise RTL renders `'45`.
- **The home-left / away-right row order**: the outer flex row of `MatchCard`, `WatchMatchRow`, `H2HRow`, the `MatchDetailView` scoreline, `MatchEvents` `EventRow` (home events on the left) and `MatchStats` (home value on the left, home bar first). Put `dir="ltr"` on the row and `dir="auto"` on the team-name spans, so an Urdu label still shapes correctly.
- **Directional icons** (ChevronLeft/Right in DateNav, ArrowLeft back links) *should* flip. Add `rtl:-scale-x-100`. Prev and next swap sides automatically once `dir="rtl"` is set.
- **Short Urdu labels are wider.** `team.homeShort` and `team.awayShort` are "ہوم" and "اوے". The `w-5` column in TeamView needs `w-8`, and the `w-7` status column in MatchCard needs about `w-9` for "وقفہ".

## Codemod dry-run on the current tree (master @ 305667c)

`Would rewrite 27 class(es) in 16 of 64 file(s).`

| Count | Change |
| --- | --- |
| 6 | `text-right` → `text-end` |
| 3 | `text-left` → `text-start` |
| 3 | `border-r` → `border-e` |
| 3 | `-ml-1` → `-ms-1` |
| 2 | `ml-auto` → `ms-auto` |
| 2 | `left-0` → `start-0` |
| 2 | `right-0` → `end-0` |
| 2 | `pl-2` → `ps-2` |
| 1 each | `ml-0.5` → `ms-0.5`, `ml-1` → `ms-1`, `pr-6` → `pe-6`, `pr-2.5` → `pe-2.5` |

Files: HomeFeed (2), LeagueGroup (1), MatchCard (1), BottomNav (2), Sidebar (1), TopNav (4), LeagueView (1), StandingsTable (1), MatchDetailView (2), MatchEvents (2), MatchLineups (1), TeamView (1), CountryPicker (2), LiveTV (1), WatchMatchRow (3), app/layout.tsx (2).

Left for manual review:
- `BottomNav.tsx`: `left-1/2 -translate-x-1/2` centres the active indicator. Keep it physical.
- `MatchLineups.tsx`: `sm:divide-x`. Add `rtl:divide-x-reverse`.

Three changes are cosmetic because the element will carry `dir="ltr"`: MatchCard and WatchMatchRow `text-right`, and the MatchEvents `text-right`/`text-left` alignment.

## Component → key map

| File | Keys |
| --- | --- |
| `app/layout.tsx` | `app.name`, `app.tagline`, `app.description` |
| `components/layout/TopNav.tsx` | `app.logoAlt`, `nav.search`, `nav.watch`, `nav.news`, `nav.transfers`, `nav.settings` (the /more link and the gear `aria-label`) |
| `components/layout/BottomNav.tsx` | `nav.scores`, `nav.leagues`, `nav.watch`, `nav.following`, `nav.more`, `nav.primary` |
| `components/layout/LeftSidebar.tsx`, `Sidebar.tsx` | `nav.topLeagues`, `nav.allLeagues`, `competitionShortName()` |
| `components/layout/RightSidebar.tsx` | `sidebar.*`, `table.col.{position,team,played,goalDifference,points}` |
| `components/home/DateNav.tsx`, `DateStrip.tsx` | `date.*`, with `formatDayLabel()` for the label |
| `components/home/HomeFeed.tsx` | `home.filter.*`, `home.liveCount`, `home.loadError` |
| `components/home/EmptyDay.tsx` | `home.empty.*`, `date.today`, `date.tomorrow`, `formatDate(…,'weekdayDayMonth')` |
| `components/home/LeagueGroup.tsx` | `home.group.toggle`, `competitionName()` |
| `components/home/LiveBadge.tsx`, `MatchCard.tsx` | `status.live`, `status.ftShort`, `status.htShort`, `formatMinute()`, `formatScore()`, `formatKickoff()` |
| `components/match/MatchDetailView.tsx` | `match.*`, `status.fullTime/postponed/cancelled/htShort`, `common.backToScores`, `formatDate(…,'dayMonthYear')`, `formatNumber()` for attendance |
| `components/match/MatchEvents.tsx` | `events.*` |
| `components/match/MatchLineups.tsx` | `lineups.*` |
| `components/match/MatchStats.tsx` | `stats.*` |
| `app/leagues/page.tsx` | `leagues.title`, `leagues.subtitle`, `leagues.metaDescription`, `regionName()` |
| `app/leagues/[id]/page.tsx` | `league.fallbackTitle`, `meta.titleTemplate`, `competitionName()` |
| `components/league/LeagueView.tsx` | `league.tab.*`, `league.table.*`, `league.scorers.*`, `table.col.{player,goals,assists}`, `nav.allLeagues` |
| `components/league/StandingsTable.tsx` | `table.col.*` (short in the header, `*Full` as `<abbr title>`), `table.form.*` |
| `components/team/TeamView.tsx`, `app/team/[id]` | `team.*`, `table.form.*` (W/D/L), `common.backToScores`, `formatDate(…,'dayMonth')` |
| `app/match/[id]/page.tsx` | `meta.matchCentre`, `meta.titleTemplate` |
| `components/watch/WatchFeed.tsx` | `watch.whereToWatch`, `home.loadError`, `home.empty.title` |
| `components/watch/WatchMatchRow.tsx` | `watch.watchButton`, `watch.checkListings`, `watch.opensInNewTab`, `common.vs` |
| `components/watch/LiveTV.tsx` | `watch.liveTv` |
| `components/watch/StreamPlayer.tsx` | `watch.playerLabel`, `watch.closePlayer`, `watch.streamUnavailable*` |
| `components/watch/CountryPicker.tsx` | `watch.selectCountry`, `countryName()` |
| `app/following`, `app/news`, `app/transfers` | `following.*`, `news.*`, `transfers.*` (the internal "M4/M5" milestone codes are dropped on purpose) |
| `app/login/page.tsx` | `login.*`, `common.networkError` |
| `components/admin/*` | `admin.*`, `common.save/saved/remove/add/networkError` |
| `components/settings/*` | `settings.*` (already wired) |
