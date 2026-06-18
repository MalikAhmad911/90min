# 90 Min Tactics — M1 Scaffold + FotMob Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a Next.js 14 App Router project with custom design tokens (black + neon green), root layout shell, and a FotMob-style live scores homepage using only free APIs.

**Architecture:** Next.js 14 App Router fetches today's matches from football-data.org via a server-side Route Handler (caching responses to avoid hitting rate limits); the home page uses SWR to poll the internal API route every 30 seconds; all components use Tailwind CSS custom tokens matching the 90 Min Tactics brand.

**Tech Stack:** Next.js 14 App Router · TypeScript · Tailwind CSS v3 · shadcn/ui · SWR · football-data.org (free) · Vitest + @testing-library/react

## Global Constraints

- Node ≥ 18; Next.js = 14.x; TypeScript strict mode
- No paid APIs — only football-data.org (free key) + TheSportsDB (no key)
- Brand colors: bg-primary `#0A0A0A`, accent-green `#39FF14`, text-primary `#FFFFFF`
- All components mobile-first; BottomNav visible only on mobile (< lg)
- Dark mode is default; light mode available via toggle
- No placeholder code — every step ships working, testable software

---

## File Map

```
.                                      ← project root (existing dir)
├── app/
│   ├── layout.tsx                     ← root layout: ThemeProvider + TopNav + BottomNav
│   ├── page.tsx                       ← home: DateStrip + league-grouped feed
│   ├── globals.css                    ← CSS variables + base styles
│   └── api/
│       └── matches/
│           └── route.ts               ← GET handler: fetches + caches football-data.org
├── components/
│   ├── layout/
│   │   ├── TopNav.tsx                 ← logo + nav links + search + theme toggle
│   │   ├── BottomNav.tsx              ← mobile-only 4-tab bar
│   │   └── Sidebar.tsx               ← desktop-only leagues list
│   ├── home/
│   │   ├── DateStrip.tsx              ← horizontal scrollable date selector
│   │   ├── LeagueGroup.tsx            ← league header + list of MatchCards
│   │   ├── MatchCard.tsx              ← core match card component
│   │   ├── LiveBadge.tsx              ← pulsing LIVE dot + minute
│   │   ├── SkeletonMatchCard.tsx      ← loading placeholder
│   │   └── HomeFeed.tsx               ← SWR polling + groups rendering
│   └── ui/
│       └── ThemeToggle.tsx            ← sun/moon icon toggle
├── lib/
│   ├── types.ts                       ← all shared TypeScript interfaces
│   ├── utils.ts                       ← formatTime, groupByLeague, getStatusLabel
│   └── api/
│       └── football-data.ts           ← typed fetch wrapper for football-data.org
├── providers/
│   └── ThemeProvider.tsx              ← next-themes wrapper
├── hooks/
│   └── useMatches.ts                  ← SWR hook hitting /api/matches
├── __tests__/
│   ├── lib/utils.test.ts
│   ├── components/MatchCard.test.tsx
│   └── components/LiveBadge.test.tsx
├── tailwind.config.ts
├── next.config.ts
├── vitest.config.ts
├── .env.local.example
└── package.json
```

---

## Task 1: Initialize Next.js 14 Project

**Files:**
- Create: `package.json`, `tailwind.config.ts`, `next.config.ts`, `globals.css`, `vitest.config.ts`, `.env.local.example`

**Interfaces:**
- Produces: running `npm run dev` shows default Next.js app; `npm test` runs vitest

- [ ] **Step 1: Scaffold Next.js in current directory**

Run inside `c:\Users\ranke\Downloads\90min-main\90min-main`:

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias="@/*" --yes
```

Expected: Files created — `app/`, `components/`, `public/`, `package.json`, `tailwind.config.ts`, `next.config.ts`. The existing `README.md` is preserved.

- [ ] **Step 2: Install additional dependencies**

```bash
npm install swr next-themes lucide-react
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom @types/testing-library__jest-dom
```

Expected: `package.json` updated, `node_modules` populated.

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

Create `vitest.setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Add test script to package.json**

Open `package.json` and add inside `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Configure Tailwind with brand tokens**

Replace `tailwind.config.ts` entirely:

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './providers/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0A0A0A',
          surface: '#141414',
          elevated: '#1E1E1E',
        },
        accent: {
          green: '#39FF14',
          'green-dim': '#22C55E',
        },
        content: {
          primary: '#FFFFFF',
          secondary: '#A3A3A3',
          muted: '#525252',
        },
        divider: '#262626',
        live: {
          red: '#EF4444',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'live-pulse': 'live-pulse 1.5s ease-in-out infinite',
        'score-pop': 'score-pop 0.4s ease-out',
      },
      keyframes: {
        'live-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        'score-pop': {
          '0%': { transform: 'scale(1.15)', color: '#39FF14' },
          '100%': { transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
```

