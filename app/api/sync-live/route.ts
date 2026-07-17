import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapEspnStatus, normalizeTeamName } from '@/lib/espn'
import { resolveOnexbetMatchHash, resolveTeamHashes, fetchOnexbetStats, fetchOnexbetPreMatch } from '@/lib/onexbet'
import { generatePregameSummary } from '@/lib/pregame-summary'

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

// Draws go to penalties in knockout rounds, so a tie with no penalty score
// means no winner yet (still shouldn't happen for a FINISHED_STATUSES match).
function computeWinner(u: ScoreUpdate): string | null {
  if (u.homeScore == null || u.awayScore == null) return null
  if (u.homeScore > u.awayScore) return u.homeTeam
  if (u.awayScore > u.homeScore) return u.awayTeam
  if (u.homePenaltyScore != null && u.awayPenaltyScore != null) {
    if (u.homePenaltyScore > u.awayPenaltyScore) return u.homeTeam
    if (u.awayPenaltyScore > u.homePenaltyScore) return u.awayTeam
  }
  return null
}

// A placeholder slot ("Winner QF 1", "TeamA/TeamB") is seeded with whatever
// logo the fixture sync happened to assign it, which never matches the real
// team once resolved (confirmed 404s in practice) — so whenever we resolve a
// placeholder to a real team name, also look up that team's actual crest
// from any other WC match row that already has it (virtually every team has
// one from the group stage) and patch it in alongside the name.
async function knownTeamLogo(supabase: ReturnType<typeof createAdminClient>, teamName: string): Promise<string | null> {
  const { data: homeRow } = await supabase.from('matches').select('home_team_logo').eq('league_id', 77).eq('home_team_name', teamName).not('home_team_logo', 'is', null).limit(1).maybeSingle()
  if (homeRow?.home_team_logo) return homeRow.home_team_logo
  const { data: awayRow } = await supabase.from('matches').select('away_team_logo').eq('league_id', 77).eq('away_team_name', teamName).not('away_team_logo', 'is', null).limit(1).maybeSingle()
  return awayRow?.away_team_logo ?? null
}

// Round of 32 fixtures are seeded with a "TeamA/TeamB" placeholder for
// whichever side isn't decided yet (both teams come from group stage
// runner-up/winner slots, so there's no bracket seed number yet). Once
// a knockout match finishes, replace the matching placeholder slot with
// the winner's name.
async function advanceKnockoutWinner(supabase: ReturnType<typeof createAdminClient>, u: ScoreUpdate): Promise<string | null> {
  const winner = computeWinner(u)
  if (!winner) return null
  const logo = await knownTeamLogo(supabase, winner)
  const slotA = `${u.homeTeam}/${u.awayTeam}`
  const slotB = `${u.awayTeam}/${u.homeTeam}`
  for (const [nameColumn, logoColumn, slot] of [['home_team_name', 'home_team_logo', slotA], ['home_team_name', 'home_team_logo', slotB], ['away_team_name', 'away_team_logo', slotA], ['away_team_name', 'away_team_logo', slotB]] as const) {
    const patch: Record<string, string> = { [nameColumn]: winner }
    if (logo) patch[logoColumn] = logo
    const { error } = await supabase
      .from('matches')
      .update(patch)
      .eq(nameColumn, slot)
    if (error) return `advance ${slotA}: ${error.message}`
  }
  return null
}

// Round of 16 onward are seeded with "Winner EF N" / "Winner QF N" /
// "Winner SF N" / "Loser SF N" placeholders, where N is the match's 1-based
// position within its round ordered by kickoff time (standard bracket
// seeding — e.g. quarterfinal 1 is always Winner EF 1 vs Winner EF 2).
// Once a match in one of these rounds finishes, resolve its own bracket
// position and patch every fixture referencing "<Winner|Loser> <TOKEN> <N>".
const BRACKET_TOKEN: Record<string, string> = {
  round_of_16: 'EF',
  quarterfinal: 'QF',
  semifinal: 'SF',
}

