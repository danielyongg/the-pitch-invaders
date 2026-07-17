// Fotmob's own frontend API — plain JSON, no key/signing required (unlike
// FOX's apikey scrape or Flashscore's x-fsign). Used for Club Friendlies,
// which FOX doesn't index at all (confirmed 2026-07-17: FOX's team schedule
// feed skips pre-season friendlies entirely, any month, any profile match).

// Fotmob's match-list feed abbreviates some names ("Man United", "Oberhausen"
// for "RW Oberhausen") differently from matchDetails' own team names, so
// resolution can't rely on exact string equality — comparing the last
// (most distinctive) word of the shorter name against the longer name
// covers both cases without a hand-maintained alias table.
function looseNameMatch(a: string, b: string): boolean {
  const an = a.toLowerCase().trim()
  const bn = b.toLowerCase().trim()
  if (an === bn || an.includes(bn) || bn.includes(an)) return true
  const shorter = an.length <= bn.length ? an : bn
  const longer = an.length <= bn.length ? bn : an
  const lastWord = shorter.split(/\s+/).pop()!
  return lastWord.length > 3 && longer.includes(lastWord)
}

async function resolveFotmobMatchId(kickoffIso: string, homeTeam: string, awayTeam: string): Promise<number | null> {
  const yyyymmdd = kickoffIso.slice(0, 10).replace(/-/g, '')
  const res = await fetch(`https://www.fotmob.com/api/data/matches?date=${yyyymmdd}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) return null
  const json = await res.json()
  for (const league of json.leagues ?? []) {
    if (!/friendl/i.test(league.name ?? '')) continue
    for (const m of league.matches ?? []) {
      if (looseNameMatch(m.home?.name ?? '', homeTeam) && looseNameMatch(m.away?.name ?? '', awayTeam)) return m.id
    }
  }
  return null
}

// h2h and teamForm are both populated pre-match (unlike Fotmob's own
// "stats" block, which — like ESPN's — stays empty until kickoff).
export async function fetchFotmobData(kickoffIso: string, homeTeam: string, awayTeam: string): Promise<{ h2h: any; teamForm: any; homeTeamId: number } | null> {
  const matchId = await resolveFotmobMatchId(kickoffIso, homeTeam, awayTeam)
  if (!matchId) return null

  const res = await fetch(`https://www.fotmob.com/api/data/matchDetails?matchId=${matchId}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) return null
  const json = await res.json()
  const homeTeamId = json.header?.teams?.[0]?.id
  if (!homeTeamId) return null
  return { h2h: json.content?.h2h ?? null, teamForm: json.content?.matchFacts?.teamForm ?? null, homeTeamId }
}
