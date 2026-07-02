import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Server-side cooldown to protect RapidAPI quotas, regardless of how many
// clients poll this endpoint concurrently.
const COOLDOWN_MS = 3 * 60 * 1000 // 3 minutes
let lastRun = 0
let lastResult: any = null

type ScoreUpdate = {
  homeTeam: string
  awayTeam: string
  status: string
  homeScore: number | null
  awayScore: number | null
  homePenaltyScore?: number | null
  awayPenaltyScore?: number | null
}

const FINISHED_STATUSES = ['FT', 'AET', 'PEN']

// Providers spell some team names differently than what's stored in the DB
// (e.g. "Bosnia & Herzegovina" vs "Bosnia and Herzegovina") — normalize both
// sides the same way before matching.
function normalizeTeamName(name: string): string {
  return name.replace(/&/g, 'and')
}

async function applyUpdates(supabase: ReturnType<typeof createAdminClient>, updates: ScoreUpdate[]) {
  let updated = 0
  let scored = 0
  const errors: string[] = []
  for (const u of updates) {
    const { data, error } = await supabase
      .from('matches')
      .update({
        status: u.status,
        home_score: u.homeScore,
        away_score: u.awayScore,
        home_penalty_score: u.homePenaltyScore ?? null,
        away_penalty_score: u.awayPenaltyScore ?? null,
      })
      .eq('league_id', 77)
      .ilike('home_team_name', normalizeTeamName(u.homeTeam))
      .ilike('away_team_name', normalizeTeamName(u.awayTeam))
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
  return { updated, scored, errors }
}

// 365scores: one call returns every competition + match for a given date
function map365StatusText(text: string): string {
  if (!text) return 'NS'
  if (text === 'Scheduled' || text.startsWith('Sched')) return 'NS'
  if (text === 'Half-Time' || text === 'HT') return 'HT'
  if (text.includes('After Penalties') || text.includes('Penalties Ended')) return 'PEN'
  if (text.includes('Penalties')) return 'PEN'
  if (text === 'After ET' || text.includes('Extra Time Ended')) return 'AET'
  if (text === 'Ended' || text === 'FT') return 'FT'
  return text // live minute / period text, store as-is for display
}

async function try365Scores(apiKey: string): Promise<ScoreUpdate[] | null> {
  const HOST = '365scores.p.rapidapi.com'

  // Fetch today and yesterday to catch matches that kicked off late and
  // finished after the date rolled over
  const dates: string[] = []
  for (let i = -1; i <= 0; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    dates.push(d.toISOString().slice(0, 10))
  }

  const updates: ScoreUpdate[] = []
  let sawWorldCup = false

  for (const date of dates) {
    const url = `https://${HOST}/api/365scores/v1/match/list?sportId=1&langId=1&date=${date}&timezone=Europe%2FLondon`
    const res = await fetch(url, { headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': HOST }, next: { revalidate: 0 } })
    if (!res.ok) continue
    const json = await res.json()
    const wcCompetition = (json.competitions ?? []).find((c: any) => c.name === 'FIFA World Cup')
    if (!wcCompetition) continue
    sawWorldCup = true

    const games = (json.games ?? []).filter((g: any) => g.competitionId === wcCompetition.id)
    for (const g of games) {
      updates.push({
        homeTeam: g.homeCompetitor?.name,
        awayTeam: g.awayCompetitor?.name,
        status: map365StatusText(g.shortStatusText ?? g.statusText),
        // 365scores sends -1 as a "not started" sentinel instead of null
        homeScore: g.homeCompetitor?.score >= 0 ? g.homeCompetitor.score : null,
        awayScore: g.awayCompetitor?.score >= 0 ? g.awayCompetitor.score : null,
        homePenaltyScore: g.homeCompetitor?.penaltyScore >= 0 ? g.homeCompetitor.penaltyScore : null,
        awayPenaltyScore: g.awayCompetitor?.penaltyScore >= 0 ? g.awayCompetitor.penaltyScore : null,
      })
    }
  }

  if (!sawWorldCup) return null
  return updates.filter(u => u.homeTeam && u.awayTeam)
}

// livescore6: fallback #1 — same provider used historically, separate quota
function mapLivescore6Status(eps: string): string {
  if (!eps || eps === 'NS') return 'NS'
  if (eps === 'FT' || eps === 'AET' || eps === 'AP') return 'FT'
  if (eps === 'HT') return 'HT'
  return eps
}

async function tryLivescore6(apiKey: string): Promise<ScoreUpdate[] | null> {
  const HOST = 'livescore6.p.rapidapi.com'
  const dates: string[] = []
  for (let i = -1; i <= 0; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''))
  }

  const updates: ScoreUpdate[] = []
  for (const date of dates) {
    const url = `https://${HOST}/matches/v2/list-by-date?Category=soccer&Date=${date}&Timezone=0`
    const res = await fetch(url, { headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': HOST }, next: { revalidate: 0 } })
    if (!res.ok) return updates.length ? updates : null
    const json = await res.json()
    const wcStages = (json.Stages ?? []).filter((s: any) => s.Cnm?.includes('World Cup'))
    for (const stage of wcStages) {
      for (const e of stage.Events ?? []) {
        updates.push({
          homeTeam: e.T1?.[0]?.Nm,
          awayTeam: e.T2?.[0]?.Nm,
          status: mapLivescore6Status(e.Eps ?? ''),
          homeScore: e.Tr1 != null && e.Tr1 !== '' ? parseInt(e.Tr1) : null,
          awayScore: e.Tr2 != null && e.Tr2 !== '' ? parseInt(e.Tr2) : null,
        })
      }
    }
  }
  return updates.filter(u => u.homeTeam && u.awayTeam)
}

// flashscore4: fallback #2 — only surfaces matches currently live, filtered by tournament name
function mapFlashscoreStatus(s: any): string {
  if (s?.is_finished_after_penalties) return 'PEN'
  if (s?.is_finished_after_extra_time) return 'AET'
  if (s?.is_finished) return 'FT'
  if (s?.stage === 'Half-Time' || s?.stage === 'HT') return 'HT'
  if (s?.is_in_progress) return s.stage ?? 'LIVE'
  return 'NS'
}

async function tryFlashscore4(apiKey: string): Promise<ScoreUpdate[] | null> {
  const HOST = 'flashscore4.p.rapidapi.com'
  const url = `https://${HOST}/api/flashscore/v2/matches/live?sport_id=1&timezone=Europe%2FLondon`
  const res = await fetch(url, { headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': HOST }, next: { revalidate: 0 } })
  if (!res.ok) return null
  const groups = await res.json()

  const wcGroups = (groups ?? []).filter((g: any) => {
    const name = (g.name ?? '').toLowerCase()
    return (name.includes('world cup') || name.includes('world championship')) &&
      !name.includes('club') && !name.includes('women') && !name.includes('u20') && !name.includes('u17')
  })

  const updates: ScoreUpdate[] = []
  for (const g of wcGroups) {
    for (const m of g.matches ?? []) {
      updates.push({
        homeTeam: m.home_name ?? m.home?.name,
        awayTeam: m.away_name ?? m.away?.name,
        status: mapFlashscoreStatus(m.match_status),
        homeScore: m.home_score ?? null,
        awayScore: m.away_score ?? null,
      })
    }
  }
  return updates.filter(u => u.homeTeam && u.awayTeam)
}

export async function GET() {
  const apiKey = process.env.API_FOOTBALL_KEY
  if (!apiKey) return NextResponse.json({ error: 'API_FOOTBALL_KEY not set' }, { status: 500 })

  const now = Date.now()
  if (now - lastRun < COOLDOWN_MS && lastResult) {
    return NextResponse.json({ ...lastResult, cached: true })
  }
  lastRun = now

  const supabase = createAdminClient()

  // Skip hitting any provider (and burning quota) if no match is actually
  // pending an update — e.g. no live match and nothing kicked off yet.
  const { count: activeCount } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .not('status', 'in', '(FT,AET,PEN)')
    .lte('kickoff_time', new Date().toISOString())

  if (!activeCount) {
    lastResult = { ok: true, source: null, updated: 0, scored: 0, errors: [], skipped: 'no active matches' }
    return NextResponse.json(lastResult)
  }

  const providers: [string, (key: string) => Promise<ScoreUpdate[] | null>][] = [
    ['365scores', try365Scores],
    ['livescore6', tryLivescore6],
    ['flashscore4', tryFlashscore4],
  ]

  for (const [source, fn] of providers) {
    try {
      const updates = await fn(apiKey)
      if (updates && updates.length > 0) {
        const { updated, scored, errors } = await applyUpdates(supabase, updates)
        lastResult = { ok: true, source, updated, scored, errors }
        return NextResponse.json(lastResult)
      }
    } catch {
      // try next provider
    }
  }

  lastResult = { ok: true, source: null, updated: 0, errors: ['all providers returned no data'] }
  return NextResponse.json(lastResult)
}
