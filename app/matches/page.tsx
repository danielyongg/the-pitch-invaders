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

// World Cup 2026's fixed round sequence, in bracket order. Final and 3rd
// place share a page since they're both "the last stage" for pagination
// purposes.
const WC_STAGES: { id: string; label: string; rounds: string[] }[] = [
  { id: 'group', label: 'Group Stage', rounds: ['group'] },
  { id: 'round_of_32', label: 'Round of 32', rounds: ['round_of_32'] },
  { id: 'round_of_16', label: 'Round of 16', rounds: ['round_of_16'] },
  { id: 'quarterfinal', label: 'Quarterfinal', rounds: ['quarterfinal'] },
  { id: 'semifinal', label: 'Semifinal', rounds: ['semifinal'] },
  { id: 'final', label: 'Final & 3rd Place', rounds: ['final', 'third_place'] },
]

interface Props {
  searchParams: Promise<{ country?: string; tournament?: string; phase?: string; matchday?: string; stage?: string }>
}

export default async function MatchesPage({ searchParams }: Props) {
  const { country, tournament, phase, matchday: matchdayParam, stage: stageParam } = await searchParams
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

  // Was capped at 200 with no explicit order — fine when the app was
  // World Cup-only (~100 matches total), but once a full league season
  // (~380 matches) is in scope, an unordered cap silently truncates
  // wherever the DB happens to return rows, making the schedule look like
  // it stops mid-season. Order by kickoff first so any cap truncates at
  // the far future end instead, and raise the cap comfortably above a
  // single league's season size (Supabase's project-level row cap is
  // 1000, so that's the real ceiling regardless of what's requested here).
  let query = supabase
    .from('matches')
    .select('*')
    .order('kickoff_time', { ascending: true })
    .limit(1000)

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

  // Scanning select('league_id') across the whole table hits Supabase's
  // project-level max-rows cap (1000, not overridable via .limit()) once
  // total match count grows past it, silently dropping leagues from the
  // filter. Check each known league's existence directly instead — cheap
  // (a handful of limit(1) queries) and immune to the row cap.
  const leagueExistence = await Promise.all(
    COMPETITIONS.map(async c => {
      const { data } = await supabase.from('matches').select('id').eq('league_id', c.id).limit(1)
      return { id: c.id, exists: (data?.length ?? 0) > 0 }
    })
  )
  const availableLeagueIds = leagueExistence.filter(l => l.exists).map(l => l.id)

  // Anything that isn't scheduled, finished, or called off is live — covers
  // provider-specific in-progress text too ("HT", "46'", "2nd Half", etc.)
  const NOT_LIVE_STATUSES = ['NS', 'FT', 'AET', 'PEN', 'CANC', 'PST']
  const isLive = (status: string) => !NOT_LIVE_STATUSES.includes(status)

  // Sort: live first → upcoming asc → finished desc. Favorites are surfaced
  // via the dedicated ★ Favorites filter, not by bumping their sort order
  // here (2026-07-03, user feedback).
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

  // World Cup fixtures stay as one flat list (per user request, 2026-07-03) —
  // only league matches get paginated by week, since a full season is way
  // too long to scroll through in one page.
  const worldCupRest = restMatches.filter(m => m.league_id === 77)
  const leagueRest = restMatches.filter(m => m.league_id !== 77)

  const stagesPresent = WC_STAGES
    .map(s => ({ ...s, matches: worldCupRest.filter(m => s.rounds.includes(m.round ?? '')) }))
    .filter(s => s.matches.length > 0)
  const defaultStageIdx = stagesPresent.findIndex(s =>
    s.matches.some(m => m.status !== 'FT' && m.status !== 'AET' && m.status !== 'PEN')
  )
  const paramStageIdx = stageParam ? stagesPresent.findIndex(s => s.id === stageParam) : -1
  const selectedStageIdx = paramStageIdx >= 0 ? paramStageIdx : (defaultStageIdx >= 0 ? defaultStageIdx : stagesPresent.length - 1)
  const selectedStage = stagesPresent[selectedStageIdx]

  const stageHref = (stageId: string) => {
    const params = new URLSearchParams()
    if (country) params.set('country', country)
    if (tournament) params.set('tournament', tournament)
    params.set('stage', stageId)
    return `/matches?${params.toString()}`
  }

  // Group by matchday number (computed in sync-fixtures, since ESPN doesn't
  // expose an official gameweek). Not applicable to World Cup, whose
  // `round` field holds 'group'/'knockout' text instead.
  const matchdayGroups = new Map<number, typeof leagueRest>()
  for (const m of leagueRest) {
    const md = Number(m.round)
    if (!md) continue
    if (!matchdayGroups.has(md)) matchdayGroups.set(md, [])
    matchdayGroups.get(md)!.push(m)
  }
  const matchdays = Array.from(matchdayGroups.keys()).sort((a, b) => a - b)
  const defaultMatchday = matchdays.find(md =>
    matchdayGroups.get(md)!.some(m => m.status !== 'FT' && m.status !== 'AET' && m.status !== 'PEN')
  ) ?? matchdays[matchdays.length - 1]
  const selectedMatchday = matchdayParam && matchdayGroups.has(Number(matchdayParam))
    ? Number(matchdayParam)
    : defaultMatchday
  const selectedMatchdayIdx = selectedMatchday != null ? matchdays.indexOf(selectedMatchday) : -1
  const matchdayMatches = selectedMatchday != null ? matchdayGroups.get(selectedMatchday)! : []

  const matchdayHref = (md: number) => {
    const params = new URLSearchParams()
    if (country) params.set('country', country)
    if (tournament) params.set('tournament', tournament)
    if (phase) params.set('phase', phase)
    params.set('matchday', String(md))
    return `/matches?${params.toString()}`
  }

  let predictionsMap: Record<string, { predicted_home: number; predicted_away: number; points_awarded: number | null }> = {}
  if (user) {
    const { data: preds } = await supabase
      .from('predictions')
      .select('match_id, predicted_home, predicted_away, points_awarded')
      .eq('user_id', user.id)
    if (preds) predictionsMap = Object.fromEntries(preds.map(p => [p.match_id, p]))
  }

  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      <LivePoller />
      <div className="mb-8">
        <h1 className="font-[var(--font-anybody)] font-extrabold text-[40px] text-[var(--color-text-primary)] tracking-[-1px] [font-variation-settings:'wdth'_100]">
          Match Predictor
        </h1>
        <p className="text-[var(--color-text-secondary)] mt-1">Lock in your scores for this week's fixtures. Precision is everything.</p>
      </div>

      <div className="mb-8">
        <Suspense>
          <CascadingFilter availableLeagueIds={availableLeagueIds} favoriteTeamNames={favoriteTeams} favoriteCompetitions={favoriteCompetitions} />
        </Suspense>
      </div>

      {!matches?.length ? (
        <div className="text-center py-20 text-[var(--color-text-secondary)]">
          <div className="text-4xl mb-3">📅</div>
          <p>No matches found</p>
          {(tournament || country) && (
            <p className="text-sm mt-2">
              Try selecting another league or{' '}
              <a href="/matches" className="text-[var(--color-accent-text)] hover:text-[var(--color-accent-hover)]">view all leagues</a>
            </p>
          )}
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
                  <MatchCard
                    key={match.id}
                    match={match}
                    prediction={predictionsMap[match.id] as any}
                    userId={user?.id}
                  />
                ))}
              </div>
            </section>
          )}
          {selectedStage && (
            <div className="mb-10">
              <div className="flex items-center justify-between mb-5">
                {selectedStageIdx > 0 ? (
                  <a href={stageHref(stagesPresent[selectedStageIdx - 1].id)} className="px-4 py-2 rounded-full text-sm font-[var(--font-jetbrains)] tracking-wide bg-[var(--color-input)] border border-[var(--glass-05)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-strong)]">
                    ← Previous
                  </a>
                ) : (
                  <span className="px-4 py-2 rounded-full text-sm font-[var(--font-jetbrains)] tracking-wide bg-[var(--color-input)] border border-[var(--glass-05)] text-[var(--color-text-secondary)] opacity-30">
                    ← Previous
                  </span>
                )}
                <span className="text-sm text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide">
                  {selectedStage.label}
                </span>
                {selectedStageIdx < stagesPresent.length - 1 ? (
                  <a href={stageHref(stagesPresent[selectedStageIdx + 1].id)} className="px-4 py-2 rounded-full text-sm font-[var(--font-jetbrains)] tracking-wide bg-[var(--color-input)] border border-[var(--glass-05)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-strong)]">
                    Next →
                  </a>
                ) : (
                  <span className="px-4 py-2 rounded-full text-sm font-[var(--font-jetbrains)] tracking-wide bg-[var(--color-input)] border border-[var(--glass-05)] text-[var(--color-text-secondary)] opacity-30">
                    Next →
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedStage.matches.map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    prediction={predictionsMap[match.id] as any}
                    userId={user?.id}
                  />
                ))}
              </div>
            </div>
          )}

          {leagueRest.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-5">
                {selectedMatchdayIdx > 0 ? (
                  <a href={matchdayHref(matchdays[selectedMatchdayIdx - 1])} className="px-4 py-2 rounded-full text-sm font-[var(--font-jetbrains)] tracking-wide bg-[var(--color-input)] border border-[var(--glass-05)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-strong)]">
                    ← Previous
                  </a>
                ) : (
                  <span className="px-4 py-2 rounded-full text-sm font-[var(--font-jetbrains)] tracking-wide bg-[var(--color-input)] border border-[var(--glass-05)] text-[var(--color-text-secondary)] opacity-30">
                    ← Previous
                  </span>
                )}
                <span className="text-sm text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide">
                  {selectedMatchday != null && `Matchday ${selectedMatchday}`}
                </span>
                {selectedMatchdayIdx >= 0 && selectedMatchdayIdx < matchdays.length - 1 ? (
                  <a href={matchdayHref(matchdays[selectedMatchdayIdx + 1])} className="px-4 py-2 rounded-full text-sm font-[var(--font-jetbrains)] tracking-wide bg-[var(--color-input)] border border-[var(--glass-05)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-strong)]">
                    Next →
                  </a>
                ) : (
                  <span className="px-4 py-2 rounded-full text-sm font-[var(--font-jetbrains)] tracking-wide bg-[var(--color-input)] border border-[var(--glass-05)] text-[var(--color-text-secondary)] opacity-30">
                    Next →
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {matchdayMatches.map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    prediction={predictionsMap[match.id] as any}
                    userId={user?.id}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