async function advanceBracketSeed(supabase: ReturnType<typeof createAdminClient>, matchId: string, u: ScoreUpdate): Promise<string | null> {
  const { data: match, error: matchError } = await supabase.from('matches').select('round, kickoff_time').eq('id', matchId).single()
  if (matchError || !match) return matchError ? `advance seed lookup: ${matchError.message}` : null
  const token = BRACKET_TOKEN[match.round ?? '']
  if (!token) return null

  const winner = computeWinner(u)
  if (!winner) return null
  const loser = winner === u.homeTeam ? u.awayTeam : u.homeTeam
  const winnerLogo = await knownTeamLogo(supabase, winner)
  const loserLogo = await knownTeamLogo(supabase, loser)

  const { data: roundMatches, error: roundError } = await supabase
    .from('matches')
    .select('id')
    .eq('league_id', 77)
    .eq('round', match.round)
    .order('kickoff_time', { ascending: true })
  if (roundError) return `advance seed round lookup: ${roundError.message}`
  const position = (roundMatches ?? []).findIndex(m => m.id === matchId) + 1
  if (position <= 0) return null

  for (const [nameColumn, logoColumn, placeholder, name, logo] of [
    ['home_team_name', 'home_team_logo', `Winner ${token} ${position}`, winner, winnerLogo],
    ['away_team_name', 'away_team_logo', `Winner ${token} ${position}`, winner, winnerLogo],
    ['home_team_name', 'home_team_logo', `Loser ${token} ${position}`, loser, loserLogo],
    ['away_team_name', 'away_team_logo', `Loser ${token} ${position}`, loser, loserLogo],
  ] as const) {
    const patch: Record<string, string> = { [nameColumn]: name }
    if (logo) patch[logoColumn] = logo
    const { error } = await supabase.from('matches').update(patch).eq(nameColumn, placeholder)
    if (error) return `advance seed ${placeholder}: ${error.message}`
  }
  return null
}

// Fire-and-forget: 1xBet only covers the World Cup, only has a handful of
// matches finishing per day, and a failure here shouldn't fail the sync —
// ESPN's data (already saved above) is authoritative for score/status.
//
// 1xBet's fixture-list endpoints (prematch/live) only ever expose the
// *current* round — a match's matchHash can't be found by team name again
// once it's no longer that round's active fixture (confirmed empirically:
// none of the World Cup's ~90 already-played matches turn up there anymore).
// So the matchHash is resolved once, while the match is still upcoming (see
// fillOnexbetPreMatch), and persisted to onexbet_stats.matchHash — the
// post-match fill below reuses that stored hash instead of re-resolving,
// which would silently fail for anything already finished.
//
// Guarded per sub-key (not the whole onexbet_stats object) so pre-match and
// post-match data can both land on the same row without one blocking the
// other, and neither ever re-spends the Basic tier's 500 req/month quota on
// the same match twice.
async function fillOnexbetStats(supabase: ReturnType<typeof createAdminClient>, matchId: string, apiKey: string, homeTeam: string, awayTeam: string) {
  const { data: row } = await supabase.from('matches').select('onexbet_stats').eq('id', matchId).single()
  if (row?.onexbet_stats?.statistics) return

  try {
    // Prefer the hash captured pre-match; only attempt a fresh by-name
    // resolve as a best-effort fallback (e.g. this match's pre-match fill
    // never got a chance to run) — it will likely fail once the match has
    // already left the current-round fixture list.
    const matchHash = row?.onexbet_stats?.matchHash ?? await resolveOnexbetMatchHash(apiKey, homeTeam, awayTeam)
    if (!matchHash) return
    const stats = await fetchOnexbetStats(apiKey, matchHash)
    await supabase.from('matches').update({ onexbet_stats: { ...row?.onexbet_stats, ...stats } }).eq('id', matchId)
  } catch {
    // best-effort — leave onexbet_stats as-is, match detail page just won't show that section
  }
}

// Placeholder names ("TeamA/TeamB" group-stage slots, "Winner QF 1" bracket
// seeds — see advanceKnockoutWinner/advanceBracketSeed above) never match a
// real 1xBet fixture, so skip those rather than burning a request finding
// that out on every single sync-live run until the real team is known.
function isPlaceholderTeam(name: string): boolean {
  return name.includes('/') || name.startsWith('Winner ') || name.startsWith('Loser ')
}

