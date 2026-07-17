import { fetchEspnSummary, relatedNewsFor } from './espn'
import { fetchFoxMatchup } from './fox'
import { fetchFotmobData } from './fotmob'

// Groq's free tier (console.groq.com) — Gemini's free tier turned out to be
// unavailable for this account (limit: 0 on every model), Groq's isn't.
// OpenAI-compatible chat completions endpoint, no SDK.
const GROQ_MODEL = 'llama-3.3-70b-versatile'

// Compact facts sheet, not JSON — cheaper on tokens and the model reads a
// short bullet list just as well as a schema for a task this small.
function buildFacts(homeTeam: string, awayTeam: string, summary: any, fox: any, espnHomeId: string | number | undefined): string {
  const lines: string[] = []

  const statItems = fox?.teamStats?.items ?? []
  if (statItems.length > 0) {
    lines.push('Team stats (per-game averages):')
    for (const i of statItems) lines.push(`- ${i.title}: ${homeTeam} ${i.leftItemDetails?.title}, ${awayTeam} ${i.rightItemDetails?.title}`)
  }

  const leaderItems = fox?.teamLeaders?.items ?? []
  if (leaderItems.length > 0) {
    lines.push('\nTeam leaders:')
    for (const i of leaderItems) lines.push(`- ${i.title}: ${homeTeam} — ${i.leftItemDetails?.title} (${i.leftItemDetails?.subtitle}), ${awayTeam} — ${i.rightItemDetails?.title} (${i.rightItemDetails?.subtitle})`)
  }

  for (const team of summary?.lastFiveGames ?? []) {
    lines.push(`\n${team.team?.displayName} last 5 games:`)
    for (const e of team.events ?? []) lines.push(`- ${e.gameResult} ${e.score} vs ${e.opponent?.displayName}`)
  }

  const h2h = summary?.headToHeadGames?.[0]?.events ?? []
  if (h2h.length > 0) {
    lines.push('\nHead-to-head history (score always given as this match\'s home team first, away team second, regardless of who hosted that particular game):')
    for (const e of h2h) {
      const homeWasHome = String(e.homeTeamId) === String(espnHomeId)
      const homeScore = homeWasHome ? e.homeTeamScore : e.awayTeamScore
      const awayScore = homeWasHome ? e.awayTeamScore : e.homeTeamScore
      lines.push(`- ${homeTeam} ${homeScore}-${awayScore} ${awayTeam} (${new Date(e.gameDate).toISOString().slice(0, 10)})`)
    }
  }

  const news = relatedNewsFor(summary?.news?.articles ?? [], homeTeam, awayTeam).slice(0, 5)
  if (news.length > 0) {
    lines.push('\nRecent headlines:')
    for (const a of news) lines.push(`- ${a.headline}`)
  }

  return lines.join('\n')
}

// Fotmob path — used when FOX has no data for this league (currently Club
// Friendlies, which FOX doesn't index at all). teamForm's two entries are
// already in home/away order with resultString ("W"/"D"/"L") given from
// that side's own perspective, so unlike ESPN's lastFiveGames no remapping
// is needed. h2h.matches still needs the same home/away remap as ESPN's
// headToHeadGames, since a team can host either side across fixtures.
function buildFriendlyFacts(homeTeam: string, awayTeam: string, fotmob: any): string {
  const lines: string[] = []
  const [homeForm, awayForm] = fotmob?.teamForm ?? [[], []]

  if (homeForm?.length || awayForm?.length) {
    lines.push(`${homeTeam} last 5 games: ` + (homeForm ?? []).map((m: any) => m.resultString).join(', '))
    lines.push(`${awayTeam} last 5 games: ` + (awayForm ?? []).map((m: any) => m.resultString).join(', '))
  }

  const h2hMatches = fotmob?.h2h?.matches ?? []
  if (h2hMatches.length > 0) {
    lines.push('\nHead-to-head history (score always given as this match\'s home team first, away team second, regardless of who hosted that particular game):')
    for (const m of h2hMatches.slice(0, 5)) {
      const homeWasHome = String(m.home?.id) === String(fotmob.homeTeamId)
      const [s1, s2] = (m.status?.scoreStr ?? '').split(' - ')
      const homeScore = homeWasHome ? s1 : s2
      const awayScore = homeWasHome ? s2 : s1
      const date = m.time?.utcTime ? new Date(m.time.utcTime).toISOString().slice(0, 10) : ''
      lines.push(`- ${homeTeam} ${homeScore}-${awayScore} ${awayTeam} (${date})`)
    }
  }

  return lines.join('\n')
}

