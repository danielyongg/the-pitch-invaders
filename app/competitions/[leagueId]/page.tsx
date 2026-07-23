export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import MatchCardSwitch from '@/components/matches/MatchCardSwitch'
import LivePoller from '@/components/matches/LivePoller'
import { fixturesModeFor, paginateFixtures, paramNameFor } from '@/lib/fixtures-pagination'

interface Props {
  params: Promise<{ leagueId: string }>
  searchParams: Promise<{ stage?: string; matchday?: string }>
}

// Anything that isn't scheduled, finished, or called off is live — covers
// provider-specific in-progress text too ("HT", "46'", "2nd Half", etc.)
const NOT_LIVE_STATUSES = ['NS', 'FT', 'AET', 'PEN', 'CANC', 'PST']
const isLive = (status: string) => !NOT_LIVE_STATUSES.includes(status)

export default async function CompetitionFixturesPage({ params, searchParams }: Props) {
  const { leagueId } = await params
  const id = Number(leagueId)
  const { stage, matchday } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: rawMatches } = await supabase
    .from('matches')
    .select('*')
    .eq('league_id', id)
    .order('kickoff_time', { ascending: true })
    .limit(1000)

  // Sort: live first → upcoming asc → finished desc.
  const matches = (rawMatches ?? []).sort((a, b) => {
    const aLive = isLive(a.status)
    const bLive = isLive(b.status)
    const aFinished = a.status === 'FT' || a.status === 'AET' || a.status === 'PEN'
    const bFinished = b.status === 'FT' || b.status === 'AET' || b.status === 'PEN'

    if (aLive && !bLive) return -1
    if (!aLive && bLive) return 1

    if (!aFinished && !bFinished) return new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
    if (aFinished && bFinished) return new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime()
    if (!aFinished && bFinished) return -1
    return 1
  })

  const liveMatches = matches.filter(m => isLive(m.status))
  const restMatches = matches.filter(m => !isLive(m.status))

  const mode = fixturesModeFor(id)
  const paramName = paramNameFor(mode)
  const { groups, defaultIdx } = paginateFixtures(mode, restMatches)

  const paramValue = mode === 'stage' ? stage : matchday
  const paramIdx = paramValue ? groups.findIndex(g => g.id === paramValue) : -1
  const selectedIdx = paramIdx >= 0 ? paramIdx : defaultIdx
  const selectedGroup = groups[selectedIdx]

  const hrefFor = (groupId: string) => `/competitions/${id}?${paramName}=${encodeURIComponent(groupId)}`

  let predictionsMap: Record<string, { predicted_home: number; predicted_away: number; points_awarded: number | null }> = {}
  if (user) {
    const { data: preds } = await supabase
      .from('predictions')
      .select('match_id, predicted_home, predicted_away, predicted_winner_side, predicted_margin_bucket, points_awarded')
      .eq('user_id', user.id)
    if (preds) predictionsMap = Object.fromEntries(preds.map(p => [p.match_id, p]))
  }

  return (
    <div>
      <LivePoller hasLiveMatch={liveMatches.length > 0} />

      {!matches.length ? (
        <div className="text-center py-20 text-[var(--color-text-secondary)]">
          <div className="text-4xl mb-3">📅</div>
          <p>No matches found</p>
        </div>
      ) : (
        <>
          {liveMatches.length > 0 && (
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffb4a9] animate-pulse" />
                <h2 className="font-[var(--font-anybody)] font-extrabold text-2xl text-[var(--color-live-text)] [font-variation-settings:'wdth'_100]">
                  Live Now
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {liveMatches.map(match => (
                  <MatchCardSwitch key={match.id} match={match} prediction={predictionsMap[match.id] as any} userId={user?.id} />
                ))}
              </div>
            </section>
          )}

          {selectedGroup && (
            <div>
              <div className="flex items-center justify-between mb-5">
                {selectedIdx > 0 ? (
                  <a href={hrefFor(groups[selectedIdx - 1].id)} className="px-4 py-2 rounded-full text-sm font-[var(--font-jetbrains)] tracking-wide bg-[var(--color-input)] border border-[var(--glass-05)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-strong)]">
                    ← Previous
                  </a>
                ) : (
                  <span className="px-4 py-2 rounded-full text-sm font-[var(--font-jetbrains)] tracking-wide bg-[var(--color-input)] border border-[var(--glass-05)] text-[var(--color-text-secondary)] opacity-30">
                    ← Previous
                  </span>
                )}
                <span className="text-sm text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide">
                  {selectedGroup.label}
                </span>
                {selectedIdx < groups.length - 1 ? (
                  <a href={hrefFor(groups[selectedIdx + 1].id)} className="px-4 py-2 rounded-full text-sm font-[var(--font-jetbrains)] tracking-wide bg-[var(--color-input)] border border-[var(--glass-05)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-strong)]">
                    Next →
                  </a>
                ) : (
                  <span className="px-4 py-2 rounded-full text-sm font-[var(--font-jetbrains)] tracking-wide bg-[var(--color-input)] border border-[var(--glass-05)] text-[var(--color-text-secondary)] opacity-30">
                    Next →
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedGroup.matches.map(match => (
                  <MatchCardSwitch key={match.id} match={match} prediction={predictionsMap[match.id] as any} userId={user?.id} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
