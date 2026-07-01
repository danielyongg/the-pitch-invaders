import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LEAGUE_IDS = [1, 39, 140, 78, 135, 61] // World Cup, PL, La Liga, Bundesliga, Serie A, Ligue 1
const CURRENT_SEASON = new Date().getFullYear()

Deno.serve(async () => {
  const apiKey = Deno.env.get('API_FOOTBALL_KEY')!
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Check if there are any live or recent matches worth syncing
  const { data: activeMatches } = await supabase
    .from('matches')
    .select('id, api_football_id, status')
    .in('status', ['NS', '1H', 'HT', '2H', 'ET', 'BT', 'P'])
    .lte('kickoff_time', new Date().toISOString())

  if (!activeMatches?.length) {
    return new Response(JSON.stringify({ ok: true, message: 'No active matches' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Fetch live fixtures
  const leagueParam = LEAGUE_IDS.join('-')
  const liveUrl = `https://v3.football.api-sports.io/fixtures?live=${leagueParam}`
  const liveRes = await fetch(liveUrl, { headers: { 'x-apisports-key': apiKey } })
  const liveJson = await liveRes.json()

  // Also fetch recently finished
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const today = new Date()
  const fromStr = yesterday.toISOString().split('T')[0]
  const toStr = today.toISOString().split('T')[0]

  let scored: string[] = []

  for (const leagueId of LEAGUE_IDS) {
    const ftUrl = `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${CURRENT_SEASON}&from=${fromStr}&to=${toStr}&status=FT`
    const ftRes = await fetch(ftUrl, { headers: { 'x-apisports-key': apiKey } })
    const ftJson = await ftRes.json()

    const allFixtures = [...(liveJson.response ?? []), ...(ftJson.response ?? [])]

    for (const f of allFixtures) {
      const { data: match } = await supabase
        .from('matches')
        .select('id, status')
        .eq('api_football_id', f.fixture.id)
        .maybeSingle()

      if (!match) continue

      const newStatus = f.fixture.status.short
      await supabase
        .from('matches')
        .update({
          status: newStatus,
          home_score: f.goals.home,
          away_score: f.goals.away,
        })
        .eq('id', match.id)

      // If match just finished, score predictions
      if (newStatus === 'FT' && match.status !== 'FT') {
        const { error } = await supabase.rpc('score_match_predictions', { p_match_id: match.id })
        if (!error) scored.push(match.id)
        else console.error('Scoring error for match', match.id, error.message)
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, scored }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
