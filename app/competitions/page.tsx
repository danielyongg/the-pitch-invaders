export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { COMPETITIONS, SPORTS } from '@/lib/competitions'
import { getAvailableLeagueIds } from '@/lib/matches-availability'
import { getFlagUrl } from '@/lib/flags'
import { LEAGUE_COLORS } from '@/lib/league-colors'

export default async function CompetitionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let favoriteTeams: string[] = []
  let favoriteLeagues: number[] = []
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('favorite_team_names, favorite_league_ids')
      .eq('id', user.id)
      .maybeSingle()
    favoriteTeams = profile?.favorite_team_names ?? []
    favoriteLeagues = profile?.favorite_league_ids ?? []
  }
  const hasFavorites = favoriteTeams.length > 0 || favoriteLeagues.length > 0

  const availableLeagueIds = await getAvailableLeagueIds(supabase)

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <div className="mb-8">
        <h1 className="font-[var(--font-anybody)] font-extrabold text-[40px] text-[var(--color-text-primary)] tracking-[-1px] [font-variation-settings:'wdth'_100]">
          Competitions
        </h1>
        <p className="text-[var(--color-text-secondary)] mt-1">Pick a competition to see fixtures and standings.</p>
      </div>

      {hasFavorites && (
        <div className="mb-8">
          <a
            href="/competitions/favorites"
            className="glass-card rounded-2xl p-5 flex items-center gap-3 hover:bg-[var(--glass-03)] transition"
          >
            <span className="text-2xl">★</span>
            <span className="font-[var(--font-anybody)] font-bold text-lg text-[var(--color-text-primary)]">Favorites</span>
          </a>
        </div>
      )}

      {SPORTS.map(({ key, label }) => (
        <div key={key} className="mb-8">
          <h2 className="text-xs font-[var(--font-jetbrains)] tracking-widest uppercase text-[var(--color-text-secondary)] mb-3">{label}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {COMPETITIONS.filter(c => c.sport === key).map(c => {
              const available = availableLeagueIds.includes(c.id)
              const colors = LEAGUE_COLORS[c.id] ?? LEAGUE_COLORS[77]
              const flagUrl = getFlagUrl(c.country)
              const tile = (
                <div
                  className={`glass-card rounded-2xl p-5 flex items-center gap-3 transition ${available ? 'hover:bg-[var(--glass-03)]' : 'opacity-40 cursor-not-allowed'}`}
                >
                  {c.logo ? (
                    <img src={c.logo} alt="" className="w-8 h-8 object-contain flex-shrink-0" />
                  ) : flagUrl ? (
                    <img src={flagUrl} alt="" className="w-8 h-6 object-cover rounded flex-shrink-0" />
                  ) : (
                    <span
                      className="w-8 h-8 rounded-full flex-shrink-0"
                      style={{ backgroundColor: colors.bg }}
                    />
                  )}
                  <span className="font-[var(--font-anybody)] font-bold text-[var(--color-text-primary)]">{c.name}</span>
                </div>
              )
              return available ? (
                <a key={c.id} href={`/competitions/${c.id}`}>{tile}</a>
              ) : (
                <div key={c.id}>{tile}</div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
