'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { FREE_COMPETITIONS } from '@/lib/competitions'
import { CURATED_ORDER } from '@/lib/home-order'
import { detectTimeZone, getPreferredTimeZone, localDateString, setPreferredTimeZone } from '@/lib/timezone'
import { formatKickoffTimeIn } from '@/lib/utils'
import { Crest } from '@/components/ui/Crest'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { useFollows, type FollowTarget } from '@/hooks/useFollows'
import { BANNER_DISMISSED_KEY } from '@/components/home/PersonaliseBanner'
import type { CatalogTeam } from '@/lib/db/follow-queries'

/**
 * Onboarding (PRD ON-1): leagues -> teams -> time zone -> home.
 *
 * Choices are local until "Finish", then applied as one batch, so backing out
 * half-way changes nothing. Existing follows are pre-selected, which makes
 * the flow double as an editor for returning users.
 */

const STEPS = ['Leagues', 'Teams', 'Time zone'] as const
type Step = 0 | 1 | 2

const COMPETITIONS = CURATED_ORDER.map((code) => FREE_COMPETITIONS.find((c) => c.code === code)).filter(
  (c): c is (typeof FREE_COMPETITIONS)[number] => Boolean(c)
)

function zoneList(current: string): string[] {
  let zones: string[] = []
  try {
    zones = Intl.supportedValuesOf('timeZone')
  } catch {
    // older runtime - fall back to the two zones we know exist
  }
  return [...new Set([current, 'UTC', ...zones])].sort((a, b) => a.localeCompare(b))
}

