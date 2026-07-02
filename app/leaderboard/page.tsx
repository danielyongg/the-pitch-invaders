export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import type { LeaderboardEntry } from '@/lib/supabase/types'
import Avatar from '@/components/ui/Avatar'

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: rawEntries } = await supabase
    .from('leaderboard_cache')
    .select('*')
    .order('total_points', { ascending: false })
    .order('exact_scores', { ascending: false })
    .limit(100)
  const entries = rawEntries as LeaderboardEntry[] | null

  const top3 = entries?.slice(0, 3) ?? []
  const rest = entries?.slice(3) ?? []

  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-10">
        <div>
          <h1 className="font-[var(--font-anybody)] font-bold text-[28px] sm:text-[40px] text-[var(--color-accent-text)] [font-variation-settings:'wdth'_100]">Global Leaderboard</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">Track the world&apos;s most accurate sports predictors. Rise through the ranks.</p>
        </div>
        <div className="flex gap-3">
          <div className="glass-card px-6 py-3 rounded-lg flex items-center gap-2">
            <span className="text-[var(--color-text-primary)] text-sm font-[var(--font-jetbrains)] tracking-widest uppercase">Season 4</span>
          </div>
        </div>
      </div>

      {!entries?.length ? (
        <div className="text-center py-20 text-[var(--color-text-secondary)]">
          <div className="text-4xl mb-3">🏆</div>
          <p>No data yet. Be the first to predict!</p>
        </div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {top3.length >= 3 && (
            <div className="flex gap-2 sm:gap-6 items-end justify-center mb-10">
              {/* Rank 2 */}
              <PodiumCard entry={top3[1]} rank={2} rankColor="#94a3b8" />
              {/* Rank 1 — elevated */}
              <div className="scale-105">
                <PodiumCard entry={top3[0]} rank={1} rankColor="#aec6ff" isChampion />
              </div>
              {/* Rank 3 */}
              <PodiumCard entry={top3[2]} rank={3} rankColor="#cd7f32" />
            </div>
          )}

          {/* Full table */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-8 py-5 border-b border-[var(--color-border)] bg-[rgba(174,198,255,0.12)]">
              <h2 className="font-[var(--font-anybody)] font-semibold text-[24px] text-[var(--color-text-primary)] [font-variation-settings:'wdth'_100]">All Ranks</h2>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[32px_1fr_60px] sm:grid-cols-[80px_1fr_100px_100px_80px] gap-2 sm:gap-4 px-4 sm:px-8 py-4 text-xs font-[var(--font-jetbrains)] tracking-widest uppercase text-[var(--color-text-secondary)] border-b border-[var(--color-border)] bg-[rgba(174,198,255,0.06)]">
              <span>Rank</span>
              <span>Predictor</span>
              <span className="text-center">Points</span>
              <span className="text-center hidden sm:block">Exact</span>
              <span className="text-center hidden sm:block">Preds</span>
            </div>

            {entries.map((entry, idx) => {
              const rank = idx + 1
              const isMe = entry.user_id === user?.id
              return (
                <div
                  key={entry.user_id}
                  className={`grid grid-cols-[32px_1fr_60px] sm:grid-cols-[80px_1fr_100px_100px_80px] gap-2 sm:gap-4 px-4 sm:px-8 py-5 items-center border-b border-[var(--glass-05)] last:border-0 transition ${
                    isMe ? 'bg-[rgba(174,198,255,0.05)] border-l-2 border-l-[#aec6ff]' : 'hover:bg-[var(--glass-03)]'
                  }`}
                >
                  <span className="font-[var(--font-anybody)] text-base sm:text-xl text-[var(--color-text-secondary)] [font-variation-settings:'wdth'_100]">
                    {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : String(rank).padStart(2, '0')}
                  </span>
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className="hidden sm:block">
                      <Avatar url={entry.avatar_url} username={entry.username} size={40} />
                    </div>
                    <div className="min-w-0">
                      <div className={`text-sm font-bold truncate ${isMe ? 'text-[var(--color-accent-text)]' : 'text-[var(--color-text-primary)]'}`}>
                        {entry.username}
                        {isMe && <span className="text-xs text-[var(--color-text-muted)] ml-1 font-normal">(you)</span>}
                      </div>
                    </div>
                  </div>
                  <span className="font-[var(--font-anybody)] text-base sm:text-xl font-bold text-[var(--color-accent-text)] text-center [font-variation-settings:'wdth'_100]">{entry.total_points}</span>
                  <span className="text-sm text-[var(--color-text-secondary)] text-center hidden sm:block">{entry.exact_scores}</span>
                  <span className="text-sm text-[var(--color-text-muted)] text-center hidden sm:block">{entry.total_preds}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function PodiumCard({ entry, rank, rankColor, isChampion }: {
  entry: LeaderboardEntry; rank: number; rankColor: string; isChampion?: boolean;
}) {
  const gradientTop = rank === 1
    ? 'from-[#aec6ff] to-[#ffb4a9]'
    : rank === 2
    ? 'via-[#94a3b8]'
    : 'via-[#cd7f32]'

  return (
    <div className={`glass-card rounded-2xl overflow-hidden relative w-[30vw] sm:w-72 ${isChampion ? 'shadow-[0px_0px_0px_2px_rgba(174,198,255,0.3),0px_25px_50px_-12px_rgba(174,198,255,0.1)]' : ''}`}>
      <div className={`h-1 w-full ${rank === 1 ? `bg-gradient-to-r ${gradientTop}` : `bg-gradient-to-r from-transparent ${gradientTop} to-transparent`}`} />

      {/* Rank badge */}
      <div
        className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full flex items-center justify-center font-bold text-[var(--color-text-primary)]"
        style={{ background: rankColor, width: isChampion ? 56 : 40, height: isChampion ? 56 : 40, fontSize: isChampion ? 24 : 20 }}
      >
        {rank}
      </div>

      <div className="p-3 pt-6 sm:p-8 sm:pt-10 text-center">
        <div className="mx-auto mb-2 sm:mb-4 rounded-full" style={{ border: `4px solid ${rankColor}40`, width: 'fit-content' }}>
          <Avatar url={entry.avatar_url} username={entry.username} size={isChampion ? 96 : 80} />
        </div>

        {isChampion && (
          <div className="text-[10px] sm:text-xs text-[#690001] bg-[#ffb4a9] font-bold px-2 py-1 rounded-full inline-block mb-2 font-[var(--font-jetbrains)] tracking-wide">
            CHAMPION
          </div>
        )}

        <div className={`font-[var(--font-anybody)] font-bold text-sm ${isChampion ? 'sm:text-[32px]' : 'sm:text-[24px]'} truncate [font-variation-settings:'wdth'_100]`}
          style={{ color: rank === 1 ? 'var(--color-accent-text)' : 'var(--color-text-primary)' }}>
          {entry.username}
        </div>
        <div className="hidden sm:block text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-widest uppercase mt-1">
          {rank === 1 ? 'Global Grandmaster' : rank === 2 ? 'Elite Predictor' : 'Rising Star'}
        </div>

        <div className={`border-t border-[var(--color-border)] mt-3 pt-3 sm:mt-6 sm:pt-6 grid grid-cols-2 gap-2 sm:gap-4`}>
          <div>
            <div className="text-[9px] sm:text-xs text-[var(--color-text-secondary)] uppercase font-[var(--font-jetbrains)] tracking-wide">Points</div>
            <div className={`font-[var(--font-anybody)] font-bold text-[var(--color-text-primary)] [font-variation-settings:'wdth'_100] text-lg ${isChampion ? 'sm:text-[40px]' : 'sm:text-[28px]'}`}>
              {entry.total_points}
            </div>
          </div>
          <div>
            <div className="text-[9px] sm:text-xs text-[var(--color-text-secondary)] uppercase font-[var(--font-jetbrains)] tracking-wide">Exact</div>
            <div className={`font-[var(--font-anybody)] font-bold [font-variation-settings:'wdth'_100] text-lg ${isChampion ? 'sm:text-[40px] text-[var(--color-live-text)]' : 'sm:text-[28px] text-[var(--color-accent-text)]'}`}>
              {entry.exact_scores}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
