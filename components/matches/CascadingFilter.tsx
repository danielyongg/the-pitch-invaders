'use client'

import { useRouter, useSearchParams } from 'next/navigation'

type Phase = { id: string; name: string }
type Tournament = { id: string; name: string; phases: Phase[] }
type Country = { id: string; name: string; tournaments: Tournament[] }

const HIERARCHY: Country[] = [
  {
    id: 'international',
    name: 'International',
    tournaments: [
      {
        id: '77',
        name: 'World Cup 2026',
        phases: [
          { id: 'group', name: 'Group Stage' },
          { id: 'knockout', name: 'Knockout Stage' },
        ],
      },
    ],
  },
  {
    id: 'england',
    name: 'England',
    tournaments: [
      { id: '47', name: 'Premier League', phases: [] },
    ],
  },
  {
    id: 'spain',
    name: 'Spain',
    tournaments: [
      { id: '87', name: 'La Liga', phases: [] },
    ],
  },
  {
    id: 'germany',
    name: 'Germany',
    tournaments: [
      { id: '54', name: 'Bundesliga', phases: [] },
    ],
  },
  {
    id: 'italy',
    name: 'Italy',
    tournaments: [
      { id: '55', name: 'Serie A', phases: [] },
    ],
  },
  {
    id: 'france',
    name: 'France',
    tournaments: [
      { id: '53', name: 'Ligue 1', phases: [] },
    ],
  },
]

const PILL = (active: boolean) =>
  `flex-shrink-0 px-5 py-2 rounded-full text-sm font-[var(--font-jetbrains)] tracking-wide transition cursor-pointer ${
    active
      ? 'bg-[#aec6ff] text-[#002e6a] shadow-[0px_6px_12px_-3px_rgba(174,198,255,0.25)]'
      : 'bg-[var(--color-input)] border border-[var(--glass-05)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-strong)]'
  }`

interface Props {
  availableLeagueIds: number[]
  favoriteTeamNames?: string[]
  favoriteCompetitions?: { id: number; name: string }[]
}

export default function CascadingFilter({ availableLeagueIds, favoriteTeamNames = [], favoriteCompetitions = [] }: Props) {
  const router = useRouter()
  const sp = useSearchParams()
  const country = sp.get('country') ?? 'all'
  const tournament = sp.get('tournament') ?? ''
  const phase = sp.get('phase') ?? ''

  const favoritesCountry: Country | null = (favoriteTeamNames.length || favoriteCompetitions.length)
    ? {
        id: 'favorites',
        name: '★ Favorites',
        tournaments: [
          ...(favoriteTeamNames.length
            ? [{ id: 'teams', name: 'Teams', phases: favoriteTeamNames.map(name => ({ id: name, name })) }]
            : []),
          ...(favoriteCompetitions.length
            ? [{ id: 'competitions', name: 'Competitions', phases: favoriteCompetitions.map(c => ({ id: String(c.id), name: c.name })) }]
            : []),
        ],
      }
    : null

  const visibleHierarchy = [
    ...(favoritesCountry ? [favoritesCountry] : []),
    ...HIERARCHY
      .map(c => ({ ...c, tournaments: c.tournaments.filter(t => availableLeagueIds.includes(Number(t.id))) }))
      .filter(c => c.tournaments.length > 0),
  ]

  function navigate(next: { country?: string; tournament?: string; phase?: string }) {
    const params = new URLSearchParams()
    const c = next.country ?? country
    const t = next.tournament ?? (next.country !== undefined ? '' : tournament)
    const p = next.phase ?? (next.tournament !== undefined || next.country !== undefined ? '' : phase)
    if (c && c !== 'all') params.set('country', c)
    if (t) params.set('tournament', t)
    if (p) params.set('phase', p)
    router.push(`/matches?${params.toString()}`)
  }

  const selectedCountry = visibleHierarchy.find(c => c.id === country)
  const tournaments = selectedCountry?.tournaments ?? []
  const selectedTournament = tournaments.find(t => t.id === tournament)
  const phases = selectedTournament?.phases ?? []

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1: Country */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {visibleHierarchy.map(c => (
          <button key={c.id} onClick={() => navigate({ country: c.id, tournament: '', phase: '' })} className={PILL(country === c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      {/* Row 2: Tournament */}
      {tournaments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {tournaments.map(t => (
            <button key={t.id} onClick={() => navigate({ tournament: t.id, phase: '' })} className={PILL(tournament === t.id)}>
              {t.name}
            </button>
          ))}
        </div>
      )}

      {/* Row 3: Phase */}
      {phases.length > 0 && tournament && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {phases.map(p => (
            <button key={p.id} onClick={() => navigate({ phase: p.id })} className={PILL(phase === p.id)}>
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
