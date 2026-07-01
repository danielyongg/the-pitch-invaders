export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import MatchCard from '@/components/matches/MatchCard'
import CascadingFilter from '@/components/matches/CascadingFilter'
import LivePoller from '@/components/matches/LivePoller'
import { COMPETITIONS } from '@/lib/competitions'
import { Suspense } from 'react'

const COUNTRY_TO_LEAGUES: Record<string, number[]> = {
  international: [77],
  england: [47],
  spain: [87],
  germany: [54],
  italy: [55],
  france: [53],
}

interface Props {
  searchParams: Promise<{ country?: string; tournament?: string; phase?: string }>
}

export default async function MatchesPage({ searchParams }: Props) {
  const { country, tournament, phase } = await searchParams
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
  const favoriteCompetitions = COMPETITIONS.filter(c => favoriteLeagues.includes(c.id))

  let query = supabase
    .from('matches')
    .select('*')
    .limit(200)

  if (country === 'favorites') {
    if (tournament === 'teams') {
      const names = phase ? [phase] : favoriteTeams
      const quoted = names.map(t => `"${t.replace(/"/g, '\\"')}"`).join(',')
      query = query.or(
        names.length
          ? `home_team_name.in.(${quoted}),away_team_name.in.(${quoted})`
          : 'id.eq.00000000-0000-0000-0000-000000000000'
      )
    } else if (tournament === 'competitions') {
      const leagueIds = phase ? [parseInt(phase)] : favoriteLeagues
      query = query.in('league_id', leagueIds.length ? leagueIds : [-1])
    } else {
      const quoted = favoriteTeams.map(t => `"${t.replace(/"/g, '\\"')}"`).join(',')
      const orParts: string[] = []
      if (favoriteTeams.length) orParts.push(`home_team_name.in.(${quoted})`, `away_team_name.in.(${quoted})`)
      if (favoriteLeagues.length) orParts.push(`league_id.in.(${favoriteLeagues.join(',')})`)
      query = query.or(orParts.length ? orParts.join(',') : 'id.eq.00000000-0000-0000-0000-000000000000')
    }
  } else if (tournament) {
    query = query.eq('league_id', parseInt(tournament))
  } else if (country && country !== 'all') {
    const leagueIds = COUNTRY_TO_LEAGUES[country] ?? []
    if (leagueIds.length > 0) query = query.in('league_id', leagueIds)
  }

  // Filter by phase (round) if selected — not applicable to favorites, where
  // "phase" means a specific favorite team/competition instead.
  if (phase && country !== 'favorites') {
    query = query.eq('round', phase)
  }

  const { data: rawMatches } = await query

  const { data: leagueRows } = await supabase.from('matches').select('league_id')
  const availableLeagueIds = Array.from(new Set((leagueRows ?? []).map(r => r.league_id)))

  const isFavorite = (m: { home_team_name: string; away_team_name: string; league_id: number }) =>
    favoriteTeams.includes(m.home_team_name) || favoriteTeams.includes(m.away_team_name) ||
    favoriteLeagues.includes(m.league_id)

  const now = new Date()
  const LIVE_STATUSES = ['1H','HT','2H','ET','BT','P','LIVE']

  // Sort: live first → upcoming asc → finished desc, favorites first within each tier
  const matches = (rawMatches ?? []).sort((a, b) => {
    const aLive = LIVE_STATUSES.includes(a.status)
    const bLive = LIVE_STATUSES.includes(b.status)
    const aFinished = a.status === 'FT' || a.status === 'AET' || a.status === 'PEN'
    const bFinished = b.status === 'FT' || b.status === 'AET' || b.status === 'PEN'

    if (aLive && !bLive) return -1
    if (!aLive && bLive) return 1

    const aFav = isFavorite(a)
    const bFav = isFavorite(b)
    if (aFav && !bFav) return -1
    if (!aFav && bFav) return 1

    if (!aFinished && !bFinished) return new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
    if (aFinished && bFinished) return new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime()
    if (!aFinished && bFinished) return -1
    return 1
  })

  let predictionsMap: Record<string, { predicted_home: number; predicted_away: number; points_awarded: number | null }> = {}
  if (user && matches?.length) {
    const { data: preds } = await supabase
      .from('predictions')
      .select('match_id, predicted_home, predicted_away, points_awarded')
      .eq('user_id', user.id)
      .in('match_id', matches.map(m => m.id))
    if (preds) predictionsMap = Object.fromEntries(preds.map(p => [p.match_id, p]))
  }

  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      <LivePoller />
      <div className="mb-8">
        <h1 className="font-[var(--font-anybody)] font-extrabold text-[40px] text-[#e1e2ec] tracking-[-1px] [font-variation-settings:'wdth'_100]">
          Match Predictor
        </h1>
        <p className="text-[#c3c6d3] mt-1">Lock in your scores for this week's fixtures. Precision is everything.</p>
      </div>

      <div className="mb-8">
        <Suspense>
          <CascadingFilter availableLeagueIds={availableLeagueIds} favoriteTeamNames={favoriteTeams} favoriteCompetitions={favoriteCompetitions} />
        </Suspense>
      </div>

      {!matches?.length ? (
        <div className="text-center py-20 text-[#c3c6d3]">
          <div className="text-4xl mb-3">📅</div>
          <p>No matches found</p>
          {(tournament || country) && (
            <p className="text-sm mt-2">
              Try selecting another league or{' '}
              <a href="/matches" className="text-[#aec6ff] hover:text-[#c8d8ff]">view all leagues</a>
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {matches.map(match => (
            <MatchCard
              key={match.id}
              match={match}
              prediction={predictionsMap[match.id] as any}
              userId={user?.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