- [ ] **Step 6: Update globals.css**

Replace `app/globals.css` entirely:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --font-inter: 'Inter', system-ui, sans-serif;
  }

  html {
    @apply bg-bg-primary text-content-primary;
  }

  * {
    @apply border-divider;
  }

  ::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  ::-webkit-scrollbar-track {
    @apply bg-bg-surface;
  }
  ::-webkit-scrollbar-thumb {
    @apply bg-bg-elevated rounded-full;
  }
}
```

- [ ] **Step 7: Update next.config.ts**

```typescript
import type { NextConfig } from 'next'

const config: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'crests.football-data.org' },
      { protocol: 'https', hostname: 'www.thesportsdb.com' },
      { protocol: 'https', hostname: 'media.api-sports.io' },
    ],
  },
}

export default config
```

- [ ] **Step 8: Create .env.local.example**

```bash
# football-data.org — get free key at https://www.football-data.org/client
FOOTBALL_DATA_API_KEY=your_key_here
```

Copy to `.env.local` and fill in your key:

```bash
cp .env.local.example .env.local
```

- [ ] **Step 9: Verify dev server starts**

```bash
npm run dev
```

Expected: `ready - started server on 0.0.0.0:3000`. Open http://localhost:3000 — Next.js default page loads.

- [ ] **Step 10: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold Next.js 14 with Tailwind brand tokens and Vitest"
```

---

## Task 2: TypeScript Types + Utility Functions

**Files:**
- Create: `lib/types.ts`
- Create: `lib/utils.ts`
- Create: `__tests__/lib/utils.test.ts`

**Interfaces:**
- Produces: `Match`, `GroupedMatches`, `MatchStatus` types; `groupByLeague(matches)`, `formatKickoffTime(utcDate)`, `getStatusLabel(status, minute)` functions

- [ ] **Step 1: Write failing tests for utility functions**

Create `__tests__/lib/utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { groupByLeague, formatKickoffTime, getStatusLabel } from '@/lib/utils'
import type { Match } from '@/lib/types'

const makeMatch = (overrides: Partial<Match> = {}): Match => ({
  id: 1,
  status: 'SCHEDULED',
  utcDate: '2026-06-19T15:00:00Z',
  minute: undefined,
  homeTeam: { id: 1, name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV', crest: 'https://crests.football-data.org/64.png' },
  awayTeam: { id: 2, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: 'https://crests.football-data.org/57.png' },
  score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
  competition: { id: 2021, name: 'Premier League', code: 'PL', emblem: 'https://crests.football-data.org/PL.png' },
  ...overrides,
})

describe('groupByLeague', () => {
  it('groups matches by competition id', () => {
    const matches = [
      makeMatch({ id: 1, competition: { id: 2021, name: 'Premier League', code: 'PL', emblem: 'pl.png' } }),
      makeMatch({ id: 2, competition: { id: 2021, name: 'Premier League', code: 'PL', emblem: 'pl.png' } }),
      makeMatch({ id: 3, competition: { id: 2014, name: 'La Liga', code: 'PD', emblem: 'pd.png' } }),
    ]
    const result = groupByLeague(matches)
    expect(result).toHaveLength(2)
    expect(result[0].competitionId).toBe(2021)
    expect(result[0].matches).toHaveLength(2)
    expect(result[1].competitionId).toBe(2014)
    expect(result[1].matches).toHaveLength(1)
  })

  it('returns empty array for empty input', () => {
    expect(groupByLeague([])).toEqual([])
  })
})

describe('getStatusLabel', () => {
  it('returns kickoff time for SCHEDULED', () => {
    const label = getStatusLabel('SCHEDULED', undefined, '2026-06-19T15:00:00Z')
    expect(label).toMatch(/^\d{1,2}:\d{2}/)
  })

  it('returns minute for IN_PLAY', () => {
    expect(getStatusLabel('IN_PLAY', 67, '2026-06-19T15:00:00Z')).toBe("67'")
  })

  it('returns HT for PAUSED', () => {
    expect(getStatusLabel('PAUSED', 45, '2026-06-19T15:00:00Z')).toBe('HT')
  })

  it('returns FT for FINISHED', () => {
    expect(getStatusLabel('FINISHED', undefined, '2026-06-19T15:00:00Z')).toBe('FT')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```

