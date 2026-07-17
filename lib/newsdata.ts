import { createAdminClient } from './supabase/admin'

// Newsdata.io free tier is 200 requests/day — cached per team (not per
// match) so teams that recur across many matches/rounds only cost one
// fetch per TTL window, however many matches or page views reference them.
const TTL_MS = 6 * 60 * 60 * 1000

// Sportsbook/affiliate spam ("Best Betting Sites...", "How to Bet on...")
// rides along on team + "World Cup" searches since it's genuinely on-topic
// by keyword match — filter it out by title rather than tightening the
// query further and losing real coverage.
const BETTING_RE = /\b(bet|betting|bets|sportsbook|odds|wager|bonus code|free bet|promo code)\b/i

// User-picked trusted sources, out of the ~100 in Newsdata's sports
// category listing — most of the rest are small local newspapers unrelated
// to football coverage.
const SOURCES = 'espn,bbc,skysports,caughtoffside'
// Newsdata's own source_name field is unreliably capitalized ("The Bbc") —
// display names for the same allowlist above.
const SOURCE_NAMES: Record<string, string> = { espn: 'ESPN', bbc: 'BBC', skysports: 'Sky Sports', caughtoffside: 'CaughtOffside' }

// Normalized to the same shape ESPN's relatedNewsFor() articles already
// render with (id/headline/published/links.web.href/images[0].url), so the
// match-detail page can just concat both sources with no extra branching.
function normalize(results: any[]): any[] {
  return (results ?? [])
    .filter((r: any) => !BETTING_RE.test(r.title ?? ''))
    .map((r: any) => ({
      id: r.article_id,
      headline: r.title,
      published: r.pubDate ? `${r.pubDate.replace(' ', 'T')}Z` : null,
      links: { web: { href: r.link } },
      images: r.image_url ? [{ url: r.image_url }] : [],
      source: SOURCE_NAMES[r.source_id] ?? r.source_id,
    }))
}

// National-team names (World Cup) double as country names — "England"/
// "France" match cricket, rugby, and general BBC news within the same
// football-outlet domain allowlist (e.g. "Root leads England to victory"
// against India, or a policy story just set in England). Club names
// (Arsenal, Wrexham, ...) aren't ambiguous this way, and requiring a
// football keyword on those returns nothing — headlines like "Arsenal
// agree fee to sign Greek winger" never say the word "football" — so the
// extra disambiguation only applies when leagueId is the World Cup's.
const WORLD_CUP_LEAGUE_ID = 77

export async function fetchTeamNews(teamName: string, leagueId: number): Promise<any[]> {
  const apiKey = process.env.NEWSDATA_API_KEY
  if (!apiKey) return []

  const supabase = createAdminClient()
  const { data: cached } = await supabase.from('team_news').select('articles, fetched_at').eq('team_name', teamName).maybeSingle()
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) {
    return cached.articles ?? []
  }

  try {
    // qInTitle (not a bare q= body search, which matched the team name
    // anywhere in the article and pulled in unrelated golf/cycling/stock
    // pieces that just mentioned the country).
    const q = leagueId === WORLD_CUP_LEAGUE_ID
      ? encodeURIComponent(`"${teamName}" AND ("World Cup" OR football OR soccer)`)
      : encodeURIComponent(`"${teamName}"`)
    const res = await fetch(`https://newsdata.io/api/1/news?apikey=${apiKey}&qInTitle=${q}&language=en&domain=${SOURCES}`)
    if (!res.ok) return cached?.articles ?? []
    const json = await res.json()
    const articles = normalize(json.results ?? [])
    await supabase.from('team_news').upsert({ team_name: teamName, articles, fetched_at: new Date().toISOString() })
    return articles
  } catch {
    return cached?.articles ?? []
  }
}
