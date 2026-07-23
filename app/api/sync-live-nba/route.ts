import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapEspnStatus, fetchEspnSummary } from '@/lib/espn'

const NBA_LEAGUE_ID = 200
const NBA_SPORT_PATH = 'basketball'
const NBA_SLUG = 'nba'
const FINISHED_STATUSES = ['FT']

// One-time snapshot of the bookmaker spread — same shape as
// fillOnexbetPreMatch in sync-live/route.ts, guarded so it only ever fetches
// once per match (the query in GET() already filters to odds_spread IS
// NULL, so this function doesn't need its own re-check).
async function fillOddsSpread(
  supabase: ReturnType<typeof createAdminClient>,
  matchId: string,
  apiFootballId: number,
  kickoffIso: string,
  homeTeam: string,
  awayTeam: string
) {
  try {
    const summary = await fetchEspnSummary(NBA_LEAGUE_ID, apiFootballId, kickoffIso, homeTeam, awayTeam)
    const spread = summary?.pickcenter?.[0]?.spread
    if (spread == null) return
    await supabase.from('matches').update({ odds_spread: Math.abs(Number(spread)) }).eq('id', matchId)
  } catch {
    // best-effort — leave odds_spread null, scoring falls back to the default threshold of 5
  }
}

export async function GET() {
  const supabase = createAdminClient()

  // Odds pre-fill: any upcoming NBA match that hasn't been snapshotted yet.
  const { data: needsOdds } = await supabase
    .from('matches')
    .select('id, api_football_id, kickoff_time, home_team_name, away_team_name')
    .eq('league_id', NBA_LEAGUE_ID)
    .eq('status', 'NS')
    .is('odds_spread', null)
    .gt('kickoff_time', new Date().toISOString())
  for (const row of needsOdds ?? []) {
    await fillOddsSpread(supabase, row.id, row.api_football_id, row.kickoff_time, row.home_team_name, row.away_team_name)
  }

  // Any NBA match not yet finished whose kickoff has already passed needs a score check.
  const { data: activeMatches } = await supabase
    .from('matches')
    .select('kickoff_time')
    .eq('league_id', NBA_LEAGUE_ID)
    .not('status', 'eq', 'FT')
    .lte('kickoff_time', new Date().toISOString())

  if (!activeMatches || activeMatches.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, scored: 0, skipped: 'no active matches' })
  }

  // Always check today/yesterday for matches in progress, plus the kickoff
  // date of every stuck match (same reasoning as football sync-live: a
  // match whose kickoff date this job never ran a sync for would otherwise
  // stay stuck at its pre-kickoff status forever).
  const dates = new Set<string>()
  for (const offset of [-1, 0]) {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    dates.add(d.toISOString().slice(0, 10))
  }
  for (const m of activeMatches) dates.add(m.kickoff_time.slice(0, 10))

  const updates: { homeTeam: string; awayTeam: string; status: string; homeScore: number | null; awayScore: number | null }[] = []
  for (const date of [...dates].map(d => d.replace(/-/g, ''))) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${NBA_SPORT_PATH}/${NBA_SLUG}/scoreboard?dates=${date}`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) continue
    const json = await res.json()
    for (const e of json.events ?? []) {
      const comp = e.competitions[0]
      const home = comp.competitors.find((c: any) => c.homeAway === 'home')
      const away = comp.competitors.find((c: any) => c.homeAway === 'away')
      updates.push({
        homeTeam: home?.team?.displayName,
        awayTeam: away?.team?.displayName,
        status: mapEspnStatus(comp.status.type, comp.status.displayClock),
        homeScore: home?.score != null ? Number(home.score) : null,
        awayScore: away?.score != null ? Number(away.score) : null,
      })
    }
  }

  let updated = 0
  let scored = 0
  const errors: string[] = []
  for (const u of updates.filter(x => x.homeTeam && x.awayTeam)) {
    const { data, error } = await supabase
      .from('matches')
      .update({ status: u.status, home_score: u.homeScore, away_score: u.awayScore })
      .eq('league_id', NBA_LEAGUE_ID)
      .ilike('home_team_name', u.homeTeam)
      .ilike('away_team_name', u.awayTeam)
      .select('id')
    if (error) {
      errors.push(`${u.homeTeam} vs ${u.awayTeam}: ${error.message}`)
      continue
    }
    updated += data?.length ?? 0

    if (FINISHED_STATUSES.includes(u.status)) {
      for (const row of data ?? []) {
        const { error: scoreError } = await supabase.rpc('score_match_predictions', { p_match_id: row.id })
        if (scoreError) errors.push(`score ${u.homeTeam} vs ${u.awayTeam}: ${scoreError.message}`)
        else scored++
      }
    }
  }

  return NextResponse.json({ ok: true, updated, scored, errors })
}