Expected: `FAIL __tests__/lib/utils.test.ts` — Cannot find module '@/lib/utils'

- [ ] **Step 3: Create lib/types.ts**

```typescript
export type MatchStatus =
  | 'SCHEDULED'
  | 'TIMED'
  | 'IN_PLAY'
  | 'PAUSED'
  | 'FINISHED'
  | 'CANCELLED'
  | 'POSTPONED'

export interface Team {
  id: number
  name: string
  shortName: string
  tla: string
  crest: string
}

export interface Score {
  home: number | null
  away: number | null
}

export interface Match {
  id: number
  status: MatchStatus
  utcDate: string
  minute?: number
  homeTeam: Team
  awayTeam: Team
  score: {
    fullTime: Score
    halfTime: Score
  }
  competition: {
    id: number
    name: string
    code: string
    emblem: string
  }
}

export interface GroupedMatches {
  competitionId: number
  competitionName: string
  competitionEmblem: string
  matches: Match[]
}

export interface MatchesApiResponse {
  matches: Match[]
  date: string
  error?: string
}
```

- [ ] **Step 4: Create lib/utils.ts**

```typescript
import type { Match, GroupedMatches, MatchStatus } from './types'

export function groupByLeague(matches: Match[]): GroupedMatches[] {
  const map = new Map<number, GroupedMatches>()

  for (const match of matches) {
    const { id, name, emblem } = match.competition
    if (!map.has(id)) {
      map.set(id, { competitionId: id, competitionName: name, competitionEmblem: emblem, matches: [] })
    }
    map.get(id)!.matches.push(match)
  }

  return Array.from(map.values())
}

export function formatKickoffTime(utcDate: string): string {
  return new Date(utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function getStatusLabel(status: MatchStatus, minute: number | undefined, utcDate: string): string {
  switch (status) {
    case 'IN_PLAY':
      return `${minute ?? '?'}'`
    case 'PAUSED':
      return 'HT'
    case 'FINISHED':
      return 'FT'
    case 'CANCELLED':
      return 'CANC'
    case 'POSTPONED':
      return 'PPD'
    default:
      return formatKickoffTime(utcDate)
  }
}

export function isLive(status: MatchStatus): boolean {
  return status === 'IN_PLAY' || status === 'PAUSED'
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function getDateRange(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return formatDate(d)
}
```

- [ ] **Step 5: Run tests — all must pass**

```bash
npm test
```

Expected: `PASS __tests__/lib/utils.test.ts` — 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/utils.ts __tests__/lib/utils.test.ts
git commit -m "feat: add shared types and utility functions"
```

---

## Task 3: football-data.org API Client + Route Handler

**Files:**
- Create: `lib/api/football-data.ts`
- Create: `app/api/matches/route.ts`

**Interfaces:**
- Consumes: `Match`, `MatchesApiResponse` from `@/lib/types`; `FOOTBALL_DATA_API_KEY` env var
- Produces: `GET /api/matches?date=YYYY-MM-DD` → `MatchesApiResponse`

- [ ] **Step 1: Create the football-data.org typed client**

Create `lib/api/football-data.ts`:

```typescript
import type { Match } from '@/lib/types'

const BASE = 'https://api.football-data.org/v4'

interface FDMatch {
  id: number
  utcDate: string
  status: string
  minute?: number
  homeTeam: { id: number; name: string; shortName: string; tla: string; crest: string }
  awayTeam: { id: number; name: string; shortName: string; tla: string; crest: string }
  score: {
    fullTime: { home: number | null; away: number | null }
    halfTime: { home: number | null; away: number | null }
  }
  competition: { id: number; name: string; code: string; emblem: string }
}

export async function fetchMatchesByDate(date: string): Promise<Match[]> {
  const key = process.env.FOOTBALL_DATA_API_KEY
  if (!key) throw new Error('FOOTBALL_DATA_API_KEY is not set')

  const res = await fetch(`${BASE}/matches?dateFrom=${date}&dateTo=${date}`, {
    headers: { 'X-Auth-Token': key },
    next: { revalidate: 30 },
  })

  if (!res.ok) {
    throw new Error(`football-data.org error: ${res.status} ${res.statusText}`)
  }

  const data: { matches: FDMatch[] } = await res.json()

  return data.matches.map((m) => ({
    id: m.id,
    utcDate: m.utcDate,
    status: m.status as Match['status'],
    minute: m.minute,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    score: m.score,
    competition: m.competition,
  }))
}
```

- [ ] **Step 2: Create the API route handler**

Create `app/api/matches/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { fetchMatchesByDate } from '@/lib/api/football-data'
import { formatDate } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? formatDate(new Date())

  try {
    const matches = await fetchMatchesByDate(date)
    return NextResponse.json({ matches, date }, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ matches: [], date, error: message }, { status: 500 })
  }
}
```

- [ ] **Step 3: Manually test the route**

With `npm run dev` running and `.env.local` containing your API key, open:

```
http://localhost:3000/api/matches
```

Expected: JSON response `{ "matches": [...], "date": "2026-06-19" }` with today's matches.

If you see `{ "error": "FOOTBALL_DATA_API_KEY is not set" }` — check `.env.local`.

- [ ] **Step 4: Commit**

```bash
git add lib/api/football-data.ts app/api/matches/route.ts
git commit -m "feat: add football-data.org client and /api/matches route handler"
```

---

## Task 4: ThemeProvider + Root Layout

**Files:**
- Create: `providers/ThemeProvider.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `next-themes`
- Produces: `<html>` with `dark` class by default; `useTheme()` available in all children

- [ ] **Step 1: Create ThemeProvider**

Create `providers/ThemeProvider.tsx`:

```typescript
'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ReactNode } from 'react'

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem>
      {children}
    </NextThemesProvider>
  )
}
```

- [ ] **Step 2: Update root layout**

Replace `app/layout.tsx`:

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/providers/ThemeProvider'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: '90 Min Tactics — Live Football Scores',
  description: 'Real-time football scores, lineups, tables and stats.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans bg-bg-primary text-content-primary antialiased`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Verify dark mode loads**