function buildFriendlyTemplateSummary(homeTeam: string, awayTeam: string, fotmob: any): string | null {
  const [homeForm, awayForm] = fotmob?.teamForm ?? [[], []]
  const h2hMatches = fotmob?.h2h?.matches ?? []

  const formSentence = [
    homeForm?.length ? `${homeTeam} come in ${homeForm.map((m: any) => m.resultString).join('')} across their last ${homeForm.length}.` : '',
    awayForm?.length ? `${awayTeam} come in ${awayForm.map((m: any) => m.resultString).join('')} across their last ${awayForm.length}.` : '',
  ].filter(Boolean).join(' ')

  let h2hSentence = ''
  if (h2hMatches.length > 0) {
    const latest = h2hMatches[0]
    const homeWasHome = String(latest.home?.id) === String(fotmob.homeTeamId)
    const [s1, s2] = (latest.status?.scoreStr ?? '').split(' - ')
    const homeScore = homeWasHome ? s1 : s2
    const awayScore = homeWasHome ? s2 : s1
    const date = latest.time?.utcTime ? new Date(latest.time.utcTime).toISOString().slice(0, 10) : ''
    h2hSentence = homeScore === awayScore
      ? `They last met on ${date}, drawing ${homeScore}-${awayScore}.`
      : `${Number(homeScore) > Number(awayScore) ? homeTeam : awayTeam} won their last meeting ${homeScore}-${awayScore} on ${date}.`
  }

  const sentences = [formSentence, h2hSentence].filter(Boolean)
  return sentences.length > 0 ? sentences.join(' ') : null
}

async function generateWithGroq(apiKey: string, homeTeam: string, awayTeam: string, facts: string): Promise<string | null> {
  const prompt = `Write a neutral, engaging 3-4 sentence pre-match preview for ${homeTeam} vs ${awayTeam} using only the facts below. No headings, no bullet points, plain prose. Mention form, a key player or two, and what the head-to-head history suggests, if available. Do not invent or infer any stat, record, score, date, or count that is not explicitly listed below — if the facts don't cover something (e.g. how many head-to-head meetings a team has won), don't mention it.\n\n${facts}`
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.choices?.[0]?.message?.content?.trim() ?? null
  } catch {
    return null
  }
}

// Rule-based fallback (no API call) — used when GROQ_API_KEY isn't set,
// or Groq's free tier rate-limits/errors on a given request, so the
// section still renders something instead of going empty.
function formLine(team: string, events: any[]): string {
  if (!events?.length) return ''
  const w = events.filter((e: any) => e.gameResult === 'W').length
  const l = events.filter((e: any) => e.gameResult === 'L').length
  const d = events.length - w - l
  const record = d > 0 ? `${w}W-${d}D-${l}L` : `${w}W-${l}L`
  return `${team} come in ${record} across their last ${events.length}.`
}

function leaderLine(items: any[], category: string, homeTeam: string, awayTeam: string): string {
  const item = items.find((i: any) => i.title === category)
  if (!item) return ''
  const home = item.leftItemDetails
  const away = item.rightItemDetails
  if (!home?.title || !away?.title) return ''
  return `${home.title} leads ${homeTeam} with ${home.subtitle} ${category.toLowerCase()}, while ${away.title} paces ${awayTeam} with ${away.subtitle}.`
}

function statLine(items: any[], title: string, homeTeam: string, awayTeam: string): string {
  const item = items.find((i: any) => i.title === title)
  if (!item?.leftItemDetails?.title || !item?.rightItemDetails?.title) return ''
  return `${homeTeam} average ${item.leftItemDetails.title} to ${awayTeam}'s ${item.rightItemDetails.title} in ${title.toLowerCase()}.`
}

