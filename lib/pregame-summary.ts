import { fetchEspnSummary, relatedNewsFor } from './espn'
import { fetchFoxMatchup } from './fox'

// Groq's free tier (console.groq.com) — Gemini's free tier turned out to be
// unavailable for this account (limit: 0 on every model), Groq's isn't.
// OpenAI-compatible chat completions endpoint, no SDK.
const GROQ_MODEL = 'llama-3.3-70b-versatile'

// Compact facts sheet, not JSON — cheaper on tokens and the model reads a
// short bullet list just as well as a schema for a task this small.
function buildFacts(homeTeam: string, awayTeam: string, summary: any, fox: any): string {
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
    lines.push('\nHead-to-head history:')
    for (const e of h2h) lines.push(`- ${e.homeTeamScore}-${e.awayTeamScore} (${new Date(e.gameDate).toISOString().slice(0, 10)})`)
  }

  const news = relatedNewsFor(summary?.news?.articles ?? [], homeTeam, awayTeam).slice(0, 5)
  if (news.length > 0) {
    lines.push('\nRecent headlines:')
    for (const a of news) lines.push(`- ${a.headline}`)
  }

  return lines.join('\n')
}

async function generateWithGroq(apiKey: string, homeTeam: string, awayTeam: string, facts: string): Promise<string | null> {
  const prompt = `Write a neutral, engaging 3-4 sentence pre-match preview for ${homeTeam} vs ${awayTeam} using only the facts below. No headings, no bullet points, plain prose. Mention form, a key player or two, and what the head-to-head history suggests, if available.\n\n${facts}`
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

// World Cup only for now (same scope as fetchFoxMatchup) — without FOX's
// pre-match stats/leaders there's not enough structured data to build a
// preview from, so this returns null rather than a near-empty paragraph.
export async function generatePregameSummary(leagueId: number, apiFootballId: number, kickoffIso: string, homeTeam: string, awayTeam: string): Promise<string | null> {
  const [summary, fox] = await Promise.all([
    fetchEspnSummary(leagueId, apiFootballId, kickoffIso, homeTeam, awayTeam),
    fetchFoxMatchup(kickoffIso, homeTeam, awayTeam),
  ])
  if (!fox?.teamStats && !fox?.teamLeaders) return null

  const groqKey = process.env.GROQ_API_KEY
  if (groqKey) {
    const facts = buildFacts(homeTeam, awayTeam, summary, fox)
    const generated = await generateWithGroq(groqKey, homeTeam, awayTeam, facts)
    if (generated) return generated
  }

  return buildTemplateSummary(homeTeam, awayTeam, summary, fox)
}
