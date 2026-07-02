export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import InviteCodeDisplay from '@/components/leagues/InviteCodeDisplay'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function LeagueDetailPage({ params }: Props) {
  const { leagueId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: league } = await supabase.from('private_leagues').select('*').eq('id', leagueId).single()
  if (!league) notFound()

  const { data: membership } = await supabase.from('private_league_members').select('id').eq('league_id', leagueId).eq('user_id', user.id).maybeSingle()
  if (!membership) redirect('/leagues')

  const { data: members } = await supabase.from('private_league_members').select('user_id, joined_at, profiles(username, avatar_url)').eq('league_id', leagueId)
  const memberIds = members?.map(m => m.user_id) ?? []

  const { data: leaderboard } = await supabase.from('leaderboard_cache').select('*').in('user_id', memberIds).order('total_points', { ascending: false }).order('exact_scores', { ascending: false })

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-8">
        <div className="min-w-0">
          <h1 className="font-[var(--font-anybody)] font-bold text-[28px] sm:text-[40px] text-[var(--color-text-primary)] break-words [font-variation-settings:'wdth'_100]">{league.name}</h1>
          <p className="text-[var(--color-text-secondary)] mt-1 font-[var(--font-jetbrains)] tracking-wide">
            {members?.length ?? 0} member{(members?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <InviteCodeDisplay code={league.invite_code} />
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--color-border)] bg-[rgba(25,27,35,0.5)]">
          <h2 className="font-[var(--font-anybody)] font-semibold text-xl text-[var(--color-text-primary)] [font-variation-settings:'wdth'_100]">League Standings</h2>
        </div>

        {!leaderboard?.length ? (
          <div className="text-center py-12 text-[var(--color-text-secondary)]">
            <p>No points yet. Start predicting!</p>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-[32px_1fr_60px] sm:grid-cols-[80px_1fr_100px_80px_80px] gap-2 sm:gap-4 px-4 sm:px-6 py-3 text-xs font-[var(--font-jetbrains)] tracking-widest uppercase text-[var(--color-text-secondary)] border-b border-[var(--color-border)] bg-[rgba(25,27,35,0.3)]">
              <span>#</span>
              <span>Player</span>
              <span className="text-center">Points</span>
              <span className="text-center hidden sm:block">Exact</span>
              <span className="text-center hidden sm:block">Preds</span>
            </div>
            {leaderboard.map((entry, idx) => {
              const rank = idx + 1
              const isMe = entry.user_id === user.id
              return (
                <div
                  key={entry.user_id}
                  className={`grid grid-cols-[32px_1fr_60px] sm:grid-cols-[80px_1fr_100px_80px_80px] gap-2 sm:gap-4 px-4 sm:px-6 py-4 items-center border-b border-[var(--glass-05)] last:border-0 transition ${
                    isMe ? 'bg-[rgba(174,198,255,0.05)] border-l-2 border-l-[#aec6ff]' : 'hover:bg-[var(--glass-03)]'
                  }`}
                >
                  <span className="font-[var(--font-anybody)] text-base sm:text-xl text-[var(--color-text-secondary)] [font-variation-settings:'wdth'_100]">
                    {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : String(rank).padStart(2, '0')}
                  </span>
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className="hidden sm:flex w-8 h-8 rounded-full bg-[var(--color-input)] border border-[rgba(174,198,255,0.2)] items-center justify-center text-sm font-bold text-[var(--color-text-primary)] flex-shrink-0">
                      {entry.username[0].toUpperCase()}
                    </div>
                    <span className={`text-sm font-medium truncate ${isMe ? 'text-[#aec6ff]' : 'text-[var(--color-text-primary)]'}`}>
                      {entry.username}
                      {isMe && <span className="text-xs text-[var(--color-text-muted)] ml-1">(you)</span>}
                    </span>
                  </div>
                  <span className="font-[var(--font-anybody)] text-base sm:text-xl font-bold text-[#aec6ff] text-center [font-variation-settings:'wdth'_100]">{entry.total_points}</span>
                  <span className="text-sm text-[var(--color-text-secondary)] text-center hidden sm:block">{entry.exact_scores}</span>
                  <span className="text-sm text-[var(--color-text-muted)] text-center hidden sm:block">{entry.total_preds}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
