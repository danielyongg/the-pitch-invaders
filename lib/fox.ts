import { normalizeTeamName } from './espn'

// FOX's bifrost API requires an apikey query param that isn't publicly
// documented — it's embedded in the runtime config of any foxsports.com
// page. Scraped from the World Cup hub (stable, always live during the
// tournament) rather than the match page itself, since the apikey is
// site-wide, not per-event. This is unofficial and can break if FOX
// changes their bundling — every caller treats a null return as "skip".
async function getFoxApiKey(): Promise<string | null> {
  const res = await fetch('https://www.foxsports.com/soccer/fifa-world-cup', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 3600 },
  })
  if (!res.ok) return null
  const html = await res.text()
  return html.match(/bifrost:\{[^}]*?apiKey:"([a-zA-Z0-9_-]+)"/)?.[1] ?? null
}

// WC2026-only for now (2026-07-16: proving this out before extending to
// Club Friendlies / the 5 leagues, which use a different FOX URL scheme
// not yet verified). Resolves FOX's own numeric event id by scanning the
// month's schedule segment for a team-name match — FOX ids don't line up
// with ESPN's, so there's no shortcut via the stored api_football_id.
async function resolveFoxEventId(kickoffIso: string, homeTeam: string, awayTeam: string, apiKey: string): Promise<string | null> {
  const home = normalizeTeamName(homeTeam).toLowerCase()
  const away = normalizeTeamName(awayTeam).toLowerCase()
  const yyyymm = kickoffIso.slice(0, 7).replace('-', '')

  const res = await fetch(`https://api.foxsports.com/bifrost/v1/soccer/specialevent/wc/segment/${yyyymm}?apikey=${apiKey}`, { next: { revalidate: 3600 } })
  if (!res.ok) return null
  const json = await res.json()
  for (const section of json.sectionList ?? []) {
    for (const e of section.events ?? []) {
      const h = normalizeTeamName(e.upperTeam?.longName ?? '').toLowerCase()
      const a = normalizeTeamName(e.lowerTeam?.longName ?? '').toLowerCase()
      if (h === home && a === away) return e.contentUri?.split('/').pop() ?? null
    }
  }
  return null
}

// Raw teamStatsComparison + teamLeadersComparison blocks from FOX's matchup
// endpoint — both populated pre-match (unlike ESPN's boxscore/leaders,
// which are empty until kickoff). Fetched together so the two features that
// use this (Team Stats, Team Leaders) share one id resolution + apikey
// scrape instead of paying for it twice. Caller resolves left/right against
// home/away via leftEntityLink.title.
export async function fetchFoxMatchup(kickoffIso: string, homeTeam: string, awayTeam: string): Promise<{ teamStats: any; teamLeaders: any } | null> {
  const apiKey = await getFoxApiKey()
  if (!apiKey) return null
  const eventId = await resolveFoxEventId(kickoffIso, homeTeam, awayTeam, apiKey)
  if (!eventId) return null

  const res = await fetch(`https://api.foxsports.com/bifrost/v1/soccer/event/${eventId}/matchup?apikey=${apiKey}`, { next: { revalidate: 300 } })
  if (!res.ok) return null
  const json = await res.json()
  if (json.fault) return null
  return { teamStats: json.teamStatsComparison ?? null, teamLeaders: json.teamLeadersComparison ?? null }
}
