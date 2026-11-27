'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Crest } from '@/components/ui/Crest'

export interface TransferRow {
  key: string
  playerName: string
  date: string
  loan: boolean
  competitions: string[]
  to: { id: number; name: string; crest: string | null }
  from: { id: number | null; name: string } | null
}

export interface TransferChip {
  code: string
  name: string
  emblem: string | null
}

function formatDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function chipClass(active: boolean): string {
  return `shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
    active ? 'bg-accent-green text-bg-primary' : 'bg-bg-surface text-content-secondary hover:text-content-primary'
  }`
}

export function TransfersView({ rows, chips }: { rows: TransferRow[]; chips: TransferChip[] }) {
  const [competition, setCompetition] = useState<string | null>(null)
  const list = competition ? rows.filter((r) => r.competitions.includes(competition)) : rows

  return (
    <div className="pb-6">
      <div className="px-4 py-3 border-b border-divider">
        <h1 className="text-[15px] font-bold text-content-primary">Transfers</h1>
        <p className="text-[11px] text-content-muted">Signings and loans in the last four months</p>
      </div>

      {chips.length > 0 && (
        <div role="group" aria-label="Filter by competition" className="flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-hide">
          <button type="button" onClick={() => setCompetition(null)} aria-pressed={!competition} className={chipClass(!competition)}>
            All
          </button>
          {chips.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setCompetition(c.code)}
              aria-pressed={competition === c.code}
              className={chipClass(competition === c.code)}
            >
              <Crest src={c.emblem} name={c.name} size={14} />
              {c.name}
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <p className="text-[13px] font-medium text-content-secondary">No recent transfers found</p>
          <p className="mt-1 text-[11px] text-content-muted">Check back later — the list updates every few hours.</p>
        </div>
      ) : (
        <ul className="mx-2 mt-1 divide-y divide-divider rounded-lg bg-bg-surface overflow-hidden">
          {list.map((t) => (
            <li key={t.key} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-content-primary truncate">
                  {t.playerName}
                  {t.loan && (
                    <span className="ms-1.5 rounded bg-bg-elevated px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-content-muted">
                      Loan
                    </span>
                  )}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-content-muted min-w-0">
                  {t.from ? (
                    t.from.id ? (
                      <Link href={`/team/${t.from.id}`} className="truncate hover:text-content-primary">
                        {t.from.name}
                      </Link>
                    ) : (
                      <span className="truncate">{t.from.name}</span>
                    )
                  ) : (
                    <span>—</span>
                  )}
                  <span aria-hidden className="shrink-0">
                    →
                  </span>
                  <Link href={`/team/${t.to.id}`} className="truncate text-content-secondary hover:text-content-primary">
                    {t.to.name}
                  </Link>
                </p>
              </div>
              <Crest src={t.to.crest} name={t.to.name} size={24} />
              <time dateTime={t.date} className="w-20 shrink-0 text-end text-[11px] tabular-nums text-content-muted">
                {formatDate(t.date)}
              </time>
            </li>
          ))}
        </ul>
      )}

      <p className="px-4 pt-4 text-[11px] text-content-muted">
        Source: Wikidata (CC0), maintained by volunteers — new moves can take hours or days to appear.
      </p>
    </div>
  )
}
