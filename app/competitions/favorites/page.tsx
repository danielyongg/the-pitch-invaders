export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MatchCard from '@/components/matches/MatchCard'
import LivePoller from '@/components/matches/LivePoller'
import { COMPETITIONS } from '@/lib/competitions'

interface Props {
  searchParams: Promise<{ filter?: string; value?: string }>
}

const NOT_LIVE_STATUSES = ['NS', 'FT', 'AET', 'PEN', 'CANC', 'PST']
const isLive = (status: string) => !NOT_LIVE_STATUSES.includes(status)

const PILL = (active: boolean) =>
  `flex-shrink-0 px-5 py-2 rounded-full text-sm font-[var(--font-jetbrains)] tracking-wide transition ${
    active
      ? 'bg-[#aec6ff] text-[#002e6a] shadow-[0px_6px_12px_-3px_rgba(174,198,255,0.25)]'
      : 'bg-[var(--color-input)] border border-[var(--glass-05)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-strong)]'
  }`

export default async function FavoritesPage({ searchParams }: Props) {
  const { filter, value } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('favorite_team_names, favorite_league_ids')
    .eq('id', user.id)
    .maybeSingle()
  const favoriteTeams: string[] = profile?.favorite_team_names ?? []
  const favoriteLeagues: number[] = profile?.favorite_league_ids ?? []
  const favoriteCompetitions = COMPETITIONS.filter(c => favoriteLeagues.includes(c.id))

  if (!favoriteTeams.length && !favoriteLeagues.length) redirect('/competitions')

  let query = supabase.from('matches').select('*').order('kickoff_time', { ascending: true }).limit(1000)

  if (filter === 'team') {
    const names = value ? [value] : favoriteTeams
    const quoted = names.map(t => `"${t.replace(/"/g, '\\"')}"`).join(',')
    query = query.or(names.length ? `home_team_name.in.(${quoted}),away_team_name.in.(${quoted})` : 'id.eq.00000000-0000-0000-0000-000000000000')
  } else if (filter === 'competition') {
    const leagueIds = value ? [parseInt(value)] : favoriteLeagues
    query = query.in('league_id', leagueIds.length ? leagueIds : [-1])
  } else {
    const quoted = favoriteTeams.map(t => `"${t.replace(/"/g, '\\"')}"`).join(',')
    const orParts: string[] = []
    if (favoriteTeams.length) orParts.push(`home_team_name.in.(${quoted})`, `away_team_name.in.(${quoted})`)
    if (favoriteLeagues.length) orParts.push(`league_id.in.(${favoriteLeagues.join(',')})`)
    query = query.or(orParts.length ? orParts.join(',') : 'id.eq.00000000-0000-0000-0000-000000000000')
  }

  const { data: rawMatches } = await query

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

  let predictionsMap: Record<string, { predicted_home: number; predicted_away: number; points_awarded: number | null }> = {}
  const { data: preds } = await supabase
    .from('predictions')
    .select('match_id, predicted_home, predicted_away, points_awarded')
    .eq('user_id', user.id)
  if (preds) predictionsMap = Object.fromEntries(preds.map(p => [p.match_id, p]))

  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      <LivePoller />
      <div className="mb-8">
        <h1 className="font-[var(--font-anybody)] font-extrabold text-[40px] text-[var(--color-text-primary)] tracking-[-1px] [font-variation-settings:'wdth'_100]">
          ★ Favorites
        </h1>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none mb-8">
        <a href="/competitions/favorites" className={PILL(!filter)}>All</a>
        {favoriteTeams.map(t => (
          <a key={t} href={`/competitions/favorites?filter=team&value=${encodeURIComponent(t)}`} className={PILL(filter === 'team' && value === t)}>
            {t}
          </a>
        ))}
        {favoriteCompetitions.map(c => (
          <a key={c.id} href={`/competitions/favorites?filter=competition&value=${c.id}`} className={PILL(filter === 'competition' && value === String(c.id))}>
            {c.name}
          </a>
        ))}
      </div>

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
                  <MatchCard key={match.id} match={match} prediction={predictionsMap[match.id] as any} userId={user.id} />
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {restMatches.map(match => (
              <MatchCard key={match.id} match={match} prediction={predictionsMap[match.id] as any} userId={user.id} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
