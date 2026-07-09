// One-off backfill for World Cup matches that finished before onexbet_stats
// existed. Normal sync-live only resolves a matchHash while a fixture is
// still upcoming (see lib/onexbet.ts's comment on why); already-finished
// matches from dropped-off rounds can't be found that way anymore.
//
// The way back in: team/matches/finished keeps a team's full match history
// for as long as that team is still alive in the tournament, and each
// entry carries both sides' teamHash — so crawling outward from any
// currently-known teamHash (seeded from matches whose pre-match fill
// already ran) discovers further teamHashes transitively, snowballing
// through the whole bracket. A match is only unreachable if both its teams
// were eliminated before either side's teamHash was ever captured.
//
// Not wired into any route — run manually: npx tsx scripts/backfill-onexbet.ts
import { createAdminClient } from '../lib/supabase/admin'
import { fetchTeamFinishedMatches, fetchOnexbetStats, OnexbetQuotaError } from '../lib/onexbet'
import { normalizeTeamName } from '../lib/espn'

// Basic tier is 500 req/month shared with everything else this project
// does — cap this single run well under whatever's left rather than
// draining it in one go.
const REQUEST_BUDGET = 200
// Crawling can't tell "unreachable" apart from "haven't found it yet" — once
// most needed matches already have a persisted matchHash, cap the crawl
// phase tightly so a handful of genuinely-unreachable stragglers don't
// re-walk the entire bracket graph again and eat the budget meant for
// filling. Bump this back up if `needed` ever gets a large fresh batch
// (e.g. after a new round of matches finishes).
const CRAWL_BUDGET = 20
let requestsSpent = 0

function matchKey(a: string, b: string): string {
  return [normalizeTeamName(a).toLowerCase(), normalizeTeamName(b).toLowerCase()].sort().join('|')
}

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY
  if (!apiKey) throw new Error('API_FOOTBALL_KEY not set')
  const supabase = createAdminClient()

  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, home_team_name, away_team_name, onexbet_stats')
    .eq('league_id', 77)
    .in('status', ['FT', 'AET', 'PEN'])
  if (error) throw error

  const needed = new Map<string, { id: string; home: string; away: string; matchHash: string | null }>()
  for (const m of matches ?? []) {
    const stats = m.onexbet_stats as any
    if (stats?.statistics) continue
    needed.set(matchKey(m.home_team_name, m.away_team_name), { id: m.id, home: m.home_team_name, away: m.away_team_name, matchHash: stats?.matchHash ?? null })
  }
  console.log(`${needed.size} finished matches still missing stats (${[...needed.values()].filter(m => m.matchHash).length} already have a matchHash from a previous run)`)

  // Seed the crawl from teamHashes already captured by sync-live's pre-match fill.
  const { data: seeded } = await supabase
    .from('matches')
    .select('onexbet_stats')
    .eq('league_id', 77)
    .not('onexbet_stats->teamHashes', 'is', null)
  const queue: string[] = []
  const seenTeamHash = new Set<string>()
  for (const row of seeded ?? []) {
    const th = (row.onexbet_stats as any)?.teamHashes
    for (const hash of [th?.home, th?.away]) {
      if (hash && !seenTeamHash.has(hash)) {
        seenTeamHash.add(hash)
        queue.push(hash)
      }
    }
  }
  console.log(`seeded crawl with ${queue.length} teamHashes`)

  // matchKey -> matchHash, pre-seeded with what earlier runs already found
  // and persisted (so we never pay to rediscover the same match twice).
  const discovered = new Map<string, string>()
  for (const [key, m] of needed) if (m.matchHash) discovered.set(key, m.matchHash)
  const stillMissing = () => [...needed.keys()].filter(k => !discovered.has(k)).length

  let quotaDead = false
  while (!quotaDead && queue.length > 0 && requestsSpent < CRAWL_BUDGET && stillMissing() > 0) {
    const teamHash = queue.shift()!
    requestsSpent++
    let finished: any[]
    try {
      finished = await fetchTeamFinishedMatches(apiKey, teamHash)
    } catch (e) {
      if (e instanceof OnexbetQuotaError) { console.log('monthly quota exceeded, stopping crawl'); quotaDead = true; break }
      throw e
    }
    for (const entry of finished) {
      const key = matchKey(entry.team1?.name ?? '', entry.team2?.name ?? '')
      if (needed.has(key) && !discovered.has(key)) {
        discovered.set(key, entry.matchHash)
        // Persist immediately — this is a free DB write, and means a future
        // run (even with zero request budget left) can skip straight to
        // filling instead of re-crawling from scratch.
        await supabase.from('matches').update({ onexbet_stats: { matchHash: entry.matchHash } }).eq('id', needed.get(key)!.id)
      }
      for (const hash of [entry.team1?.teamHash, entry.team2?.teamHash]) {
        if (hash && !seenTeamHash.has(hash)) {
          seenTeamHash.add(hash)
          queue.push(hash)
        }
      }
    }
  }
  console.log(`crawl spent ${requestsSpent} requests, discovered ${discovered.size}/${needed.size} matchHashes total`)

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  for (const [key, matchHash] of discovered) {
    if (requestsSpent + 4 > REQUEST_BUDGET) {
      console.log('request budget exhausted, stopping fill early — rerun the script later to pick up where this left off')
      break
    }
    const target = needed.get(key)!
    console.log(`filling ${target.home} vs ${target.away}...`)
    // match/statistics has been observed to intermittently come back empty
    // (confirmed transient — a retry moments later succeeds), so retry
    // in-place a couple times before giving up and moving on, rather than
    // silently persisting an empty result and burning the 4-request budget
    // for nothing.
    let stats: Record<string, any> = {}
    let quotaDead = false
    for (let attempt = 0; attempt < 3; attempt++) {
      requestsSpent += 4
      try {
        stats = await fetchOnexbetStats(apiKey, matchHash)
      } catch (e) {
        if (e instanceof OnexbetQuotaError) { quotaDead = true; break }
        throw e
      }
      if (stats.statistics) break
      await sleep(2000)
    }
    if (quotaDead) {
      console.log('monthly quota exceeded, stopping fill — rerun next month to pick up where this left off')
      break
    }
    if (!stats.statistics) console.log(`  gave up after retries, statistics still empty`)
    await supabase.from('matches').update({ onexbet_stats: { matchHash, ...stats } }).eq('id', target.id)
  }

  const unresolved = [...needed.keys()].filter(k => !discovered.has(k))
  if (unresolved.length > 0) {
    console.log(`${unresolved.length} matches unreachable (both teams eliminated before their teamHash was ever captured):`)
    for (const key of unresolved) {
      const m = needed.get(key)!
      console.log(`  ${m.home} vs ${m.away}`)
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