function Chip({
  pressed,
  onClick,
  children,
  label,
}: {
  pressed: boolean
  onClick: () => void
  children: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green ${
        pressed
          ? 'border-accent-green bg-bg-elevated text-content-primary'
          : 'border-divider text-content-secondary hover:text-content-primary hover:bg-bg-elevated'
      }`}
    >
      {children}
      <span
        aria-hidden="true"
        className={`ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
          pressed ? 'bg-accent-green text-bg-primary' : 'border border-divider'
        }`}
      >
        {pressed && <Check size={11} strokeWidth={3} />}
      </span>
    </button>
  )
}

export function OnboardingFlow({
  teamsByCompetition,
  teamsUnavailable,
}: {
  teamsByCompetition: Record<string, CatalogTeam[]>
  teamsUnavailable: boolean
}) {
  const router = useRouter()
  const { follows, ready, applyChanges, error: followsError, retry: retryFollows } = useFollows()
  const [step, setStep] = useState<Step>(0)
  const [leagues, setLeagues] = useState<Set<string>>(new Set())
  const [teams, setTeams] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [tz, setTz] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const seeded = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Pre-select existing follows once, when they first arrive.
  useEffect(() => {
    if (!ready || seeded.current) return
    seeded.current = true
    setLeagues(new Set(follows.filter((f) => f.entityType === 'competition').map((f) => f.entityKey)))
    setTeams(new Set(follows.filter((f) => f.entityType === 'team').map((f) => Number(f.entityKey))))
  }, [ready, follows])

  useEffect(() => setTz(getPreferredTimeZone()), [])

  // Move focus to the new step's heading so screen readers announce it.
  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  const teamNames = useMemo(() => {
    const map = new Map<number, string>()
    for (const list of Object.values(teamsByCompetition)) for (const t of list) map.set(t.id, t.name)
    return map
  }, [teamsByCompetition])

  /** Competitions in display order: the ones picked in step 1 first. */
  const teamSections = useMemo(() => {
    const ordered = [...COMPETITIONS].sort(
      (a, b) => Number(leagues.has(b.code)) - Number(leagues.has(a.code))
    )
    const q = query.trim().toLowerCase()
    return ordered
      .map((c) => ({
        competition: c,
        teams: (teamsByCompetition[c.code] ?? []).filter(
          (t) => !q || t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q)
        ),
      }))
      .filter((s) => s.teams.length > 0)
  }, [leagues, query, teamsByCompetition])

  const toggleIn = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  }

  const finish = async () => {
    if (!tz) return
    setSaving(true)
    setSaveError(null)

    const current = new Set(follows.map((f) => `${f.entityType}:${f.entityKey}`))
    const wanted: FollowTarget[] = [
      ...[...leagues].map((code) => ({ entityType: 'competition' as const, entityKey: code })),
      ...[...teams].map((id) => ({ entityType: 'team' as const, entityKey: String(id) })),
    ]
    const wantedKeys = new Set(wanted.map((t) => `${t.entityType}:${t.entityKey}`))
    const adds = wanted.filter((t) => !current.has(`${t.entityType}:${t.entityKey}`))
    // Only teams and leagues are managed here; followed matches and players are left alone.
    const removes: FollowTarget[] = follows
      .filter((f) => (f.entityType === 'team' || f.entityType === 'competition') && !wantedKeys.has(`${f.entityType}:${f.entityKey}`))
      .map((f) => ({ entityType: f.entityType, entityKey: f.entityKey }))

    // An explicit zone equal to the detected one is stored as "auto", so the
    // feed keeps following the device if the user travels.
    setPreferredTimeZone(tz === detectTimeZone() ? null : tz)

    let failed: FollowTarget[] = []
    try {
      failed = await applyChanges(adds, removes)
    } catch {
      failed = [...adds, ...removes]
    }
    setSaving(false)

    if (failed.length > 0) {
      setSaveError(
        `${failed.length} change${failed.length === 1 ? '' : 's'} could not be saved. Check your connection and try again.`
      )
      return
    }
    try {
      window.localStorage.setItem(BANNER_DISMISSED_KEY, '1')
    } catch {
      // not persisted - the banner hides anyway once follows exist
    }
    router.push('/')
  }

  const now = new Date()

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <p className="text-[11px] font-bold uppercase tracking-widest text-content-muted">
        Step {step + 1} of {STEPS.length}
      </p>
      <ol className="mt-2 mb-5 flex gap-2" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? 'step' : undefined}
            className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent-green' : 'bg-bg-elevated'}`}
          >
            <span className="sr-only">
              {label}
              {i < step ? ' (done)' : ''}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section aria-labelledby="ob-leagues">
          <h1 id="ob-leagues" ref={headingRef} tabIndex={-1} className="text-xl font-bold text-content-primary outline-none">
            Which leagues do you follow?
          </h1>
          <p className="text-[13px] text-content-secondary mt-1 mb-4">
            Their matches are pinned near the top of your feed.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {COMPETITIONS.map((c) => (
              <Chip
                key={c.code}
                pressed={leagues.has(c.code)}
                onClick={() => setLeagues((s) => toggleIn(s, c.code))}
                label={`${c.name}, ${c.country}`}
              >
                <Crest src={c.emblem} name={c.name} size={22} fallbackText={c.flag} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block text-[11px] text-content-muted">{c.country}</span>
                </span>
              </Chip>
            ))}
          </div>
        </section>
      )}

      {step === 1 && (
        <section aria-labelledby="ob-teams">
          <h1 id="ob-teams" ref={headingRef} tabIndex={-1} className="text-xl font-bold text-content-primary outline-none">
            Pick your teams
          </h1>
          <p className="text-[13px] text-content-secondary mt-1 mb-4">
            Their matches appear in a Following section at the top of every day.
          </p>

          {teamsUnavailable ? (
            <p role="alert" className="rounded-lg bg-bg-surface px-4 py-6 text-center text-[13px] text-content-secondary">
              Teams could not be loaded right now. You can skip this step and follow teams later from their pages.
            </p>
          ) : (
            <>
              <label className="relative mb-4 block">
                <span className="sr-only">Search teams</span>
                <Search size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search teams"
                  className="w-full rounded-lg border border-divider bg-bg-surface py-2 pl-9 pr-3 text-[13px] text-content-primary placeholder:text-content-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
                />
              </label>

              {teamSections.length === 0 && (
                <p className="py-8 text-center text-[13px] text-content-muted">No teams match “{query}”.</p>
              )}

              <div className="flex flex-col gap-2">
                {teamSections.map(({ competition, teams: list }, i) => (
                  <details
                    key={competition.code}
                    // Open what the user picked (or the first section), or everything while searching.
                    open={Boolean(query) || leagues.has(competition.code) || (leagues.size === 0 && i === 0)}
                    className="rounded-lg bg-bg-surface"
                  >
                    <summary className="flex cursor-pointer items-center gap-2.5 px-4 py-2.5 text-[13px] font-semibold text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green rounded-lg">
                      <Crest src={competition.emblem} name={competition.name} size={18} fallbackText={competition.flag} />
                      {competition.name}
                      <span className="ml-auto text-[11px] font-normal text-content-muted">{list.length} teams</span>
                    </summary>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-3 pb-3">
                      {list.map((t) => (
                        <Chip
                          key={t.id}
                          pressed={teams.has(t.id)}
                          onClick={() => setTeams((s) => toggleIn(s, t.id))}
                          label={t.name}
                        >
                          <TeamCrest src={t.crest} name={t.name} size={20} />
                          <span className="truncate">{t.shortName || t.name}</span>
                        </Chip>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="ob-tz">
          <h1 id="ob-tz" ref={headingRef} tabIndex={-1} className="text-xl font-bold text-content-primary outline-none">
            Confirm your time zone
          </h1>
          <p className="text-[13px] text-content-secondary mt-1 mb-4">
            &quot;Today&quot; and every kickoff time use this zone. We detected it from your device.
          </p>
          {tz ? (
            <div className="rounded-lg bg-bg-surface p-4">
              <label className="block text-[13px] text-content-secondary">
                Time zone
                <select
                  value={tz}
                  onChange={(e) => setTz(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-divider bg-bg-elevated px-2 py-2 text-[14px] text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
                >
                  {zoneList(tz).map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, ' ')}
                      {z === detectTimeZone() ? ' (detected)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-3 text-[12px] text-content-muted" aria-live="polite">
                It is {formatKickoffTimeIn(now.toISOString(), tz)} on {localDateString(now, tz)} there.
              </p>
            </div>
          ) : (
            <div className="h-24 rounded-lg bg-bg-surface animate-pulse" aria-hidden="true" />
          )}

          {followsError && !ready && (
            <p role="alert" className="mt-4 rounded-md bg-bg-surface px-3 py-2 text-[13px] text-live-red">
              Your current follows could not be loaded, so nothing can be saved yet.{' '}
              <button type="button" onClick={retryFollows} className="underline font-medium">
                Retry
              </button>
            </p>
          )}
          {saveError && (
            <p role="alert" className="mt-4 rounded-md bg-bg-surface px-3 py-2 text-[13px] text-live-red">
              {saveError}
            </p>
          )}
          {(leagues.size > 0 || teams.size > 0) && (
            <p className="mt-4 text-[12px] text-content-muted">
              Following {leagues.size} league{leagues.size === 1 ? '' : 's'}
              {teams.size > 0 &&
                ` and ${teams.size} team${teams.size === 1 ? '' : 's'}${
                  teams.size <= 3 ? ` (${[...teams].map((id) => teamNames.get(id) ?? id).join(', ')})` : ''
                }`}
              .
            </p>
          )}
        </section>
      )}

      <div className="mt-6 flex items-center gap-2">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((s) => (s - 1) as Step)}
            className="rounded-full px-4 py-2 text-[13px] font-medium text-content-secondary hover:text-content-primary hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
          >
            Back
          </button>
        ) : (
          <Link
            href="/"
            className="rounded-full px-4 py-2 text-[13px] font-medium text-content-secondary hover:text-content-primary hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
          >
            Not now
          </Link>
        )}
        <div className="ml-auto" />
        {step < 2 ? (
          <button
            type="button"
            onClick={() => setStep((s) => (s + 1) as Step)}
            className="rounded-full bg-accent-green px-5 py-2 text-[13px] font-bold text-bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
          >
            {step === 0 && leagues.size === 0 ? 'Skip' : step === 1 && teams.size === 0 ? 'Skip' : 'Next'}
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={saving || !tz || !ready}
            aria-busy={saving}
            className="rounded-full bg-accent-green px-5 py-2 text-[13px] font-bold text-bg-primary disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
          >
            {saving ? 'Saving…' : saveError ? 'Try again' : 'Finish'}
          </button>
        )}
      </div>
    </div>
  )
}
