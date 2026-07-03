import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

function mapEspnStatus(type: { name: string; state: string }): string {
  if (type.state === 'pre') return 'NS'
  if (type.name === 'STATUS_POSTPONED' || type.name === 'STATUS_CANCELED') return 'PST'
  if (type.state === 'post') {
    if (type.name === 'STATUS_FULL_TIME_AFTER_EXTRA_TIME' || type.name.includes('EXTRA_TIME')) return 'AET'
    if (type.name.includes('PENALT')) return 'PEN'
    return 'FT'
  }
  if (type.name === 'STATUS_HALFTIME') return 'HT'
  return 'LIVE'
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
        round: null,
        venue: comp.venue?.fullName ?? null,
      }
    })

    const { error } = await supabase
      .from('matches')
      .upsert(rows, { onConflict: 'api_football_id' })

    if (error) errors.push(`League ${league.name}: ${error.message}`)
    else upserted += rows.length
  }

  return NextResponse.json({ ok: true, upserted, errors })
}
