import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// One-off backfill: team logos from the upstream fixture sync (livescore's
// CDN) were broken (404 host) — confirmed for domestic clubs AND World Cup
// national teams alike, so this now covers every league. TheSportsDB's free
// public key serves stable crest PNGs keyed by team name — no RapidAPI quota
// spent.
const SPORTSDB_KEY = '3'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetchBadge(teamName: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/searchteams.php?t=${encodeURIComponent(teamName)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue }
    if (!res.ok) return null
    const json = await res.json()
    const teams = json.teams ?? []
    // Club names can collide with other sports (e.g. "AS Monaco" basketball) — soccer only
    const team = teams.find((t: any) => t.strSport === 'Soccer') ?? teams[0]
    return team?.strBadge ?? null
  }
  return null
}

export async function GET() {
  const supabase = createAdminClient()

  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, home_team_name, away_team_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!matches?.length) return NextResponse.json({ ok: true, updated: 0 })

  // Unresolved World Cup bracket slots ("Winner QF 1", "TeamA/TeamB") aren't
  // real team names — skip them rather than wasting a lookup that can only
  // ever come back empty.
  const isPlaceholder = (name: string) => name.includes('/') || name.startsWith('Winner ') || name.startsWith('Loser ')
  const teamNames = Array.from(new Set(matches.flatMap(m => [m.home_team_name, m.away_team_name]))).filter(n => !isPlaceholder(n))
  const badgeByName = new Map<string, string>()

  for (const name of teamNames) {
    const badge = await fetchBadge(name)
    if (badge) badgeByName.set(name, badge)
    await sleep(600)
  }

  let updated = 0
  const errors: string[] = []

  for (const m of matches) {
    const homeLogo = badgeByName.get(m.home_team_name)
    const awayLogo = badgeByName.get(m.away_team_name)
    if (!homeLogo && !awayLogo) continue

    const patch: Record<string, string> = {}
    if (homeLogo) patch.home_team_logo = homeLogo
    if (awayLogo) patch.away_team_logo = awayLogo

    const { error: updateError } = await supabase.from('matches').update(patch).eq('id', m.id)
    if (updateError) errors.push(`${m.id}: ${updateError.message}`)
    else updated++
  }

  return NextResponse.json({ ok: true, teamsResolved: badgeByName.size, teamsTotal: teamNames.length, updated, errors })
}
