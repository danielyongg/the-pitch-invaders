export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EditProfileForm from '@/components/profile/EditProfileForm'

interface Props {
  params: Promise<{ userId: string }>
}

export default async function ProfilePage({ params }: Props) {
  const { userId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (!profile) notFound()

  let teamsByLeague: { leagueId: number; teams: string[] }[] = []
  if (user?.id === userId) {
    const { data: rows } = await supabase.from('matches').select('league_id, home_team_name, away_team_name')
    // Knockout placeholder names ("Germany/Paraguay", "Winner SF 1", "Loser QF 2")
    // stand in for a bracket slot that hasn't been decided yet — not real teams.
    const isPlaceholder = (name: string) => /\/|^(Winner|Loser)\b/i.test(name)
    const byLeague = new Map<number, Set<string>>()
    for (const r of rows ?? []) {
      if (isPlaceholder(r.home_team_name) || isPlaceholder(r.away_team_name)) continue
      if (!byLeague.has(r.league_id)) byLeague.set(r.league_id, new Set())
      byLeague.get(r.league_id)!.add(r.home_team_name)
      byLeague.get(r.league_id)!.add(r.away_team_name)
    }
    teamsByLeague = Array.from(byLeague.entries())
      .map(([leagueId, teams]) => ({ leagueId, teams: Array.from(teams).sort() }))
  }

  const { data: stats } = await supabase.from('leaderboard_cache').select('*').eq('user_id', userId).maybeSingle()
  const { data: recentPreds } = await supabase
    .from('predictions')
    .select('*, matches(*)')
    .eq('user_id', userId)
    .not('points_awarded', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(10)

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      {/* Profile Header */}
      <div className="flex items-center gap-4 sm:gap-5 mb-6">
        <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-[#00408f] flex items-center justify-center flex-shrink-0 font-[var(--font-anybody)] font-bold text-xl sm:text-3xl text-[#aec6ff] [font-variation-settings:'wdth'_100]">
          {profile.username[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="font-[var(--font-anybody)] font-bold text-[28px] sm:text-[40px] text-[var(--color-text-primary)] break-words [font-variation-settings:'wdth'_100]">{profile.username}</h1>
          <p className="text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide text-sm mt-1">
            Joined {new Date(profile.created_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      {user?.id === userId && (
        <div className="mb-6">
          <EditProfileForm profile={profile} teamsByLeague={teamsByLeague} />
        </div>
      )}

      {/* Stats bento */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'TOTAL POINTS', value: stats?.total_points ?? 0, color: 'text-[#aec6ff]' },
          { label: 'EXACT SCORES', value: stats?.exact_scores ?? 0, color: 'text-[var(--color-text-primary)]' },
          { label: 'CORRECT RESULTS', value: stats?.correct_results ?? 0, color: 'text-[var(--color-text-primary)]' },
          { label: 'PREDICTIONS', value: stats?.total_preds ?? 0, color: 'text-[var(--color-text-secondary)]' },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-2xl p-5 text-center">
            <div className="text-xs font-[var(--font-jetbrains)] tracking-widest uppercase text-[var(--color-text-secondary)] mb-2">{s.label}</div>
            <div className={`font-[var(--font-anybody)] font-extrabold text-[40px] ${s.color} [font-variation-settings:'wdth'_100]`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Recent predictions */}
      {recentPreds && recentPreds.length > 0 && (
        <div>
          <h2 className="font-[var(--font-anybody)] font-bold text-2xl text-[var(--color-text-primary)] mb-5 [font-variation-settings:'wdth'_100]">Recent Predictions</h2>
          <div className="space-y-2">
            {recentPreds.map(p => {
              const match = p.matches as any
              const pts = p.points_awarded
              return (
                <div key={p.id} className="glass-card rounded-xl px-5 py-4 flex items-center gap-4">
                  <div className="flex-1 text-sm text-[var(--color-text-primary)]">{match?.home_team_name} vs {match?.away_team_name}</div>
                  <div className="text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide">
                    Prediction: <span className="text-[var(--color-text-primary)] font-bold">{p.predicted_home}–{p.predicted_away}</span>
                  </div>
                  {match?.home_score != null && (
                    <div className="text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide">
                      Result: <span className="text-[var(--color-text-primary)] font-bold">{match.home_score}–{match.away_score}</span>
                    </div>
                  )}
                  <span className={`font-[var(--font-anybody)] font-bold text-sm w-8 text-right [font-variation-settings:'wdth'_100] ${pts === 3 ? 'text-[#aec6ff]' : pts === 1 ? 'text-[#ffb4a9]' : 'text-[var(--color-text-muted)]'}`}>
                    +{pts}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
