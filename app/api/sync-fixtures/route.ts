import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Fotmob-based IDs from free-api-live-football-data
const LEAGUES = [
  { id: 47,  name: 'Premier League' },
  { id: 87,  name: 'La Liga' },
  { id: 54,  name: 'Bundesliga' },
  { id: 55,  name: 'Serie A' },
  { id: 53,  name: 'Ligue 1' },
]

const HOST = 'free-api-live-football-data.p.rapidapi.com'

export async function GET(request: Request) {
  const apiKey = process.env.API_FOOTBALL_KEY
  if (!apiKey) return NextResponse.json({ error: 'API_FOOTBALL_KEY not set' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const leagueFilter = searchParams.get('league') // optional single league ID

  const supabase = createAdminClient()
  let upserted = 0
  const errors: string[] = []

  const leagues = leagueFilter
    ? LEAGUES.filter(l => l.id === Number(leagueFilter))
    : LEAGUES

  for (const league of leagues) {
    const url = `https://${HOST}/football-get-all-matches-by-league?leagueid=${league.id}`
    const res = await fetch(url, {
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': HOST,
      },
      next: { revalidate: 0 },
    })
    const json = await res.json()

    if (json.status !== 'success') {
      errors.push(`League ${league.name}: ${json.message ?? 'unknown error'}`)
      continue
    }

    const matches = json.response?.matches ?? []
    if (!matches.length) continue

    const rows = matches.map((m: any) => ({
      api_football_id: String(m.id),
      league_id: league.id,
      season: 2025,
      home_team_id: String(m.home?.id ?? ''),
      away_team_id: String(m.away?.id ?? ''),
      home_team_name: m.home?.name ?? '',
      away_team_name: m.away?.name ?? '',
      home_team_logo: `https://images.fotmob.com/image_resources/logo/teamlogo/${m.home?.id}.png`,
      away_team_logo: `https://images.fotmob.com/image_resources/logo/teamlogo/${m.away?.id}.png`,
      kickoff_time: m.status?.utcTime ?? null,
      status: m.status?.finished ? 'FT' : m.status?.started ? 'LIVE' : m.status?.cancelled ? 'CANC' : 'NS',
      home_score: m.home?.score ?? null,
      away_score: m.away?.score ?? null,
      round: m.tournament?.stage ?? null,
      venue: null,
    }))

    const { error } = await supabase
      .from('matches')
      .upsert(rows, { onConflict: 'api_football_id' })

    if (error) errors.push(`League ${league.name}: ${error.message}`)
    else upserted += rows.length
  }

  return NextResponse.json({ ok: true, upserted, errors })
}