```bash
npm run dev
```

Open http://localhost:3000 — `<html>` element should have `class="dark"`.

- [ ] **Step 4: Commit**

```bash
git add providers/ThemeProvider.tsx app/layout.tsx
git commit -m "feat: add ThemeProvider with dark mode default"
```

---

## Task 5: TopNav Component

**Files:**
- Create: `components/layout/TopNav.tsx`
- Create: `components/ui/ThemeToggle.tsx`

**Interfaces:**
- Produces: `<TopNav />` — fixed top bar with logo + nav links + theme toggle

- [ ] **Step 1: Create ThemeToggle**

Create `components/ui/ThemeToggle.tsx`:

```typescript
'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="w-8 h-8" />

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-lg text-content-secondary hover:text-content-primary hover:bg-bg-elevated transition-colors"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
```

- [ ] **Step 2: Create TopNav**

Create `components/layout/TopNav.tsx`:

```typescript
import Link from 'next/link'
import { Search } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export function TopNav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-bg-surface border-b border-divider h-14">
      <div className="max-w-screen-xl mx-auto px-4 h-full flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="flex items-center">
            <span className="text-accent-green font-black text-2xl leading-none">90</span>
            <span className="text-content-primary font-black text-lg leading-none">MIN</span>
          </div>
          <span className="text-content-secondary font-semibold text-xs tracking-widest uppercase hidden sm:block">
            Tactics
          </span>
        </Link>

        {/* Nav links — hidden on mobile */}
        <nav className="hidden lg:flex items-center gap-1">
          {[
            { href: '/', label: 'Scores' },
            { href: '/leagues', label: 'Leagues' },
            { href: '/news', label: 'News' },
            { href: '/transfers', label: 'Transfers' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-content-secondary hover:text-content-primary hover:bg-bg-elevated transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-lg text-content-secondary hover:text-content-primary hover:bg-bg-elevated transition-colors" aria-label="Search">
            <Search size={18} />
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Add TopNav to root layout**

Modify `app/layout.tsx` — inside `<ThemeProvider>`, wrap children:

```typescript
import { TopNav } from '@/components/layout/TopNav'

// Inside return, replace {children} with:
<ThemeProvider>
  <TopNav />
  <main className="pt-14 min-h-screen">
    {children}
  </main>
