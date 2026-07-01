export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function LeaguesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?redirectTo=/leagues')

  const { data: memberships } = await supabase
    .from('private_league_members')
    .select(`league_id, private_leagues (*)`)
    .eq('user_id', user.id)

  const leagues = memberships?.map(m => m.private_leagues).filter(Boolean) ?? []

  // Rank the user within each of their leagues, based on the same
  // leaderboard_cache ordering used on the league detail page.
  const leagueRanks = await Promise.all(
    leagues.map(async (league: any) => {
      const { data: members } = await supabase
        .from('private_league_members')
        .select('user_id')
        .eq('league_id', league.id)
      const memberIds = members?.map(m => m.user_id) ?? []
      const { data: standings } = await supabase
        .from('leaderboard_cache')
        .select('user_id')
        .in('user_id', memberIds)
        .order('total_points', { ascending: false })
        .order('exact_scores', { ascending: false })
      const rank = (standings?.findIndex(s => s.user_id === user.id) ?? -1) + 1
      return rank || null
    })
  )

  const ranked = leagueRanks.filter((r): r is number => r !== null)
  const trophies = ranked.filter(r => r === 1).length
  const avgRank = ranked.length ? Math.round(ranked.reduce((a, b) => a + b, 0) / ranked.length) : null

  const { data: globalStandings } = await supabase
    .from('leaderboard_cache')
    .select('user_id')
    .order('total_points', { ascending: false })
    .order('exact_scores', { ascending: false })
  const globalIdx = globalStandings?.findIndex(s => s.user_id === user.id) ?? -1
  const globalPercentile = globalIdx >= 0 && globalStandings?.length
    ? Math.max(1, Math.round(((globalStandings.length - globalIdx) / globalStandings.length) * 100))
    : null

  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
        <div>
          <h1 className="font-[var(--font-anybody)] font-bold text-[28px] sm:text-[40px] text-[#aec6ff] [font-variation-settings:'wdth'_100]">Private Leagues</h1>
          <p className="text-[#c3c6d3] mt-1">Manage your squads, track rankings, and invite the elite.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Invite Code"
              className="w-full bg-[#272a32] border border-[rgba(255,255,255,0.1)] text-[#e1e2ec] placeholder-[#6b7280] rounded-xl px-5 py-3 pr-12 font-[var(--font-jetbrains)] text-sm tracking-wide focus:outline-none focus:ring-2 focus:ring-[#aec6ff] focus:border-transparent"
            />
          </div>
          <Link
            href="/leagues/join"
            className="text-center bg-[#272a32] border border-[rgba(255,255,255,0.1)] text-[#e1e2ec] text-sm font-[var(--font-jetbrains)] tracking-wide px-5 py-3 rounded-xl transition hover:bg-[#32353d]"
          >
            Join League
          </Link>
          <Link
            href="/leagues/create"
            className="justify-center bg-[#aec6ff] hover:bg-[#c8d8ff] text-[#002e6a] text-sm font-bold font-[var(--font-anybody)] [font-variation-settings:'wdth'_100] tracking-wide px-6 py-3 rounded-xl transition flex items-center gap-2"
          >
            + START YOUR LEAGUE
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* League list — 2 cols */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-5">
            <h2 className="font-[var(--font-anybody)] font-semibold text-2xl text-[#e1e2ec] [font-variation-settings:'wdth'_100]">My Leagues</h2>
            {leagues.length > 0 && (
              <span className="bg-[rgba(174,198,255,0.1)] text-[#aec6ff] text-xs font-[var(--font-jetbrains)] tracking-wide px-3 py-1 rounded-full">
                {leagues.length} ACTIVE
              </span>
            )}
          </div>

          {!leagues.length ? (
            <div className="text-center py-20 text-[#c3c6d3]">
              <div className="text-5xl mb-4">🏟️</div>
              <p className="text-[#e1e2ec] font-medium mb-2">No leagues yet</p>
              <p className="text-sm mb-8">Create a league or join one with an invite code</p>
              <div className="flex gap-3 justify-center">
                <Link href="/leagues/create" className="bg-[#aec6ff] hover:bg-[#c8d8ff] text-[#002e6a] font-bold font-[var(--font-anybody)] [font-variation-settings:'wdth'_100] px-6 py-3 rounded-xl transition">
                  Create a league
                </Link>
                <Link href="/leagues/join" className="bg-[#272a32] border border-[rgba(255,255,255,0.1)] text-[#e1e2ec] px-6 py-3 rounded-xl transition hover:bg-[#32353d]">
                  Join with code
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {leagues.map((league: any, idx: number) => {
                const rank = leagueRanks[idx]
                return (
                <Link
                  key={league.id}
                  href={`/leagues/${league.id}`}
                  className="glass-card hover:border-[rgba(174,198,255,0.2)] rounded-2xl p-4 sm:p-6 flex items-center gap-3 sm:gap-6 transition group block"
                >
                  <div className="hidden sm:flex w-16 h-16 rounded-xl bg-[#32353d] items-center justify-center text-2xl flex-shrink-0">
                    🏆
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-[var(--font-anybody)] font-semibold text-lg sm:text-2xl text-[#e1e2ec] group-hover:text-[#aec6ff] transition truncate [font-variation-settings:'wdth'_100]">
                      {league.name}
                    </h3>
                    <p className="text-sm text-[#c3c6d3] font-[var(--font-jetbrains)] tracking-wide mt-1">
                      Invite code: <span className="font-mono text-[#e1e2ec] tracking-widest">{league.invite_code}</span>
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-[#c3c6d3] font-[var(--font-jetbrains)] tracking-widest uppercase">Rank</div>
                    <div className="font-[var(--font-anybody)] font-bold text-2xl sm:text-[40px] text-[#aec6ff] [font-variation-settings:'wdth'_100]">
                      {rank ? `#${String(rank).padStart(2, '0')}` : '—'}
                    </div>
                  </div>
                  <div className="hidden sm:block border-l border-[rgba(255,255,255,0.05)] pl-6 flex-shrink-0">
                    <span className="text-[#c3c6d3] group-hover:text-[#aec6ff] transition">›</span>
                  </div>
                </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Stats */}
          <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
            <div className="text-xs font-[var(--font-jetbrains)] tracking-widest uppercase text-[#aec6ff] mb-4">League Stats</div>
            <div className="text-xs text-[#c3c6d3] font-[var(--font-jetbrains)]">Global Percentile</div>
            <div className="font-[var(--font-anybody)] font-extrabold text-[48px] text-[#e1e2ec] [font-variation-settings:'wdth'_100]">
              {globalPercentile ? `Top ${100 - globalPercentile + 1}%` : '—'}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="bg-[rgba(255,255,255,0.05)] rounded-xl p-4">
                <div className="text-xs text-[#c3c6d3] font-[var(--font-jetbrains)]">Trophies</div>
                <div className="font-[var(--font-anybody)] font-semibold text-2xl text-[#e1e2ec] [font-variation-settings:'wdth'_100]">{trophies}</div>
              </div>
              <div className="bg-[rgba(255,255,255,0.05)] rounded-xl p-4">
                <div className="text-xs text-[#c3c6d3] font-[var(--font-jetbrains)]">Avg Rank</div>
                <div className="font-[var(--font-anybody)] font-semibold text-2xl text-[#e1e2ec] [font-variation-settings:'wdth'_100]">
                  {avgRank ? `#${String(avgRank).padStart(2, '0')}` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Grow CTA */}
          <div className="bg-[#00408f] rounded-2xl p-6 relative overflow-hidden"
            style={{ background: 'linear-gradient(156deg, rgba(174,198,255,0.2) 0%, rgba(174,198,255,0) 100%), #00408f' }}>
            <h3 className="font-[var(--font-anybody)] font-semibold text-2xl text-[#8ab0ff] mb-3 [font-variation-settings:'wdth'_100]">Grow your team</h3>
            <p className="text-sm text-[rgba(138,176,255,0.8)] mb-5 leading-relaxed">
              Private leagues with 50+ members unlock exclusive Elite Badges.
            </p>
            <Link
              href="/leagues/create"
              className="bg-[#8ab0ff] hover:bg-[#aec6ff] text-[#00408f] font-bold font-[var(--font-anybody)] [font-variation-settings:'wdth'_100] text-sm tracking-widest uppercase px-6 py-3 rounded-xl transition inline-block"
            >
              Invite Friends
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
