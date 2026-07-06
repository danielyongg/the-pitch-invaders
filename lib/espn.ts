// Shared ESPN (site.api.espn.com) status mapping — used by sync-fixtures
// (schedule sync) and sync-live (score/status sync). ESPN doesn't expose a
// status enum in its docs (it's an unofficial public API), so this is built
// from observed values rather than documentation.
export function mapEspnStatus(type: { name: string; state: string }, displayClock?: string): string {
  if (type.state === 'pre') return 'NS'
  if (type.name === 'STATUS_POSTPONED' || type.name === 'STATUS_CANCELED') return 'PST'
  if (type.state === 'post') {
    if (type.name.includes('PEN')) return 'PEN'
    if (type.name.includes('AET') || type.name.includes('EXTRA')) return 'AET'
    return 'FT'
  }
  if (type.name === 'STATUS_HALFTIME') return 'HT'
  // In-progress — displayClock is minute text ("46'"), matches the format
  // MatchCard already renders as-is for other live-minute providers.
  return displayClock || 'LIVE'
}

// A handful of national teams ESPN spells outright differently from what's
// stored in the DB (not just punctuation) — e.g. ESPN calls the US team
// "United States" where our data (and MatchCard's own flag lookup) uses
// "USA". Map both known spellings to one canonical form.
const TEAM_ALIASES: Record<string, string> = {
  'united states': 'usa',
  'czech republic': 'czechia',
  'turkey': 'turkiye',
}

// Providers spell some team names differently than what's stored in the DB
// (e.g. "Bosnia & Herzegovina" vs "Bosnia and Herzegovina") — normalize both
// sides the same way before matching.
export function normalizeTeamName(name: string): string {
  const withAnd = name.replace(/&/g, 'and')
  return TEAM_ALIASES[withAnd.toLowerCase()] ?? withAnd
}

// ESPN's site-api scoreboard slug per internal league_id — the one place
// this mapping lives, so match-detail lookups and any future sync code
// stay in sync with each other.
export const LEAGUE_SLUGS: Record<number, string> = {
  77: 'fifa.world',
  47: 'eng.1',
  87: 'esp.1',
  54: 'ger.1',
  55: 'ita.1',
  53: 'fra.1',
  100: 'club.friendly',
}

// World Cup rows predate this project's switch to ESPN (2026-07-03) and
// still carry their original (non-ESPN) provider's numeric id, so
// `api_football_id` can't be trusted to be an ESPN event id for every
// match. Resolve it for real by searching the scoreboard for the match's
// kickoff date and matching on team names, same technique sync-live already
// uses to apply score updates.
export async function resolveEspnEventId(slug: string, kickoffIso: string, homeTeam: string, awayTeam: string): Promise<string | null> {
  const kickoff = new Date(kickoffIso)
  const home = normalizeTeamName(homeTeam).toLowerCase()
  const away = normalizeTeamName(awayTeam).toLowerCase()

  for (const offset of [0, -1, 1]) {
    const d = new Date(kickoff)
    d.setUTCDate(d.getUTCDate() + offset)
    const date = d.toISOString().slice(0, 10).replace(/-/g, '')

    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${date}`, { next: { revalidate: 0 } })
    if (!res.ok) continue
    const json = await res.json()
    for (const e of json.events ?? []) {
      const comp = e.competitions[0]
      const h = comp.competitors.find((c: any) => c.homeAway === 'home')?.team?.displayName ?? ''
      const a = comp.competitors.find((c: any) => c.homeAway === 'away')?.team?.displayName ?? ''
      if (normalizeTeamName(h).toLowerCase() === home && normalizeTeamName(a).toLowerCase() === away) return e.id
    }
  }
  return null
}

// Full match detail (stats, lineups, timeline, head-to-head) for the match
// detail page. Tries the stored id directly first (correct already for
// leagues/friendlies, synced straight from ESPN) and only falls back to the
// date+team-name search above when that fails (World Cup's stale ids, or
// any other mismatch).
export async function fetchEspnSummary(leagueId: number, apiFootballId: number, kickoffIso: string, homeTeam: string, awayTeam: string): Promise<any | null> {
  const slug = LEAGUE_SLUGS[leagueId]
  if (!slug) return null

  async function trySummary(eventId: number | string): Promise<any | null> {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/summary?event=${eventId}`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    const json = await res.json()
    if (json.code) return null // ESPN's error shape: { code, message }
    return json
  }

  const direct = await trySummary(apiFootballId)
  if (direct) return direct

  const resolvedId = await resolveEspnEventId(slug, kickoffIso, homeTeam, awayTeam)
  if (!resolvedId) return null
  return trySummary(resolvedId)
}
