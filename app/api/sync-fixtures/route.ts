import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapEspnStatus } from '@/lib/espn'

// ESPN's public (unofficial, no key needed) site API — confirmed 2026-07-03
// against live season data for all 5 leagues below.
const LEAGUES = [
  { id: 47, name: 'Premier League', slug: 'eng.1' },
  { id: 87, name: 'La Liga', slug: 'esp.1' },
  { id: 54, name: 'Bundesliga', slug: 'ger.1' },
  { id: 55, name: 'Serie A', slug: 'ita.1' },
  { id: 53, name: 'Ligue 1', slug: 'fra.1' },
]

// Wide enough to cover a full Aug–May European season in one request.
const SEASON_DATE_RANGE = '20260801-20270630'

// Club Friendlies: pre-season tours, no official ESPN league config — the
// scoreboard mixes clubs from every country/division. Wide enough to cover
// the WC 2026 aftermath through the last friendly before league kickoff.
const CLUB_FRIENDLY_ID = 100
const CLUB_FRIENDLY_SLUG = 'club.friendly'
const FRIENDLY_DATE_RANGE = '20260701-20260831'

// ESPN doesn't expose an official matchday/gameweek number for these
// leagues — reconstruct it by walking events in kickoff order and starting
// a new round whenever a team would otherwise appear twice in the same
// round. Assumes `events` is already sorted ascending by kickoff (true for
// ESPN's scoreboard response). Approximate: a fixture rescheduled far from
// its original round could throw this off, but there's no better signal available.
function assignMatchdays(events: any[]): Map<string, number> {
  const roundOf = new Map<string, number>()
  let round = 1
  let teamsInRound = new Set<string>()
  for (const e of events) {
    const comp = e.competitions[0]
    const homeId = comp.competitors.find((c: any) => c.homeAway === 'home')?.team?.id
    const awayId = comp.competitors.find((c: any) => c.homeAway === 'away')?.team?.id
    if (teamsInRound.has(homeId) || teamsInRound.has(awayId)) {
      round++
      teamsInRound = new Set()
    }
    teamsInRound.add(homeId)
    teamsInRound.add(awayId)
    roundOf.set(e.id, round)
  }
  return roundOf
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const leagueFilter = searchParams.get('league') // optional single internal league ID

  const supabase = createAdminClient()
  let upserted = 0
  const errors: string[] = []

  const leagues = leagueFilter
    ? LEAGUES.filter(l => l.id === Number(leagueFilter))
    : LEAGUES

  for (const league of leagues) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.slug}/scoreboard?dates=${SEASON_DATE_RANGE}&limit=1000`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) {
      errors.push(`League ${league.name}: HTTP ${res.status}`)
      continue
    }
    const json = await res.json()
    const events = json.events ?? []
    if (!events.length) continue

    const matchdays = assignMatchdays(events)

    const rows = events.map((e: any) => {
      const comp = e.competitions[0]
      const home = comp.competitors.find((c: any) => c.homeAway === 'home')
      const away = comp.competitors.find((c: any) => c.homeAway === 'away')
      return {
        api_football_id: Number(e.id),
        league_id: league.id,
        season: 2026,
        home_team_id: Number(home?.team?.id ?? 0),
        away_team_id: Number(away?.team?.id ?? 0),
        home_team_name: home?.team?.displayName ?? '',
        away_team_name: away?.team?.displayName ?? '',
        home_team_logo: home?.team?.logo ?? null,
        away_team_logo: away?.team?.logo ?? null,
        kickoff_time: e.date,
        status: mapEspnStatus(comp.status.type),
        home_score: home?.score != null ? Number(home.score) : null,
        away_score: away?.score != null ? Number(away.score) : null,
        home_penalty_score: home?.shootoutScore != null ? Number(home.shootoutScore) : null,
        away_penalty_score: away?.shootoutScore != null ? Number(away.shootoutScore) : null,
        round: String(matchdays.get(e.id) ?? ''),
        venue: comp.venue?.fullName ?? null,
      }
    })

    const { error } = await supabase
      .from('matches')
      .upsert(rows, { onConflict: 'api_football_id' })

    if (error) errors.push(`League ${league.name}: ${error.message}`)
    else upserted += rows.length
  }

  // Club Friendlies — only when no single-league filter was requested, or
  // the caller explicitly asked for this one.
  if (!leagueFilter || Number(leagueFilter) === CLUB_FRIENDLY_ID) {
    // Restrict to fixtures involving at least one club from the 5 tracked
    // leagues (per-league queries, not one combined one, to stay under
    // Supabase's 1000-row cap per request).
    const knownClubs = new Set<string>()
    for (const league of LEAGUES) {
      const { data } = await supabase.from('matches').select('home_team_name,away_team_name').eq('league_id', league.id).limit(1000)
      for (const m of data ?? []) {
        knownClubs.add(m.home_team_name)
        knownClubs.add(m.away_team_name)
      }
    }

    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${CLUB_FRIENDLY_SLUG}/scoreboard?dates=${FRIENDLY_DATE_RANGE}&limit=1000`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) {
      errors.push(`Club Friendlies: HTTP ${res.status}`)
    } else {
      const json = await res.json()
      const events = (json.events ?? []).filter((e: any) => {
        const comp = e.competitions[0]
        const home = comp.competitors.find((c: any) => c.homeAway === 'home')?.team?.displayName
        const away = comp.competitors.find((c: any) => c.homeAway === 'away')?.team?.displayName
        return knownClubs.has(home) || knownClubs.has(away)
      })

      if (events.length) {
        const matchdays = assignMatchdays(events)
        const rows = events.map((e: any) => {
          const comp = e.competitions[0]
          const home = comp.competitors.find((c: any) => c.homeAway === 'home')
          const away = comp.competitors.find((c: any) => c.homeAway === 'away')
          return {
            api_football_id: Number(e.id),
            league_id: CLUB_FRIENDLY_ID,
            season: 2026,
            home_team_id: Number(home?.team?.id ?? 0),
            away_team_id: Number(away?.team?.id ?? 0),
            home_team_name: home?.team?.displayName ?? '',
            away_team_name: away?.team?.displayName ?? '',
            home_team_logo: home?.team?.logo ?? null,
            away_team_logo: away?.team?.logo ?? null,
            kickoff_time: e.date,
            status: mapEspnStatus(comp.status.type),
            home_score: home?.score != null ? Number(home.score) : null,
            away_score: away?.score != null ? Number(away.score) : null,
            round: String(matchdays.get(e.id) ?? ''),
            venue: comp.venue?.fullName ?? null,
          }
        })

        const { error } = await supabase.from('matches').upsert(rows, { onConflict: 'api_football_id' })
        if (error) errors.push(`Club Friendlies: ${error.message}`)
        else upserted += rows.length
      }
    }
  }

  return NextResponse.json({ ok: true, upserted, errors })
}
