export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MatchCardSwitch from '@/components/matches/MatchCardSwitch'
import { COMPETITIONS } from '@/lib/competitions'

export default async function PredictPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?redirectTo=/predict')

  const { data: predictions } = await supabase
    .from('predictions')
    .select(`*, matches (*)`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const totalPoints = predictions?.reduce((sum, p) => sum + (p.points_awarded ?? 0), 0) ?? 0
  const exactScores = predictions?.filter(p => p.points_awarded === 3).length ?? 0
  const correctResults = predictions?.filter(p => (p.points_awarded ?? 0) >= 1).length ?? 0

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const pointsThisWeek = predictions
    ?.filter(p => new Date(p.created_at) >= weekAgo)
    .reduce((sum, p) => sum + (p.points_awarded ?? 0), 0) ?? 0

  const totalPredictions = predictions?.length ?? 0
  const scoredPredictions = predictions?.filter(p => p.points_awarded != null).length ?? 0
  const exactRate = scoredPredictions ? Math.round((exactScores / scoredPredictions) * 100) : 0
  const correctRate = scoredPredictions ? Math.round((correctResults / scoredPredictions) * 100) : 0

  const leagueCounts: Record<number, number> = {}
  for (const p of predictions ?? []) {
    const leagueId = (p.matches as any)?.league_id
    if (leagueId != null) leagueCounts[leagueId] = (leagueCounts[leagueId] ?? 0) + 1
  }
  const topLeagueId = Object.keys(leagueCounts).sort((a, b) => leagueCounts[+b] - leagueCounts[+a])[0]
  const topLeague = topLeagueId ? (COMPETITIONS.find(c => c.id === +topLeagueId)?.name ?? 'Unknown') : '—'

  const upcoming = predictions?.filter(p => {
    const m = p.matches as any
    return m && new Date(m.kickoff_time) > new Date()
  }) ?? []
  const past = predictions?.filter(p => {
    const m = p.matches as any
    return m && new Date(m.kickoff_time) <= new Date()
  }) ?? []

  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      <div className="mb-8">
        <h1 className="font-[var(--font-anybody)] font-extrabold text-[40px] text-[var(--color-text-primary)] tracking-[-1px] [font-variation-settings:'wdth'_100]">My Predictions</h1>
        <p className="text-[var(--color-text-secondary)] mt-1">Track your picks and points</p>
      </div>

      {/* Stats bento */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
        {[
          { label: 'TOTAL POINTS', value: totalPoints, color: 'text-[var(--color-accent-text)]', sub: `${pointsThisWeek >= 0 ? '+' : ''}${pointsThisWeek} this week`, wide: true },
          { label: 'EXACT SCORES', value: exactScores, color: 'text-[var(--color-text-primary)]', sub: `${exactRate}% win rate` },
          { label: 'CORRECT RESULTS', value: correctResults, color: 'text-[var(--color-text-primary)]', sub: `${correctRate}% win rate` },
        ].map(s => (
          <div key={s.label} className={`glass-card rounded-2xl p-6 ${s.wide ? 'col-span-2 sm:col-span-1' : ''}`}>
            <div className="text-xs font-[var(--font-jetbrains)] tracking-widest uppercase text-[var(--color-text-secondary)] mb-2 leading-tight min-h-[2em]">{s.label}</div>
            <div className={`font-[var(--font-anybody)] font-extrabold text-[48px] ${s.color} [font-variation-settings:'wdth'_100]`}>{s.value}</div>
            <div className="text-sm text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] mt-2">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="glass-card rounded-2xl p-6 mb-10">
        <div className="text-xs font-[var(--font-jetbrains)] tracking-widest uppercase text-[var(--color-text-secondary)] mb-4">Prediction Activity</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { label: 'Made', value: totalPredictions },
            { label: 'Results In', value: scoredPredictions },
            { label: 'Most Predicted League', value: topLeague, wide: true },
          ].map(s => (
            <div key={s.label} className={s.wide ? 'col-span-2 sm:col-span-1' : ''}>
              <div className={`font-[var(--font-anybody)] font-extrabold text-[var(--color-text-primary)] [font-variation-settings:'wdth'_100] ${s.wide ? 'text-xl sm:text-[32px]' : 'text-[32px]'}`}>{s.value}</div>
              <div className="text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {upcoming.length > 0 && (
        <section className="mb-10">
          <h2 className="font-[var(--font-anybody)] font-bold text-2xl text-[var(--color-text-primary)] mb-5 [font-variation-settings:'wdth'_100]">Upcoming Predictions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcoming.map(p => (
              <MatchCardSwitch key={p.id} match={p.matches as any} prediction={p as any} userId={user.id} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="font-[var(--font-anybody)] font-bold text-2xl text-[var(--color-text-primary)] mb-5 [font-variation-settings:'wdth'_100]">Prediction History</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {past.map(p => (
              <MatchCardSwitch key={p.id} match={p.matches as any} prediction={p as any} userId={user.id} />
            ))}
          </div>
        </section>
      )}

      {predictions?.length === 0 && (
        <div className="text-center py-20 text-[var(--color-text-secondary)]">
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-[var(--color-text-primary)] font-medium mb-2">No predictions yet</p>
          <a href="/competitions" className="mt-3 inline-block text-[var(--color-accent-text)] hover:text-[var(--color-accent-hover)] font-[var(--font-jetbrains)] tracking-wide text-sm">
            Browse matches →
          </a>
        </div>
      )}
    </div>
  )
}
