import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LEAGUE_IDS = [1, 39, 140, 78, 135, 61] // World Cup, PL, La Liga, Bundesliga, Serie A, Ligue 1
const CURRENT_SEASON = new Date().getFullYear()

interface Fixture {
  fixture: { id: number; date: string; status: { short: string }; venue: { name: string } }
  league: { id: number; round: string }
  teams: {
    home: { id: number; name: string; logo: string }
    away: { id: number; name: string; logo: string }
  }
  goals: { home: number | null; away: number | null }
}

Deno.serve(async () => {
  const apiKey = Deno.env.get('API_FOOTBALL_KEY')!
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const from = new Date()
  const to = new Date()
  to.setDate(to.getDate() + 14)

  const fromStr = from.toISOString().split('T')[0]
  const toStr = to.toISOString().split('T')[0]

  let upserted = 0

  for (const leagueId of LEAGUE_IDS) {
    const url = `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${CURRENT_SEASON}&from=${fromStr}&to=${toStr}`
    const res = await fetch(url, { headers: { 'x-apisports-key': apiKey } })
    const json = await res.json()
    const fixtures: Fixture[] = json.response ?? []

    if (!fixtures.length) continue

    const rows = fixtures.map(f => ({
      api_football_id: f.fixture.id,
      league_id: leagueId,
      season: CURRENT_SEASON,
      home_team_id: f.teams.home.id,
      away_team_id: f.teams.away.id,
      home_team_name: f.teams.home.name,
      away_team_name: f.teams.away.name,
      home_team_logo: f.teams.home.logo,
      away_team_logo: f.teams.away.logo,
      kickoff_time: f.fixture.date,
      status: f.fixture.status.short,
      home_score: f.goals.home,
      away_score: f.goals.away,
      round: f.league.round,
      venue: f.fixture.venue.name,
    }))

    const { error } = await supabase
      .from('matches')
      .upsert(rows, { onConflict: 'api_football_id' })

    if (!error) upserted += rows.length
    else console.error(`League ${leagueId}:`, error.message)
  }

  return new Response(JSON.stringify({ ok: true, upserted }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