// Same fire-and-forget shape as fillOnexbetStats, but for matches that
// haven't kicked off yet: resolves + persists matchHash and teamHashes (so
// later calls never have to re-resolve them), then fetches the prediction
// preview + last 5 results per team.
//
// Guarded on recentForm actually having content rather than on prediction's
// mere presence — the prediction endpoint always returns a `{prediction:[]}`
// shape even when 1xBet hasn't published preview text yet, so treating that
// as "done" would permanently skip retrying a recentForm call that failed
// transiently (observed in practice: two matches processed in the same
// batch, one got real form data, the other came back empty).
async function fillOnexbetPreMatch(supabase: ReturnType<typeof createAdminClient>, matchId: string, apiKey: string, homeTeam: string, awayTeam: string) {
  if (isPlaceholderTeam(homeTeam) || isPlaceholderTeam(awayTeam)) return
  const { data: row } = await supabase.from('matches').select('onexbet_stats').eq('id', matchId).single()
  const existing = row?.onexbet_stats
  if (existing?.recentForm?.home?.length > 0 && existing?.recentForm?.away?.length > 0) return

  try {
    const matchHash = existing?.matchHash ?? await resolveOnexbetMatchHash(apiKey, homeTeam, awayTeam)
    if (!matchHash) return
    const teamHashes = existing?.teamHashes ?? await resolveTeamHashes(apiKey, matchHash)
    const preMatch = teamHashes ? await fetchOnexbetPreMatch(apiKey, matchHash, teamHashes) : null
    await supabase.from('matches').update({ onexbet_stats: { ...existing, matchHash, teamHashes, ...preMatch } }).eq('id', matchId)
  } catch {
    // best-effort — leave as-is, match detail page just won't show that section
  }
}

async function applyUpdates(supabase: ReturnType<typeof createAdminClient>, updates: ScoreUpdate[], onexbetApiKey: string) {
  let updated = 0
  let scored = 0
  const errors: string[] = []
  for (const u of updates) {
    let { data, error } = await supabase
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

    // A provider's home/away assignment can disagree with our fixture's
    // original orientation (confirmed on ESPN: Morocco/France stored as
    // home/away here, but ESPN reports France as home) — retry with teams
    // and scores flipped before concluding this match isn't in our DB.
    if ((data?.length ?? 0) === 0) {
      const swap = await supabase
        .from('matches')
        .update({
          status: u.status,
          home_score: u.awayScore,
          away_score: u.homeScore,
          home_penalty_score: u.awayPenaltyScore ?? null,
          away_penalty_score: u.homePenaltyScore ?? null,
        })
        .eq('league_id', 77)
        .ilike('home_team_name', normalizeTeamName(u.awayTeam))
        .ilike('away_team_name', normalizeTeamName(u.homeTeam))
        .select('id')
      if (swap.error) {
        errors.push(`${u.homeTeam} vs ${u.awayTeam}: ${swap.error.message}`)
        continue
      }
      data = swap.data
    }
    updated += data?.length ?? 0

    if (FINISHED_STATUSES.includes(u.status)) {
      for (const row of data ?? []) {
        const { error: scoreError } = await supabase.rpc('score_match_predictions', { p_match_id: row.id })
        if (scoreError) errors.push(`score ${u.homeTeam} vs ${u.awayTeam}: ${scoreError.message}`)
        else scored++

        const seedError = await advanceBracketSeed(supabase, row.id, u)
        if (seedError) errors.push(seedError)

        await fillOnexbetStats(supabase, row.id, onexbetApiKey, u.homeTeam, u.awayTeam)
      }
      const advanceError = await advanceKnockoutWinner(supabase, u)
      if (advanceError) errors.push(advanceError)
    }
  }
  return { updated, scored, errors }
}

// 365scores: one call returns every competition + match for a given date
function map365StatusText(text: string, gameTimeDisplay?: string): string {
  if (!text) return 'NS'
  if (text === 'Scheduled' || text.startsWith('Sched')) return 'NS'
  if (text === 'Half-Time' || text === 'HT') return 'HT'
  if (text.includes('After Penalties') || text.includes('Penalties Ended')) return 'PEN'
  if (text.includes('Penalties')) return 'PEN'
  if (text === 'After ET' || text.includes('Extra Time Ended')) return 'AET'
  if (text === 'Ended' || text === 'FT') return 'FT'
  // In-progress period text like "1st Half"/"2nd Half" isn't recognized as
  // live by MatchCard — gameTimeDisplay ("48'") is, so prefer it when present.
  return gameTimeDisplay || text
}