// headToHeadGames' homeTeamId/awayTeamId refer to whichever side was home
// in that historical fixture, not necessarily this match's home team — so
// the score needs remapping onto homeTeam/awayTeam before it reads sensibly.
function h2hLine(events: any[], espnHomeId: string | number | undefined, homeTeam: string, awayTeam: string): string {
  if (!events?.length) return ''
  const [latest] = events
  const date = new Date(latest.gameDate).toISOString().slice(0, 10)
  const homeWasHome = String(latest.homeTeamId) === String(espnHomeId)
  const homeScore = homeWasHome ? latest.homeTeamScore : latest.awayTeamScore
  const awayScore = homeWasHome ? latest.awayTeamScore : latest.homeTeamScore
  if (homeScore === awayScore) return `They last met on ${date}, drawing ${homeScore}-${awayScore}.`
  const winner = Number(homeScore) > Number(awayScore) ? homeTeam : awayTeam
  return `${winner} won their last meeting ${homeScore}-${awayScore} on ${date}.`
}

function buildTemplateSummary(homeTeam: string, awayTeam: string, summary: any, fox: any): string | null {
  const homeForm = summary?.lastFiveGames?.find((t: any) => t.team?.displayName === homeTeam)?.events
  const awayForm = summary?.lastFiveGames?.find((t: any) => t.team?.displayName === awayTeam)?.events
  const h2h = summary?.headToHeadGames?.[0]?.events ?? []
  const espnHomeId = summary?.header?.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.id
  const statItems = fox?.teamStats?.items ?? []
  const leaderItems = fox?.teamLeaders?.items ?? []

  const sentences = [
    formLine(homeTeam, homeForm) + ' ' + formLine(awayTeam, awayForm),
    leaderLine(leaderItems, 'Goals', homeTeam, awayTeam),
    statLine(statItems, 'Goals per Game', homeTeam, awayTeam),
    h2hLine(h2h, espnHomeId, homeTeam, awayTeam),
  ].map(s => s.trim()).filter(Boolean)

  return sentences.length > 0 ? sentences.join(' ') : null
}

// FOX tried first (has richer per-game-average stats/leaders, but only
// covers the World Cup — and even there, only once teams have played
// enough games for those averages to exist). Falls back to Fotmob
// (h2h/teamForm) for everything else — Club Friendlies (FOX has zero
// coverage) and the 5 leagues (FOX resolves the fixture but its stats
// blocks are empty for e.g. each season's early matchdays). Returns null
// rather than a near-empty paragraph if neither has anything.
export async function generatePregameSummary(leagueId: number, apiFootballId: number, kickoffIso: string, homeTeam: string, awayTeam: string): Promise<string | null> {
  const [summary, fox] = await Promise.all([
    fetchEspnSummary(leagueId, apiFootballId, kickoffIso, homeTeam, awayTeam),
    fetchFoxMatchup(kickoffIso, homeTeam, awayTeam),
  ])

  if (fox?.teamStats || fox?.teamLeaders) {
    const groqKey = process.env.GROQ_API_KEY
    if (groqKey) {
      const espnHomeId = summary?.header?.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.id
      const facts = buildFacts(homeTeam, awayTeam, summary, fox, espnHomeId)
      const generated = await generateWithGroq(groqKey, homeTeam, awayTeam, facts)
      if (generated) return generated
    }
    return buildTemplateSummary(homeTeam, awayTeam, summary, fox)
  }

  const fotmob = await fetchFotmobData(kickoffIso, homeTeam, awayTeam)
  if (!fotmob?.h2h && !fotmob?.teamForm) return null

  const groqKey = process.env.GROQ_API_KEY
  if (groqKey) {
    const facts = buildFriendlyFacts(homeTeam, awayTeam, fotmob)
    const generated = await generateWithGroq(groqKey, homeTeam, awayTeam, facts)
    if (generated) return generated
  }

  return buildFriendlyTemplateSummary(homeTeam, awayTeam, fotmob)
}