</ThemeProvider>
```

- [ ] **Step 4: Verify TopNav renders**

```bash
npm run dev
```

Open http://localhost:3000. Should see: dark top bar, "90MIN Tactics" logo left, sun icon right.

- [ ] **Step 5: Commit**

```bash
git add components/layout/TopNav.tsx components/ui/ThemeToggle.tsx app/layout.tsx
git commit -m "feat: add TopNav with logo, nav links, and theme toggle"
```

---

## Task 6: BottomNav Component (Mobile)

**Files:**
- Create: `components/layout/BottomNav.tsx`

**Interfaces:**
- Produces: `<BottomNav />` — fixed bottom bar, `lg:hidden`

- [ ] **Step 1: Create BottomNav**

Create `components/layout/BottomNav.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, Trophy, Star, MoreHorizontal } from 'lucide-react'

const tabs = [
  { href: '/', label: 'Scores', Icon: Activity },
  { href: '/leagues', label: 'Leagues', Icon: Trophy },
  { href: '/following', label: 'Following', Icon: Star },
  { href: '/more', label: 'More', Icon: MoreHorizontal },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-surface border-t border-divider">
      <div className="flex items-stretch">
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                active ? 'text-accent-green' : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
              <span>{label}</span>
              {active && <span className="absolute bottom-0 w-8 h-0.5 bg-accent-green rounded-t-full" />}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Add BottomNav to root layout**

In `app/layout.tsx`, add `<BottomNav />` after `<main>`:

```typescript
import { BottomNav } from '@/components/layout/BottomNav'

// Inside ThemeProvider:
<TopNav />
<main className="pt-14 pb-16 lg:pb-0 min-h-screen">
  {children}
</main>
<BottomNav />
```

- [ ] **Step 3: Verify on mobile**

Open http://localhost:3000 and resize browser to < 1024px wide. Should see 4-tab bottom bar. Scores tab active with green color.

- [ ] **Step 4: Commit**

```bash
git add components/layout/BottomNav.tsx app/layout.tsx
git commit -m "feat: add mobile BottomNav with active route highlighting"
```

---

## Task 7: Sidebar Component (Desktop)

**Files:**
- Create: `components/layout/Sidebar.tsx`

**Interfaces:**
- Produces: `<Sidebar />` — fixed left panel on desktop with top leagues list

- [ ] **Step 1: Create Sidebar**

Create `components/layout/Sidebar.tsx`:

```typescript
import Link from 'next/link'

const TOP_LEAGUES = [
  { id: 2021, name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 2014, name: 'La Liga', flag: '🇪🇸' },
  { id: 2002, name: 'Bundesliga', flag: '🇩🇪' },
  { id: 2019, name: 'Serie A', flag: '🇮🇹' },
  { id: 2015, name: 'Ligue 1', flag: '🇫🇷' },
  { id: 2001, name: 'Champions League', flag: '🇪🇺' },
  { id: 2018, name: 'Europa League', flag: '🇪🇺' },
]

export function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-bg-surface border-r border-divider min-h-screen pt-4">
      <div className="px-3 mb-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-content-muted px-2 mb-1">
          Top Leagues
        </h2>
        <nav className="flex flex-col gap-0.5">
          {TOP_LEAGUES.map(({ id, name, flag }) => (
            <Link
              key={id}
              href={`/leagues/${id}`}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-content-secondary hover:text-content-primary hover:bg-bg-elevated transition-colors"
            >
              <span className="text-base leading-none">{flag}</span>
              <span className="truncate">{name}</span>
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Add Sidebar to root layout**

In `app/layout.tsx`, wrap `<main>` and `<Sidebar>` in a flex row:

```typescript
import { Sidebar } from '@/components/layout/Sidebar'

// Replace existing <main> block with:
<div className="flex min-h-[calc(100vh-3.5rem)]">
  <Sidebar />
  <main className="flex-1 pb-16 lg:pb-0">
    {children}
  </main>
</div>
```

Full updated `app/layout.tsx`:

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { TopNav } from '@/components/layout/TopNav'
import { BottomNav } from '@/components/layout/BottomNav'
import { Sidebar } from '@/components/layout/Sidebar'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: '90 Min Tactics — Live Football Scores',
  description: 'Real-time football scores, lineups, tables and stats.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans bg-bg-primary text-content-primary antialiased`}>
        <ThemeProvider>
          <TopNav />
          <div className="pt-14 flex min-h-[calc(100vh-3.5rem)]">
            <Sidebar />
            <main className="flex-1 pb-16 lg:pb-0">
              {children}
            </main>
          </div>
          <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Verify layout at 1280px wide**

Dev server should show: fixed top bar, left sidebar with leagues list, content area to the right. No bottom nav on desktop.

- [ ] **Step 4: Commit**

