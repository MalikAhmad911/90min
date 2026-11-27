import type { Message } from '../types'

/**
 * English - the source dictionary.
 *
 * Every other language is type-checked against these keys (see `types.ts`),
 * so adding a key here is a compile error in `ur.ts` until it is translated.
 *
 * Conventions:
 * - Flat dotted keys grouped by screen, so `README.md` can map each component
 *   to the prefix it should use.
 * - `{name}` placeholders. Numbers passed as vars are formatted with Latin
 *   digits for the active locale (see `format.ts`).
 * - Plural messages are objects keyed by Intl.PluralRules category and are
 *   selected by the `count` var.
 * - Brand names (90 Min Tactics, football-data.org, YouTube) and score/minute
 *   notation are not dictionary entries.
 */
export const en = {
  // ── App shell ──────────────────────────────────────────────────────────
  'app.name': '90 Min Tactics',
  'app.tagline': 'Live Football Scores',
  'app.description': 'Real-time football scores, lineups, tables and stats.',
  'app.logoAlt': '90 Min Tactics',

  // ── Navigation (TopNav, BottomNav, sidebars) ──────────────────────────
  'nav.scores': 'Scores',
  'nav.leagues': 'Leagues',
  'nav.watch': 'Watch',
  'nav.following': 'Following',
  'nav.more': 'More',
  'nav.news': 'News',
  'nav.transfers': 'Transfers',
  'nav.about': 'About',
  'nav.settings': 'Settings',
  'nav.search': 'Search',
  'nav.primary': 'Main navigation',
  'nav.topLeagues': 'Top leagues',
  'nav.allLeagues': 'All leagues',

  // ── Shared words ──────────────────────────────────────────────────────
  'common.loading': 'Loading…',
  'common.error': 'Something went wrong',
  'common.retry': 'Try again',
  'common.backToScores': 'Back to scores',
  'common.close': 'Close',
  'common.save': 'Save',
  'common.saved': 'Saved',
  'common.remove': 'Remove',
  'common.add': 'Add',
  'common.on': 'On',
  'common.off': 'Off',
  'common.networkError': 'Network error',
  'common.comingSoon': 'Coming soon',
  'common.vs': '{home} vs {away}',
  'common.matchCount': { one: '{count} match', other: '{count} matches' },

  // ── Dates (DateNav, DateStrip, EmptyDay) ──────────────────────────────
  'date.today': 'Today',
  'date.yesterday': 'Yesterday',
  'date.tomorrow': 'Tomorrow',
  'date.previousDay': 'Previous day',
  'date.nextDay': 'Next day',
  'date.pickDate': 'Choose a date',

  // ── Match status badges ───────────────────────────────────────────────
  'status.live': 'LIVE',
  'status.ftShort': 'FT',
  'status.htShort': 'HT',
  'status.cancelledShort': 'CANC',
  'status.postponedShort': 'PPD',
  'status.fullTime': 'Full time',
  'status.halfTime': 'Half time',
  'status.postponed': 'Postponed',
  'status.cancelled': 'Cancelled',
  'status.minuteLabel': 'Minute {minute}',

  // ── Home feed (HomeFeed, EmptyDay, LeagueGroup) ───────────────────────
  'home.filter.ongoing': 'Ongoing',
  'home.filter.finished': 'Finished',
  'home.filter.byTime': 'By time',
  'home.filter.button': 'Filter',
  'home.filter.label': 'Filter matches',
  'home.liveCount': { one: '{count} live match', other: '{count} live matches' },
  'home.loadError': 'Could not load matches',
  'home.empty.title': 'No matches on this date',
  'home.empty.body':
    'Domestic leagues pause during international breaks, and national-team fixtures are not covered here. Weekends are usually busy.',
  'home.empty.filtered.ongoing': 'No ongoing matches',
  'home.empty.filtered.finished': 'No finished matches',
  'home.empty.filtered.byTime': 'No upcoming matches',
  'home.empty.filteredHint': 'There are matches on this date — clear the filter to see them.',
  'home.group.toggle': 'Show or hide {competition}',

  // ── Match centre (MatchDetailView) ────────────────────────────────────
  'match.tab.summary': 'Summary',
  'match.tab.lineups': 'Lineups',
  'match.tab.stats': 'Stats',
  'match.tab.h2h': 'H2H',
  'match.tabs': 'Match sections',
  'match.matchday': 'Matchday {matchday}',
  'match.halfTimeScore': 'HT {score}',
  'match.loadError': 'Could not load this match',
  'match.notFound': 'Match not found',
  'match.noH2H': 'No previous meetings available.',
  'match.venue': 'Venue',
  'match.attendance': 'Attendance',
  'match.referee': 'Referee',

  // ── Match events (MatchEvents) ────────────────────────────────────────
  'events.empty.played': 'No match events available',
  'events.empty.notStarted': 'Not kicked off yet',
  'events.empty.playedHint':
    'Goals, cards and substitutions are not included on the current data plan. The score above is live.',
  'events.empty.notStartedHint': 'Goals, cards and substitutions will appear here once the match begins.',
  'events.assist': 'assist: {name}',
  'events.subOut': 'out: {name}',
  'events.goal': 'Goal',
  'events.penalty': 'penalty',
  'events.ownGoal': 'own goal',
  'events.yellowCard': 'Yellow card',
  'events.redCard': 'Red card',
  'events.secondYellow': 'Second yellow card',
  'events.substitution': 'Substitution',

  // ── Lineups (MatchLineups) ────────────────────────────────────────────
  'lineups.startingXI': 'Starting XI',
  'lineups.bench': 'Bench',
  'lineups.coach': 'Coach',
  'lineups.notPublished': 'Lineup not published.',
  'lineups.unavailable': 'Lineups not available',
  'lineups.unavailableHint':
    'They usually appear about an hour before kickoff, and not every competition publishes them on this plan.',

  // ── Match statistics (MatchStats) ─────────────────────────────────────
  'stats.possession': 'Possession',
  'stats.shots': 'Shots',
  'stats.shotsOnTarget': 'Shots on target',
  'stats.shotsOffTarget': 'Shots off target',
  'stats.corners': 'Corners',
  'stats.offsides': 'Offsides',
  'stats.fouls': 'Fouls',
  'stats.saves': 'Saves',
  'stats.yellowCards': 'Yellow cards',
  'stats.redCards': 'Red cards',
  'stats.empty': 'No statistics available',
  'stats.emptyHint': 'Match statistics are not published for every competition on this plan.',

  // ── Leagues list and league page (LeaguesPage, LeagueView) ────────────
  'leagues.title': 'Leagues',
  'leagues.subtitle': 'Tables, fixtures and top scorers',
  'leagues.metaDescription': 'League tables, fixtures and top scorers.',
  'league.fallbackTitle': 'League',
  'league.tab.table': 'Table',
  'league.tab.scorers': 'Top scorers',
  'league.table.loadError': 'Could not load the table',
  'league.table.empty': 'No table available',
  'league.table.emptyHint': 'Knockout rounds and some cups have no league table.',
  'league.scorers.loadError': 'Could not load top scorers',
  'league.scorers.empty': 'No scorer data',
  'league.scorers.emptyHint': 'Top scorers are not published for every competition on this plan.',

  // ── Standings table columns (StandingsTable, RightSidebar) ────────────
  'table.col.position': '#',
  'table.col.team': 'Team',
  'table.col.player': 'Player',
  'table.col.played': 'PL',
  'table.col.won': 'W',
  'table.col.drawn': 'D',
  'table.col.lost': 'L',
  'table.col.goalDifference': 'GD',
  'table.col.points': 'PTS',
  'table.col.form': 'Form',
  'table.col.goals': 'G',
  'table.col.assists': 'A',
  // Long forms for <abbr title> / aria-label on the abbreviated headers.
  'table.col.playedFull': 'Played',
  'table.col.wonFull': 'Won',
  'table.col.drawnFull': 'Drawn',
  'table.col.lostFull': 'Lost',
  'table.col.goalDifferenceFull': 'Goal difference',
  'table.col.pointsFull': 'Points',
  'table.col.goalsFull': 'Goals',
  'table.col.assistsFull': 'Assists',
  // Form pips and team results: one letter each.
  'table.form.win': 'W',
  'table.form.draw': 'D',
  'table.form.loss': 'L',

  // ── Right sidebar widgets ─────────────────────────────────────────────
  'sidebar.competition': 'Competition',
  'sidebar.table': 'Table',
  'sidebar.fullTable': 'Full table',
  'sidebar.topScorers': 'Top scorers',
  'sidebar.tableUnavailable': 'Table unavailable right now.',
  'sidebar.noTable': 'No table for this competition.',
  'sidebar.noScorers': 'No scorer data available.',

  // ── Team page (TeamView) ──────────────────────────────────────────────
  'team.fallbackTitle': 'Team',
  'team.tab.matches': 'Matches',
  'team.tab.squad': 'Squad',
  'team.fixtures': 'Fixtures',
  'team.results': 'Results',
  'team.founded': 'Est. {year}',
  'team.homeShort': 'H',
  'team.awayShort': 'A',
  'team.home': 'Home',
  'team.away': 'Away',
  'team.loadError': 'Could not load this team',
  'team.notFound': 'Team not found',
  'team.noMatches': 'No matches found',
  'team.noMatchesHint': 'This team may play in a competition outside the free plan.',
  'team.squadUnavailable': 'Squad unavailable',
  'team.squadUnavailableHint': 'Squad lists are not published for every team on this plan.',

  // ── Watch page (WatchFeed, WatchMatchRow, LiveTV, StreamPlayer) ───────
  'watch.whereToWatch': 'Where to watch',
  'watch.liveTv': 'Live TV',
  'watch.watchButton': 'Watch',
  'watch.checkListings': 'Check local listings',
  'watch.selectCountry': 'Select country',
  'watch.playerLabel': 'Watch {title}',
  'watch.closePlayer': 'Close player',
  'watch.streamUnavailable': 'Stream unavailable',
  'watch.streamUnavailableHint': 'This feed could not be played. Try a broadcaster listed below.',
  'watch.opensInNewTab': '{name} (opens in a new tab)',

  // ── Countries (Watch country picker) ──────────────────────────────────
  'country.GB': 'United Kingdom',
  'country.US': 'United States',
  'country.IN': 'India',
  'country.PK': 'Pakistan',

  // ── Competition regions (lib/competitions.ts `country`) ───────────────
  'region.World': 'World',
  'region.Europe': 'Europe',
  'region.England': 'England',
  'region.Spain': 'Spain',
  'region.Germany': 'Germany',
  'region.Italy': 'Italy',
  'region.France': 'France',
  'region.Netherlands': 'Netherlands',
  'region.Portugal': 'Portugal',
  'region.Brazil': 'Brazil',

  // ── Competition names (by football-data code) ─────────────────────────
  'competition.WC': 'FIFA World Cup',
  'competition.EC': 'European Championship',
  'competition.CL': 'UEFA Champions League',
  'competition.EL': 'UEFA Europa League',
  'competition.PL': 'Premier League',
  'competition.ELC': 'Championship',
  'competition.PD': 'La Liga',
  'competition.BL1': 'Bundesliga',
  'competition.SA': 'Serie A',
  'competition.FL1': 'Ligue 1',
  'competition.DED': 'Eredivisie',
  'competition.PPL': 'Primeira Liga',
  'competition.BSA': 'Brasileirão Série A',
  'competitionShort.WC': 'World Cup',
  'competitionShort.EC': 'Euros',
  'competitionShort.CL': 'Champions League',
  'competitionShort.BSA': 'Brasileirão',

  // ── Placeholder pages ─────────────────────────────────────────────────
  'following.title': 'Following',
  'following.body': 'Follow your favourite teams and leagues — coming soon.',
  'news.title': 'News',
  'news.body': 'News from around the game — coming soon.',
  'transfers.title': 'Transfers',
  'transfers.body': 'Transfer news — coming soon.',

  // ── Page titles (metadata) ────────────────────────────────────────────
  'meta.matchCentre': 'Match centre',
  'meta.titleTemplate': '{page} | 90 Min Tactics',

  // ── Login (app/login) ─────────────────────────────────────────────────
  'login.title': 'Admin sign in',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in…',
  'login.failed': 'Login failed',

  // ── Admin (stream manager; staff-facing) ──────────────────────────────
  'admin.title': 'Stream manager',
  'admin.signedInAs': 'Signed in as {username}. Add official/legal streams per match or per competition.',
  'admin.signOut': 'Sign out',
  'admin.competitionDefaults': 'Competition defaults',
  'admin.competitionDefaultsHint':
    'Applies to every match in that league (unless a match has its own stream below).',
  'admin.perMatch': 'Per-match streams',
  'admin.loadingMatches': 'Loading matches…',
  'admin.noMatches':
    'No matches on this date — use the arrows above to pick another day, or set a competition default.',
  'admin.channels.title': 'Live TV channels',
  'admin.channels.hint': 'Standalone streams that play directly on the Watch page — no match needed.',
  'admin.channels.empty': 'No channels yet — add one below.',
  'admin.channels.namePlaceholder': 'Channel name',
  'admin.channels.required': 'Name and link are required',
  'admin.channels.remove': 'Remove {name}',
  'admin.channels.failed': 'Failed',
  'admin.stream.idPlaceholder': 'YouTube video ID',
  'admin.stream.labelPlaceholder': 'Label (optional)',
  'admin.stream.required': 'Stream URL / ID required',
  'admin.stream.saveFailed': 'Save failed',
  'admin.stream.defaultTitleYoutube': 'Live stream',
  'admin.stream.defaultTitle': 'Stream',

  // ── Settings (app/more, components/settings) ──────────────────────────
  'settings.title': 'Settings',
  'settings.subtitle': 'Language, time and data preferences',
  'settings.loading': 'Loading your settings…',

  'settings.language.title': 'Language',
  'settings.language.hint': 'The page reloads so the whole app switches language and reading direction.',
  'settings.language.applying': 'Switching language…',
  'settings.language.error': 'Could not save your language. Check that cookies are allowed for this site.',

  'settings.timeZone.title': 'Time zone',
  'settings.timeZone.hint': 'Kickoff times and “Today” follow this time zone.',
  'settings.timeZone.label': 'Choose a time zone',
  'settings.timeZone.automatic': 'Automatic ({zone})',
  'settings.timeZone.detected': 'Detected from this device: {zone}',
  'settings.timeZone.now': 'Time there now: {time}',
  'settings.storageError': 'Could not save — your browser is blocking site storage.',

  'settings.timeFormat.title': 'Time format',
  'settings.timeFormat.h24': '24-hour',
  'settings.timeFormat.h12': '12-hour',
  'settings.timeFormat.example': 'e.g. {time}',

  'settings.lite.title': 'Lite mode',
  'settings.lite.hint': 'Hides club crests and images to save data on slow networks.',
  'settings.lite.auto': 'On automatically because your connection is slow or Data Saver is on.',
  'settings.lite.useAutomatic': 'Use automatic',

  'settings.notifications.title': 'Notifications',
  'settings.notifications.placeholder': 'Goal and kickoff alerts are coming soon.',

  'settings.about.title': 'About',
  'settings.about.dataSources': 'Data sources',
  'settings.about.footballData': 'Fixtures, results, tables and top scorers',
  'settings.about.openLigaDb': 'German league data, licensed under ODbL 1.0',
  'settings.about.theSportsDb': 'Team badges and artwork',
  'settings.about.wikidata': 'Names and facts, public domain (CC0)',
  'settings.about.disclaimer':
    'Scores can be delayed. 90 Min Tactics is not affiliated with any league, club or broadcaster.',
  'settings.about.externalLink': '{name} (opens in a new tab)',
} satisfies Record<string, Message>
