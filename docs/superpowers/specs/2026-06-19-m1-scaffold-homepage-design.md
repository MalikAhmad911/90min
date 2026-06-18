# M1 Design Spec — Project Scaffold + FotMob-Style Homepage
**Project:** 90 Min Tactics | **Date:** 2026-06-19 | **Author:** Malik Ahmad

---

## 1. Scope
Module 1 covers the full Next.js project scaffold, design system (tokens, components), global layout shell, and the FotMob-style live scores homepage — all with zero paid dependencies.

---

## 2. Tech Stack
- **Framework:** Next.js 14 App Router, TypeScript
- **Styling:** Tailwind CSS v3 with custom design tokens
- **UI Components:** shadcn/ui (customized — no default shadcn look)
- **Data:** football-data.org (free) + TheSportsDB (free) + OpenLigaDB (free)
- **State:** React Context for favorites/dark mode; SWR for data fetching + polling
- **Hosting:** Vercel (free tier)
- **No paid APIs, no paid services**

---

## 3. Brand & Design Tokens

### Colors
| Token | Value | Use |
|---|---|---|
| `--bg-primary` | `#0A0A0A` | Main background (near-black) |
| `--bg-surface` | `#141414` | Cards, nav, sidebar |
| `--bg-elevated` | `#1E1E1E` | Hover states, active tabs |
| `--accent-green` | `#39FF14` | Neon green — CTAs, live badges, active states |
| `--accent-green-dim` | `#22C55E` | Secondary green |
| `--text-primary` | `#FFFFFF` | Headings, scores |
| `--text-secondary` | `#A3A3A3` | Subtext, team names |
| `--text-muted` | `#525252` | Timestamps, metadata |
| `--border` | `#262626` | Card borders, dividers |
| `--live-red` | `#EF4444` | Red cards, danger |
| `--live-pulse` | `#39FF14` | Animated live dot |

### Typography
- **Font:** Inter (Google Fonts, free) — already Vercel optimized
- **Score numbers:** `font-bold text-2xl` (white)
- **Team names:** `font-medium text-sm` (secondary)
- **League headers:** `font-semibold text-xs uppercase tracking-widest` (muted)
- **Live badge:** `font-bold text-xs` (green)

---

## 4. Layout Architecture

### Desktop (≥1024px)
```
┌─────────────────────────────────────────────────┐
│  TOPNAV: Logo | Matches Leagues News | Search   │
├──────────────┬──────────────────────────────────┤
│  LEFT SIDEBAR│  MAIN FEED (league-grouped cards)│
│  (leagues,   │                                  │
│   favorites) │                                  │
│              │                                  │
└──────────────┴──────────────────────────────────┘
│  FOOTER                                         │
```

### Mobile (< 1024px)
```
┌──────────────────────┐
│  TOPNAV: Logo Search │
├──────────────────────┤
│  DATE STRIP (scroll) │
├──────────────────────┤
│  MATCH CARDS FEED    │
│  (league-grouped)    │
│                      │
│                      │
├──────────────────────┤
│ BOTTOM NAV           │
│ Scores|Leagues|⭐|More│
└──────────────────────┘
```

---

## 5. Component Inventory

### Global
- `<TopNav>` — logo (90 Min Tactics SVG), nav links, search icon, dark/light toggle
- `<BottomNav>` — mobile only: Scores · Leagues · Following · More
- `<Sidebar>` — desktop only: top leagues list, followed teams
- `<DateStrip>` — horizontal scroll, selectable dates (yesterday/today/tomorrow)
- `<ThemeProvider>` — dark/light context, system default

### Home Feed
- `<LeagueGroup>` — header with league logo + name, contains match cards
- `<MatchCard>` — core component (see anatomy below)
- `<LiveBadge>` — animated green dot + "LIVE" text + minute
- `<SkeletonMatchCard>` — loading state, zero layout shift
- `<EmptyFeed>` — "No matches today" state

### Match Card Anatomy (FotMob-style)
```
┌────────────────────────────────────────┐
│ [HomeCrest]  Home Team    1 - 0  45'  │
│              Away Team    [AwayCrest] │
│              ⚽ Salah 23'             │
└────────────────────────────────────────┘
```
- Live score pulses green when updated
- Goal scorer line appears below score
- Status: `NS` (not started, shows kickoff time) | `LIVE` (green) | `FT` (muted)

---

## 6. Data Flow (Zero Budget)

### API Endpoints Used
1. `football-data.org/v4/matches?dateFrom=X&dateTo=X` — today's matches
2. `thesportsdb.com/api/v1/json/3/searchteams.php?t=TeamName` — team crests
3. Cache all responses in `Map` (in-memory) or `localStorage` for images

### Polling Strategy
- SWR with `refreshInterval: 30000` (30 seconds) on home feed during match windows
- No polling between midnight–6am
- `stale-while-revalidate` — user always sees data instantly, refresh in background

### API Key
- `FOOTBALL_DATA_API_KEY` in `.env.local` (free key from football-data.org)
- TheSportsDB: no key needed

---

## 7. Pages in M1

| Route | Component | Data |
|---|---|---|
| `/` | Home feed | Today's matches, all leagues |
| `/layout.tsx` | Root layout | TopNav + BottomNav + Sidebar |

---

## 8. Dark / Light Mode
- Default: **dark** (matches brand)
- Toggle in TopNav, persisted to `localStorage`
- Tailwind `dark:` classes throughout
- Light mode: white bg, dark text, green accents remain

---

## 9. Performance Requirements
- LCP < 1.2s on home page
- Skeleton loaders on every data section
- next/image for all crests (auto-optimize)
- No CLS — fixed card heights

---

## 10. Out of Scope for M1
- Match detail page (M3)
- League tables (M4)
- Search (M5)
- Push notifications (M6)
- Auth/accounts (Phase 2)