```bash
git add components/layout/Sidebar.tsx app/layout.tsx
git commit -m "feat: add desktop Sidebar with top leagues navigation"
```

---

## Task 8: DateStrip Component

**Files:**
- Create: `components/home/DateStrip.tsx`

**Interfaces:**
- Produces: `<DateStrip selectedDate onDateChange />` — horizontal scrollable date pills

- [ ] **Step 1: Create DateStrip**

Create `components/home/DateStrip.tsx`:

```typescript
'use client'

import { useCallback } from 'react'
import { formatDate, getDateRange } from '@/lib/utils'

interface DateStripProps {
  selectedDate: string
  onDateChange: (date: string) => void
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildDates(): { label: string; date: string }[] {
  const result = []
  for (let i = -3; i <= 3; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const date = formatDate(d)
    let label: string
    if (i === -1) label = 'Yesterday'
    else if (i === 0) label = 'Today'
    else if (i === 1) label = 'Tomorrow'
    else label = `${DAYS[d.getDay()]} ${d.getDate()}`
    result.push({ label, date })
  }
  return result
}

export function DateStrip({ selectedDate, onDateChange }: DateStripProps) {
  const dates = buildDates()

  return (
    <div className="flex gap-1 overflow-x-auto scrollbar-hide px-4 py-3 border-b border-divider">
      {dates.map(({ label, date }) => {
        const isSelected = date === selectedDate
        return (
          <button
            key={date}
            onClick={() => onDateChange(date)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              isSelected
                ? 'bg-accent-green text-bg-primary font-bold'
                : 'text-content-secondary hover:text-content-primary hover:bg-bg-elevated'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/home/DateStrip.tsx
git commit -m "feat: add DateStrip with 7-day horizontal scroll"
```

---

## Task 9: LiveBadge + MatchCard + SkeletonMatchCard

**Files:**
- Create: `components/home/LiveBadge.tsx`
- Create: `components/home/MatchCard.tsx`
- Create: `components/home/SkeletonMatchCard.tsx`
- Create: `__tests__/components/LiveBadge.test.tsx`
- Create: `__tests__/components/MatchCard.test.tsx`

**Interfaces:**
- Consumes: `Match` from `@/lib/types`; `getStatusLabel`, `isLive` from `@/lib/utils`
- Produces: `<LiveBadge minute />`, `<MatchCard match />`, `<SkeletonMatchCard />`

- [ ] **Step 1: Write failing tests**

Create `__tests__/components/LiveBadge.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LiveBadge } from '@/components/home/LiveBadge'

describe('LiveBadge', () => {
  it('renders minute when provided', () => {
    render(<LiveBadge minute={67} />)
    expect(screen.getByText("67'")).toBeInTheDocument()
  })

  it('renders LIVE text', () => {
    render(<LiveBadge minute={23} />)
    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })
})
```

Create `__tests__/components/MatchCard.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MatchCard } from '@/components/home/MatchCard'
import type { Match } from '@/lib/types'

const liveMatch: Match = {
  id: 1,
  status: 'IN_PLAY',
  utcDate: '2026-06-19T15:00:00Z',
  minute: 67,
  homeTeam: { id: 1, name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV', crest: 'https://crests.football-data.org/64.png' },
  awayTeam: { id: 2, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: 'https://crests.football-data.org/57.png' },
  score: { fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } },
  competition: { id: 2021, name: 'Premier League', code: 'PL', emblem: 'pl.png' },
}

describe('MatchCard', () => {
  it('renders both team names', () => {
    render(<MatchCard match={liveMatch} />)
    expect(screen.getByText('Liverpool')).toBeInTheDocument()
    expect(screen.getByText('Arsenal')).toBeInTheDocument()
  })

  it('renders score for live match', () => {
    render(<MatchCard match={liveMatch} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('renders LiveBadge for in-play match', () => {
    render(<MatchCard match={liveMatch} />)
    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test
```

Expected: FAIL — Cannot find module '@/components/home/LiveBadge'

- [ ] **Step 3: Create LiveBadge**

Create `components/home/LiveBadge.tsx`:

```typescript
interface LiveBadgeProps {
  minute?: number
}

export function LiveBadge({ minute }: LiveBadgeProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-green animate-live-pulse" />
      <span className="text-accent-green text-xs font-bold tracking-wide">LIVE</span>
      {minute !== undefined && (
        <span className="text-accent-green text-xs font-bold">{minute}'</span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create MatchCard**

Create `components/home/MatchCard.tsx`:

```typescript
import Image from 'next/image'
import { LiveBadge } from './LiveBadge'
import { getStatusLabel, isLive } from '@/lib/utils'
import type { Match } from '@/lib/types'

