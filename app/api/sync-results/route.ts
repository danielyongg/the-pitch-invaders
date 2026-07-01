import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const LEAGUE_IDS = [39, 140, 78, 135, 61]
const CURRENT_SEASON = 2024

export async function GET() {
  const apiKey = process.env.API_FOOTBALL_KEY
  if (!apiKey) return NextResponse.json({ error: 'API_FOOTBALL_KEY not set' }, { status: 500 })

  const supabase = createAdminClient()
  const scored: string[] = []
  const errors: string[] = []

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const today = new Date()
  const fromStr = yesterday.toISOString().split('T')[0]
  const toStr = today.toISOString().split('T')[0]

  for (const leagueId of LEAGUE_IDS) {
    // Fetch live + recently finished fixtures
    const [liveRes, ftRes] = await Promise.all([
      fetch(`https://v3.football.api-sports.io/fixtures?live=${leagueId}`, {
        headers: { 'x-apisports-key': apiKey },
        next: { revalidate: 0 },
      }),
      fetch(`https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${CURRENT_SEASON}&from=${fromStr}&to=${toStr}&status=FT`, {
        headers: { 'x-apisports-key': apiKey },
        next: { revalidate: 0 },
      }),
    ])

    const liveJson = await liveRes.json()
    const ftJson = await ftRes.json()
    const fixtures = [...(liveJson.response ?? []), ...(ftJson.response ?? [])]

    for (const f of fixtures) {
      const { data: match } = await supabase
        .from('matches')
        .select('id, status')
        .eq('api_football_id', f.fixture.id)
        .maybeSingle()

      if (!match) continue

      const newStatus: string = f.fixture.status.short
      await supabase
        .from('matches')
        .update({ status: newStatus, home_score: f.goals.home, away_score: f.goals.away })
        .eq('id', match.id)

      if (newStatus === 'FT' && match.status !== 'FT') {
        const { error } = await supabase.rpc('score_match_predictions', { p_match_id: match.id })
        if (error) errors.push(`score ${match.id}: ${error.message}`)
        else scored.push(match.id)
      }
    }
  }

  return NextResponse.json({ ok: true, scored, errors })
}