async function try365Scores(apiKey: string, dates: string[]): Promise<ScoreUpdate[] | null> {
  const HOST = '365scores.p.rapidapi.com'

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
        status: map365StatusText(g.shortStatusText ?? g.statusText, g.gameTimeDisplay),
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

async function tryLivescore6(apiKey: string, dates: string[]): Promise<ScoreUpdate[] | null> {
  const HOST = 'livescore6.p.rapidapi.com'

  const updates: ScoreUpdate[] = []
  for (const date of dates.map(d => d.replace(/-/g, ''))) {
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

// free-football-api-data: fallback #3. Schema confirmed 2026-07-03 against a
// real live match (Switzerland vs Algeria). The `status` field is an object
// ({ finished, started, cancelled, ongoing, scoreStr }), not a string — and
// there is no tournament/league name field, only a numeric `leagueId`. So we
// don't try to filter to World Cup matches here; applyUpdates() already
// scopes updates to league_id = 77 + team-name match, so non-WC matches from
// this feed simply update 0 rows.
function mapFreeFootballStatus(m: any): string {
  const status = m.status
  if (!status || typeof status !== 'object') return 'LIVE'
  if (status.cancelled) return 'PST'
  if (status.finished) return 'FT'
  if (!status.started) return 'NS'
  // liveTime.short is already minute/stage text ("46'", "HT") — same format
  // MatchCard already renders as-is for the 365scores provider.
  return status.liveTime?.short ?? 'LIVE'
}

async function tryFreeFootballApiData(apiKey: string): Promise<ScoreUpdate[] | null> {
  const HOST = 'free-football-api-data.p.rapidapi.com'
  const url = `https://${HOST}/football-current-live`
  const res = await fetch(url, { headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': HOST }, next: { revalidate: 0 } })
  if (!res.ok) return null
  const json = await res.json()
  const matches = json?.response?.live ?? json?.response ?? []
  if (!Array.isArray(matches)) return null

  const updates: ScoreUpdate[] = matches.map((m: any) => ({
    homeTeam: m.home?.name ?? m.homeTeam?.name ?? m.teams?.home?.name,
    awayTeam: m.away?.name ?? m.awayTeam?.name ?? m.teams?.away?.name,
    status: mapFreeFootballStatus(m),
    homeScore: m.home?.score ?? m.homeScore ?? m.goals?.home ?? null,
    awayScore: m.away?.score ?? m.awayScore ?? m.goals?.away ?? null,
  }))
  return updates.filter(u => u.homeTeam && u.awayTeam)
}

// footballdata.io: fallback #4. Confirmed 2026-07-03 against real World Cup
// 2026 fixtures (World Cup is league_id 50 on their side). Uses its own key
// (FOOTBALLDATA_IO_KEY), not the RapidAPI one the other providers share —
// the `key` param is ignored to keep the same provider-function shape.
// Known gap: penalty shootout scores aren't exposed anywhere in their match
// payload (a PEN match just reads as a "draw"), so computeWinner() won't
// resolve a winner for those here. Acceptable for a last-resort fallback —
// by the time this runs, an earlier provider has usually already settled it.
function mapFootballDataIoStatus(m: any): string {
  if (m.status === 'complete') return 'FT'
  if (m.status === 'incomplete') return 'NS'
  // Anything else is presumed in-progress — pass through their label text.
  return m.status_localized || m.status || 'LIVE'
}

async function tryFootballDataIo(_key: string, dates: string[]): Promise<ScoreUpdate[] | null> {
  const apiKey = process.env.FOOTBALLDATA_IO_KEY
  if (!apiKey) return null
  const WORLD_CUP_LEAGUE_ID = 50

  const updates: ScoreUpdate[] = []
  for (const date of dates) {
    const url = `https://footballdata.io/api/v1/matches/date/${date}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, next: { revalidate: 0 } })
    if (!res.ok) continue
    const json = await res.json()
    const matches = json?.data?.matches ?? []
    if (!Array.isArray(matches)) continue

    for (const m of matches) {
      if (m.league?.league_id !== WORLD_CUP_LEAGUE_ID) continue
      updates.push({
        homeTeam: m.home_team?.team_name,
        awayTeam: m.away_team?.team_name,
        status: mapFootballDataIoStatus(m),
        homeScore: m.score?.home ?? null,
        awayScore: m.score?.away ?? null,
      })
    }
  }
  return updates.filter(u => u.homeTeam && u.awayTeam)
}

// ESPN: primary provider (2026-07-03) — free, no key, and unlike
// free-football-api-data/footballdata.io it exposes penalty shootout scores
// directly (`shootoutScore`), so knockout winners resolve correctly here
// without waiting on a fallback.
async function tryEspn(_key: string, dates: string[]): Promise<ScoreUpdate[] | null> {
  const updates: ScoreUpdate[] = []
  for (const date of dates.map(d => d.replace(/-/g, ''))) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${date}`
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
        homePenaltyScore: home?.shootoutScore != null ? Number(home.shootoutScore) : null,
        awayPenaltyScore: away?.shootoutScore != null ? Number(away.shootoutScore) : null,
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

  // Pre-match 1xBet fill for upcoming World Cup fixtures whose teams are
  // already known (bracket seed resolved) but haven't kicked off yet. Runs
  // every cycle regardless of whether a match is currently live — separate
  // from the score-update path below, and each row is only ever filled once
  // (see fillOnexbetPreMatch's guard). World Cup only, and few rows ever
  // (48-team bracket), so no cap needed here.
  const { data: onexbetUpcoming } = await supabase
    .from('matches')
    .select('id, home_team_name, away_team_name')
    .eq('league_id', 77)
    .eq('status', 'NS')
    .gt('kickoff_time', new Date().toISOString())
  for (const row of onexbetUpcoming ?? []) {
    await fillOnexbetPreMatch(supabase, row.id, apiKey, row.home_team_name, row.away_team_name)
  }

  // pregame_summary generation, all 7 competitions (77 WC, 100 Club
  // Friendlies, 47/87/54/55/53 the 5 European leagues). Ordered soonest-first
  // + capped: with the 5 leagues in scope this is ~1800 not-yet-generated
  // rows at once (mostly leagues whose season is months out) — without a
  // limit, every cron tick would walk the whole backlog sequentially (ESPN +
  // FOX + Fotmob per row) and risk a function timeout. The cap clears the
  // nearest-kickoff backlog first across repeated daily runs.
  const { data: needsSummary } = await supabase
    .from('matches')
    .select('id, league_id, api_football_id, kickoff_time, home_team_name, away_team_name')
    .in('league_id', [77, 100, 47, 87, 54, 55, 53])
    .eq('status', 'NS')
    .gt('kickoff_time', new Date().toISOString())
    .is('pregame_summary', null)
    .order('kickoff_time', { ascending: true })
    .limit(30)
  for (const row of needsSummary ?? []) {
    const text = await generatePregameSummary(row.league_id, row.api_football_id, row.kickoff_time, row.home_team_name, row.away_team_name)
    if (text) await supabase.from('matches').update({ pregame_summary: text }).eq('id', row.id)
  }

  // Skip hitting any provider (and burning quota) if no match is actually
  // pending an update — e.g. no live match and nothing kicked off yet.
  const { data: activeMatches } = await supabase
    .from('matches')
    .select('kickoff_time')
    .not('status', 'in', '(FT,AET,PEN)')
    .lte('kickoff_time', new Date().toISOString())

  if (!activeMatches || activeMatches.length === 0) {
    lastResult = { ok: true, source: null, updated: 0, scored: 0, errors: [], skipped: 'no active matches' }
    return NextResponse.json(lastResult)
  }

  // Providers only expose scores for the dates queried. Always check
  // today/yesterday for matches currently in progress, plus the kickoff date
  // of every stuck match — otherwise a match whose kickoff date this job
  // never ran a sync for stays stuck at its pre-kickoff status forever.
  const dates = new Set<string>()
  for (const offset of [-1, 0]) {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    dates.add(d.toISOString().slice(0, 10))
  }
  for (const m of activeMatches) dates.add(m.kickoff_time.slice(0, 10))
  const dateList = [...dates]

  const providers: [string, (key: string, dates: string[]) => Promise<ScoreUpdate[] | null>][] = [
    ['espn', tryEspn],
    ['365scores', try365Scores],
    ['livescore6', tryLivescore6],
    ['flashscore4', tryFlashscore4],
    ['free-football-api-data', tryFreeFootballApiData],
    ['footballdata.io', tryFootballDataIo],
  ]

  for (const [source, fn] of providers) {
    try {
      const updates = await fn(apiKey, dateList)
      if (updates && updates.length > 0) {
        const { updated, scored, errors } = await applyUpdates(supabase, updates, apiKey)
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