interface MatchCardProps {
  match: Match
}

function TeamCrest({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative w-6 h-6 shrink-0">
      <Image
        src={src}
        alt={alt}
        fill
        className="object-contain"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
    </div>
  )
}

function ScoreOrTime({ match }: { match: Match }) {
  const live = isLive(match.status)
  const { home, away } = match.score.fullTime

  if (match.status === 'SCHEDULED' || match.status === 'TIMED') {
    return (
      <span className="text-content-muted text-sm font-medium">
        {getStatusLabel(match.status, match.minute, match.utcDate)}
      </span>
    )
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className={`text-lg font-black ${live ? 'text-content-primary' : 'text-content-secondary'}`}>
          {home ?? '-'}
        </span>
        <span className="text-content-muted text-sm">-</span>
        <span className={`text-lg font-black ${live ? 'text-content-primary' : 'text-content-secondary'}`}>
          {away ?? '-'}
        </span>
      </div>
      {live ? (
        <LiveBadge minute={match.minute} />
      ) : (
        <span className="text-content-muted text-xs font-medium">
          {getStatusLabel(match.status, match.minute, match.utcDate)}
        </span>
      )}
    </div>
  )
}

export function MatchCard({ match }: MatchCardProps) {
  return (
    <div className="flex items-center px-4 py-3 hover:bg-bg-elevated transition-colors cursor-pointer border-b border-divider last:border-b-0">
      {/* Home team */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <TeamCrest src={match.homeTeam.crest} alt={match.homeTeam.name} />
        <span className="text-sm font-medium text-content-primary truncate">
          {match.homeTeam.shortName}
        </span>
      </div>

      {/* Score / Time */}
      <div className="px-4 flex flex-col items-center shrink-0">
        <ScoreOrTime match={match} />
      </div>

      {/* Away team */}
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
        <span className="text-sm font-medium text-content-primary truncate text-right">
          {match.awayTeam.shortName}
        </span>
        <TeamCrest src={match.awayTeam.crest} alt={match.awayTeam.name} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create SkeletonMatchCard**

Create `components/home/SkeletonMatchCard.tsx`:

```typescript
export function SkeletonMatchCard() {
  return (
    <div className="flex items-center px-4 py-3 border-b border-divider last:border-b-0 animate-pulse">
      <div className="flex items-center gap-2 flex-1">
        <div className="w-6 h-6 rounded-full bg-bg-elevated shrink-0" />
        <div className="h-3 w-24 bg-bg-elevated rounded" />
      </div>
      <div className="px-4 flex flex-col items-center gap-1 shrink-0">
        <div className="h-5 w-10 bg-bg-elevated rounded" />
        <div className="h-2.5 w-6 bg-bg-elevated rounded" />
      </div>
      <div className="flex items-center gap-2 flex-1 justify-end">
        <div className="h-3 w-24 bg-bg-elevated rounded" />
        <div className="w-6 h-6 rounded-full bg-bg-elevated shrink-0" />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run tests — all pass**

```bash
npm test
```

Expected: All 7 tests pass (5 from utils + 2 LiveBadge + 3 MatchCard but wait - the test file references these components properly now).

- [ ] **Step 7: Commit**

```bash
git add components/home/LiveBadge.tsx components/home/MatchCard.tsx components/home/SkeletonMatchCard.tsx __tests__/components/
git commit -m "feat: add MatchCard, LiveBadge, and SkeletonMatchCard components"
```

---

## Task 10: LeagueGroup Component

**Files:**
- Create: `components/home/LeagueGroup.tsx`

**Interfaces:**
- Consumes: `GroupedMatches` from `@/lib/types`; `<MatchCard />`, `<SkeletonMatchCard />`
- Produces: `<LeagueGroup group />` — league header + list of match cards

- [ ] **Step 1: Create LeagueGroup**

Create `components/home/LeagueGroup.tsx`:

```typescript
import Image from 'next/image'
import { MatchCard } from './MatchCard'
import type { GroupedMatches } from '@/lib/types'

interface LeagueGroupProps {
  group: GroupedMatches
}

export function LeagueGroup({ group }: LeagueGroupProps) {
  return (
    <div className="mb-2">
      {/* League header */}
      <div className="flex items-center gap-2.5 px-4 py-2 bg-bg-surface sticky top-14 z-10 border-b border-divider">
        <div className="relative w-5 h-5 shrink-0">
          <Image
            src={group.competitionEmblem}
            alt={group.competitionName}
            fill
            className="object-contain"
          />
        </div>
        <span className="text-xs font-semibold uppercase tracking-widest text-content-muted">
          {group.competitionName}
        </span>
        <span className="ml-auto text-xs text-content-muted">{group.matches.length}</span>
      </div>

      {/* Match cards */}
      <div className="bg-bg-surface">
        {group.matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/home/LeagueGroup.tsx
git commit -m "feat: add LeagueGroup with sticky league header"
```

---

## Task 11: useMatches Hook + HomeFeed + Home Page Assembly

**Files:**
- Create: `hooks/useMatches.ts`
- Create: `components/home/HomeFeed.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `/api/matches?date=` route; `groupByLeague`; `<LeagueGroup />`, `<SkeletonMatchCard />`, `<DateStrip />`
- Produces: Fully working FotMob-style home page with SWR polling every 30s

- [ ] **Step 1: Create useMatches hook**

Create `hooks/useMatches.ts`:

```typescript
import useSWR from 'swr'
import type { MatchesApiResponse } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function useMatches(date: string) {
  const { data, error, isLoading } = useSWR<MatchesApiResponse>(
    `/api/matches?date=${date}`,
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      dedupingInterval: 10_000,
    }
  )

  return {
    matches: data?.matches ?? [],
    error: data?.error ?? error?.message,
    isLoading,
  }
}
```

- [ ] **Step 2: Create HomeFeed**

Create `components/home/HomeFeed.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { DateStrip } from './DateStrip'
import { LeagueGroup } from './LeagueGroup'
import { SkeletonMatchCard } from './SkeletonMatchCard'
import { useMatches } from '@/hooks/useMatches'
import { groupByLeague, formatDate } from '@/lib/utils'

export function HomeFeed() {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const { matches, isLoading, error } = useMatches(selectedDate)
  const groups = groupByLeague(matches)

  return (
    <div>
      <DateStrip selectedDate={selectedDate} onDateChange={setSelectedDate} />

      {isLoading && (
        <div className="mt-2 bg-bg-surface">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonMatchCard key={i} />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="flex flex-col items-center justify-center py-20 text-content-muted">
          <span className="text-4xl mb-3">⚽</span>
          <p className="text-sm">Could not load matches</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      )}

      {!isLoading && !error && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-content-muted">
          <span className="text-4xl mb-3">⚽</span>
          <p className="text-sm">No matches on this date</p>
        </div>
      )}

      {!isLoading && !error && groups.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {groups.map((group) => (
            <LeagueGroup key={group.competitionId} group={group} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update home page**

Replace `app/page.tsx`:

```typescript
import { HomeFeed } from '@/components/home/HomeFeed'

export default function HomePage() {
  return <HomeFeed />
}
```

- [ ] **Step 4: Run full dev check**

```bash
npm run dev
```

Open http://localhost:3000. You should see:
- Dark top nav with 90MIN Tactics logo
- DateStrip with Today selected (green pill)
- League-grouped match cards (Premier League, La Liga, etc.)
- Skeleton loaders while data fetches
- Live matches show green pulsing LIVE badge

If matches don't appear: check your `.env.local` has a valid `FOOTBALL_DATA_API_KEY` from football-data.org.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: All tests pass. No type errors.

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Final commit**

```bash
git add hooks/useMatches.ts components/home/HomeFeed.tsx app/page.tsx
git commit -m "feat: complete FotMob-style home feed with SWR polling and league groups"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** TopNav ✓ · BottomNav ✓ · Sidebar ✓ · DateStrip ✓ · LeagueGroup ✓ · MatchCard ✓ · LiveBadge ✓ · SkeletonMatchCard ✓ · Dark mode default ✓ · SWR polling 30s ✓ · football-data.org free API ✓ · TheSportsDB images available via next/image config ✓
- [x] **No placeholders:** Every step has real code, real commands, real expected output.
- [x] **Type consistency:** `Match` defined in Task 2, consumed identically in Tasks 9, 10, 11. `GroupedMatches` defined Task 2, produced by `groupByLeague` Task 2, consumed by `LeagueGroup` Task 10.
- [x] **Zero paid dependencies:** Only football-data.org (free key) + TheSportsDB (no key). No Supabase, no Redis, no paid tier.
