import { LEAGUE_SLUGS } from './espn'

export const STANDINGS_LEAGUE_IDS = [47, 87, 54, 55, 53]

export interface StandingsRow {
  rank: number
  teamName: string
  teamLogo: string | null
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}

// ESPN's site-api standings endpoint (same undocumented family as the
// scoreboard/summary endpoints already used in lib/espn.ts) — shape
// confirmed by curling eng.1 directly: entries live at
// children[0].standings.entries[], each with a `team` object and a `stats`
// array of {name, value} pairs (gamesPlayed/wins/ties/losses/pointsFor/
// pointsAgainst/pointDifferential/points/rank).
export async function fetchStandings(leagueId: number): Promise<StandingsRow[] | null> {
  const slug = LEAGUE_SLUGS[leagueId]
  if (!slug) return null

  const res = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`, { next: { revalidate: 3600 } })
  if (!res.ok) return null
  const json = await res.json()

  const entries = json?.children?.[0]?.standings?.entries
  if (!Array.isArray(entries)) return null

  const stat = (entry: any, name: string) => entry.stats?.find((s: any) => s.name === name)?.value ?? 0

  return entries
    .map((e: any) => ({
      rank: stat(e, 'rank'),
      teamName: e.team?.shortDisplayName ?? e.team?.displayName ?? 'Unknown',
      teamLogo: e.team?.logos?.[0]?.href ?? null,
      played: stat(e, 'gamesPlayed'),
      wins: stat(e, 'wins'),
      draws: stat(e, 'ties'),
      losses: stat(e, 'losses'),
      goalsFor: stat(e, 'pointsFor'),
      goalsAgainst: stat(e, 'pointsAgainst'),
      goalDifference: stat(e, 'pointDifferential'),
      points: stat(e, 'points'),
    }))
    .sort((a, b) => a.rank - b.rank)
}
