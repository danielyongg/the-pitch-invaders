export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MatchCard from '@/components/matches/MatchCard'

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
        <h1 className="font-[var(--font-anybody)] font-extrabold text-[40px] text-[#e1e2ec] tracking-[-1px] [font-variation-settings:'wdth'_100]">My Predictions</h1>
        <p className="text-[#c3c6d3] mt-1">Track your picks and points</p>
      </div>

      {/* Stats bento */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {[
          { label: 'TOTAL POINTS', value: totalPoints, color: 'text-[#aec6ff]', sub: `${pointsThisWeek >= 0 ? '+' : ''}${pointsThisWeek} this week` },
          { label: 'EXACT SCORES', value: exactScores, color: 'text-[#e1e2ec]', sub: 'Perfect predictions' },
          { label: 'CORRECT RESULTS', value: correctResults, color: 'text-[#e1e2ec]', sub: 'Right outcome' },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-2xl p-6">
            <div className="text-xs font-[var(--font-jetbrains)] tracking-widest uppercase text-[#c3c6d3] mb-2">{s.label}</div>
            <div className={`font-[var(--font-anybody)] font-extrabold text-[48px] ${s.color} [font-variation-settings:'wdth'_100]`}>{s.value}</div>
            <div className="text-sm text-[#c3c6d3] font-[var(--font-jetbrains)] mt-2">{s.sub}</div>
          </div>
        ))}
      </div>

      {upcoming.length > 0 && (
        <section className="mb-10">
          <h2 className="font-[var(--font-anybody)] font-bold text-2xl text-[#e1e2ec] mb-5 [font-variation-settings:'wdth'_100]">Upcoming Predictions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcoming.map(p => (
              <MatchCard key={p.id} match={p.matches as any} prediction={p as any} userId={user.id} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="font-[var(--font-anybody)] font-bold text-2xl text-[#e1e2ec] mb-5 [font-variation-settings:'wdth'_100]">Prediction History</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {past.map(p => (
              <MatchCard key={p.id} match={p.matches as any} prediction={p as any} userId={user.id} />
            ))}
          </div>
        </section>
      )}

      {predictions?.length === 0 && (
        <div className="text-center py-20 text-[#c3c6d3]">
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-[#e1e2ec] font-medium mb-2">No predictions yet</p>
          <a href="/matches" className="mt-3 inline-block text-[#aec6ff] hover:text-[#c8d8ff] font-[var(--font-jetbrains)] tracking-wide text-sm">
            Browse matches →
          </a>
        </div>
      )}
    </div>
  )
}
