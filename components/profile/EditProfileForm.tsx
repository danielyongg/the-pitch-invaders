'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { COMPETITIONS } from '@/lib/competitions'
import type { Profile } from '@/lib/supabase/types'

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value]
}

const PILL = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-sm font-[var(--font-jetbrains)] tracking-wide transition cursor-pointer ${
    active
      ? 'bg-[#aec6ff] text-[#002e6a]'
      : 'bg-[var(--color-input)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-strong)]'
  }`

interface Props {
  profile: Profile
  teamsByLeague: { leagueId: number; teams: string[] }[]
}

export default function EditProfileForm({ profile, teamsByLeague }: Props) {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState(profile.username)
  const [favoriteTeams, setFavoriteTeams] = useState<string[]>(profile.favorite_team_names ?? [])
  const [favoriteLeagues, setFavoriteLeagues] = useState<number[]>(profile.favorite_league_ids ?? [])
  const [teamSearch, setTeamSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const filteredGroups = useMemo(() => {
    const q = teamSearch.trim().toLowerCase()
    return teamsByLeague
      .map(g => ({
        ...g,
        name: COMPETITIONS.find(c => c.id === g.leagueId)?.name ?? `League ${g.leagueId}`,
        teams: q ? g.teams.filter(t => t.toLowerCase().includes(q)) : g.teams,
      }))
      .filter(g => g.teams.length > 0)
  }, [teamsByLeague, teamSearch])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: err } = await supabase
      .from('profiles')
      .update({
        username: username.trim(),
        favorite_team_names: favoriteTeams,
        favorite_league_ids: favoriteLeagues,
      })
      .eq('id', profile.id)

    setLoading(false)
    if (err) { setError('Failed to save. Username may already be taken.'); return }
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-[var(--font-jetbrains)] tracking-wide text-[var(--color-accent-text)] hover:text-[var(--color-accent-hover)] transition border border-[rgba(174,198,255,0.3)] rounded-xl px-4 py-2"
      >
        Edit Profile
      </button>
    )
  }

  return (
    <form onSubmit={handleSave} className="glass-card rounded-2xl p-6 space-y-4 mb-10">
      {error && (
        <div className="bg-[rgba(197,0,5,0.1)] border border-[rgba(255,180,169,0.3)] text-[var(--color-live-text)] text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}
      <div>
        <label className="block text-sm font-[var(--font-jetbrains)] tracking-wide text-[var(--color-text-secondary)] mb-2">Username</label>
        <input
          type="text" value={username} onChange={e => setUsername(e.target.value)} required maxLength={30}
          className="w-full bg-[var(--color-input)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#aec6ff] focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-[var(--font-jetbrains)] tracking-wide text-[var(--color-text-secondary)] mb-2">Favorite Competitions</label>
        <div className="flex flex-wrap gap-2">
          {COMPETITIONS.map(c => (
            <button
              key={c.id} type="button"
              onClick={() => setFavoriteLeagues(l => toggle(l, c.id))}
              className={PILL(favoriteLeagues.includes(c.id))}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-[var(--font-jetbrains)] tracking-wide text-[var(--color-text-secondary)]">Favorite Teams</label>
          {favoriteTeams.length > 0 && (
            <span className="text-xs text-[var(--color-accent-text)] font-[var(--font-jetbrains)]">{favoriteTeams.length} selected</span>
          )}
        </div>
        <input
          type="text" value={teamSearch} onChange={e => setTeamSearch(e.target.value)}
          placeholder="Search teams..."
          className="w-full bg-[var(--color-input)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-xl px-4 py-2.5 mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#aec6ff] focus:border-transparent"
        />
        <div className="max-h-64 overflow-y-auto space-y-4 pr-1">
          {filteredGroups.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)]">No teams match your search.</p>
          )}
          {filteredGroups.map(g => (
            <div key={g.leagueId}>
              <div className="text-xs font-[var(--font-jetbrains)] tracking-widest uppercase text-[var(--color-text-muted)] mb-2">{g.name}</div>
              <div className="flex flex-wrap gap-2">
                {g.teams.map(name => (
                  <button
                    key={name} type="button"
                    onClick={() => setFavoriteTeams(t => toggle(t, name))}
                    className={PILL(favoriteTeams.includes(name))}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit" disabled={loading}
          className="bg-[#aec6ff] hover:bg-[#c8d8ff] disabled:opacity-50 text-[#002e6a] font-bold font-[var(--font-anybody)] [font-variation-settings:'wdth'_100] py-2 px-5 rounded-xl transition"
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button" onClick={() => setOpen(false)}
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] py-2 px-5 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
