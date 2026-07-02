'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const LEAGUES = [
  { id: 'all', name: 'All Matches' },
  { id: 'group', name: 'Group Stage' },
  { id: 'knockout', name: 'Knockout Stage' },
]

export default function LeagueFilter() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const active = searchParams.get('league') ?? 'all'

  function select(id: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (id === 'all') params.delete('league')
    else params.set('league', id)
    router.push(`/matches?${params.toString()}`)
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {LEAGUES.map(l => (
        <button
          key={l.id}
          onClick={() => select(l.id)}
          className={`flex-shrink-0 px-6 py-3 rounded-full text-sm font-[var(--font-jetbrains)] tracking-wide transition ${
            active === l.id
              ? 'bg-[#aec6ff] text-[#002e6a] shadow-[0px_10px_15px_-3px_rgba(174,198,255,0.2)]'
              : 'bg-[var(--color-input)] border border-[var(--glass-05)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-strong)]'
          }`}
        >
          {l.name}
        </button>
      ))}
    </div>
  )
}
