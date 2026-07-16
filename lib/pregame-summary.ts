import { fetchEspnSummary } from './espn'
import { fetchFoxMatchup } from './fox'

// Free, no LLM call — rule-based prose from the same FOX/ESPN facts an
// LLM version would've used. Kept template-driven rather than templated
// per-stat text (e.g. "Team X leads Y 2.3 to 2.0") to read like a sentence
// rather than a stat dump.
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

// World Cup only for now (same scope as fetchFoxMatchup) — without FOX's
// pre-match stats/leaders there's not enough structured data to build a
// preview from, so this returns null rather than a near-empty paragraph.
export async function generatePregameSummary(leagueId: number, apiFootballId: number, kickoffIso: string, homeTeam: string, awayTeam: string): Promise<string | null> {
  const [summary, fox] = await Promise.all([
    fetchEspnSummary(leagueId, apiFootballId, kickoffIso, homeTeam, awayTeam),
    fetchFoxMatchup(kickoffIso, homeTeam, awayTeam),
  ])
  if (!fox?.teamStats && !fox?.teamLeaders) return null

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
