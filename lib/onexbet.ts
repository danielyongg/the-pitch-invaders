import { normalizeTeamName } from '@/lib/espn'

// RapidAPI is on the Basic (500 req/month) tier — every call here must be
// spent deliberately.
const HOST = '1xbet12.p.rapidapi.com'
const BASE = `https://${HOST}/api/1xbet/v1`

// FIFA World Cup 2026's championshipId in 1xBet's own id space (unrelated
// to ESPN's event ids or our league_id). Found via the general search
// endpoint.
const WORLD_CUP_2026_CHAMPIONSHIP_ID = 2708736

// Thrown (not swallowed as null) so callers that retry-in-a-loop — like
// scripts/backfill-onexbet.ts — can tell "quota's dead, stop entirely" apart
// from an ordinary transient empty response and bail out instantly instead
// of burning the retry budget on every remaining match.
export class OnexbetQuotaError extends Error {}

async function onexbetFetch(apiKey: string, path: string, params: Record<string, string>): Promise<any | null> {
  const qs = new URLSearchParams({ ...params, lang: 'en' })
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': HOST },
    next: { revalidate: 0 },
  })
  if (res.status === 429) throw new OnexbetQuotaError('1xBet RapidAPI monthly quota exceeded')
  if (!res.ok) return null
  return res.json()
}

// IMPORTANT: prematch/championship-matches (and the live equivalent) only
// ever lists the *current* round's fixtures, regardless of the `date`
// param — a match disappears from here once it's no longer the active
// round (confirmed empirically: none of ~90 already-played World Cup
// matches turn up here, only the round still to be played). So a match's
// matchHash can only ever be resolved by name *before* it drops out of this
// list — i.e. while it's upcoming. Callers must resolve-and-persist the
// hash early (see sync-live's pre-match fill) rather than re-resolving
// after the fact, which will silently fail for anything already finished.
export async function resolveOnexbetMatchHash(apiKey: string, homeTeam: string, awayTeam: string): Promise<string | null> {
  const fixtures = await onexbetFetch(apiKey, '/prematch/championship-matches', {
    date: new Date().toISOString().slice(0, 10),
    championshipId: String(WORLD_CUP_2026_CHAMPIONSHIP_ID),
  })
  if (!Array.isArray(fixtures)) return null

  // Neutral-venue tournament matches: 1xBet doesn't necessarily agree with
  // our own home/away assignment (which comes from ESPN), so match either
  // orientation — the actual side order doesn't matter to any caller here,
  // they only ever look team names back up by name, not by team1/team2 position.
  const home = normalizeTeamName(homeTeam).toLowerCase()
  const away = normalizeTeamName(awayTeam).toLowerCase()
  const match = fixtures.find((m: any) => {
    const t1 = normalizeTeamName(m.team1?.name ?? '').toLowerCase()
    const t2 = normalizeTeamName(m.team2?.name ?? '').toLowerCase()
    return (t1 === home && t2 === away) || (t1 === away && t2 === home)
  })
  return match?.matchHash ?? null
}

// The list endpoints above only expose a numeric team id (a different id
// space from teamHash, and not accepted by any team/* endpoint) — the real
// hex teamHash only shows up inside a match's own detail response. So once
// we have a matchHash, one cheap call to match/statistics bridges the two.
// Exported so callers can resolve+cache this once themselves instead of
// paying for it again on every retry (see fetchOnexbetPreMatch below).
export async function resolveTeamHashes(apiKey: string, matchHash: string): Promise<{ home: string; away: string } | null> {
  const stats = await onexbetFetch(apiKey, '/match/statistics', { matchHash })
  if (!stats?.team1?.teamHash || !stats?.team2?.teamHash) return null
  return { home: stats.team1.teamHash, away: stats.team2.teamHash }
}

// Supplemental stats to fill in what ESPN's summary doesn't cover: team
// stats (possession/xG/shots/etc, split by half), per-player match ratings,
// and pre-match style-of-play + in-match heatmap. Fetched once per match
// (4 requests) and persisted to matches.onexbet_stats — never refetched.
// Note: style-of-play has come back empty for every World Cup match tried
// (finished and upcoming alike), while the same endpoint works fine for an
// EPL match — looks like a genuine coverage gap for this competition on
// 1xBet's side, not a bug here. Still fetched in case it fills in later.
export async function fetchOnexbetStats(apiKey: string, matchHash: string): Promise<Record<string, any>> {
  const [statistics, playerStats, topPerformers, styleOfPlay, heatmap] = await Promise.all([
    onexbetFetch(apiKey, '/match/statistics', { matchHash }),
    onexbetFetch(apiKey, '/match/player-stats', { matchHash }),
    onexbetFetch(apiKey, '/match/top-performers', { matchHash }),
    onexbetFetch(apiKey, '/match/style-of-play', { matchHash }),
    onexbetFetch(apiKey, '/match/heatmap', { matchHash }),
  ])
  return { statistics, playerStats, topPerformers, styleOfPlay, heatmap }
}

// Unlike the fixture-list endpoints, team/matches/finished keeps a team's
// full match history (with matchHash) for as long as that team is still in
// the tournament — even matches from rounds long since dropped out of
// prematch/championship-matches. So a match that already finished before
// this feature existed IS still resolvable, just not by searching fixture
// lists: crawl outward from any currently-known teamHash (see
// scripts/backfill-onexbet.ts), which surfaces both that team's own past
// matchHashes and its opponents' teamHashes for further crawling. The only
// permanently unreachable matches are ones where *both* teams were already
// eliminated before we ever captured either side's teamHash.
export async function fetchTeamFinishedMatches(apiKey: string, teamHash: string): Promise<any[]> {
  const matches = await onexbetFetch(apiKey, '/team/matches/finished', { teamHash })
  return Array.isArray(matches) ? matches : []
}

// Pre-match only: narrative preview + each team's last 5 results. Actual
// match stats (possession/xG/etc) don't exist before kickoff — there's no
// season-aggregate endpoint, and computing one would mean fetching every
// past match's statistics per team (way more than this fits in quota-wise).
// `teamHashes` can be passed in already-resolved (see sync-live) so a retry
// — needed because 1xBet's own recentForm data can come back genuinely
// empty on a given call — doesn't pay for the bridge lookup again.
export async function fetchOnexbetPreMatch(apiKey: string, matchHash: string, teamHashes?: { home: string; away: string } | null): Promise<Record<string, any> | null> {
  const resolved = teamHashes ?? await resolveTeamHashes(apiKey, matchHash)
  if (!resolved) return null

  const [prediction, homeForm, awayForm] = await Promise.all([
    onexbetFetch(apiKey, '/match/prediction', { matchHash }),
    fetchTeamFinishedMatches(apiKey, resolved.home),
    fetchTeamFinishedMatches(apiKey, resolved.away),
  ])
  const recentForm = { home: homeForm.slice(0, 5), away: awayForm.slice(0, 5) }
  return { prediction, recentForm }
}
