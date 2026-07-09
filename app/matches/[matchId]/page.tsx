export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchEspnSummary, normalizeTeamName } from '@/lib/espn'
import type { Match } from '@/lib/supabase/types'

interface Props {
  params: Promise<{ matchId: string }>
}

// This runs server-side (Vercel's server TZ, not the viewer's) — pin to
// WIB explicitly instead of leaving it to whatever TZ the server happens
// to be in, which was rendering literal UTC kickoff_time as if it were
// local time.
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }) + ' WIB'
}

const GOAL_TYPES = ['goal', 'goal---header', 'goal---volley', 'penalty---scored', 'own-goal']

// Position codes ESPN assigns per player, ordered left-to-right across the
// pitch. Covers the common back-4/back-3, double-pivot, and front-3/4
// shapes; anything unlisted falls back to the middle of its row.
const POSITION_ORDER: Record<string, number> = {
  'LB': 0, 'LWB': 0, 'LM': 0, 'LW': 0, 'AM-L': 0, 'CD-L': 1, 'CB-L': 1, 'DM-L': 1, 'CM-L': 1,
  'CD': 1.5, 'CB': 1.5, 'SW': 1.5, 'DM': 1.5, 'CM': 1.5, 'AM': 1.5, 'F': 1.5, 'ST': 1.5, 'CF': 1.5,
  'CD-R': 2, 'CB-R': 2, 'DM-R': 2, 'CM-R': 2, 'RB': 3, 'RWB': 3, 'RM': 3, 'RW': 3, 'AM-R': 3,
}

// Groups a starting XI into pitch rows (GK → defense → mid → attacking mid
// → forwards), ordered left-to-right within each row. ESPN doesn't give
// exact x/y coordinates for outfield players, so the row split is inferred
// from the position abbreviation rather than pixel-perfect placement.
function pitchRows(roster: any[]): any[][] {
  const rowOf = (abbr: string) => {
    if (abbr === 'G') return 0
    if (/^(CD|CB|LB|RB|WB)/.test(abbr)) return 1
    if (/^(DM|CM|LM|RM)$|^(DM|CM)-/.test(abbr)) return 2
    if (/^AM/.test(abbr)) return 3
    return 4
  }
  const rows: any[][] = [[], [], [], [], []]
  for (const p of roster) {
    const abbr = p.position?.abbreviation ?? ''
    rows[rowOf(abbr)].push(p)
  }
  for (const row of rows) {
    row.sort((a, b) => (POSITION_ORDER[a.position?.abbreviation] ?? 1.5) - (POSITION_ORDER[b.position?.abbreviation] ?? 1.5))
  }
  return rows.filter(r => r.length > 0)
}

// Perceived-brightness check so jersey-colored chips (incl. bright yellow
// kits like Brazil's) always get a legible number color.
function contrastText(hex?: string): string {
  if (!hex || hex.length !== 6) return '#002e6a'
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#002e6a' : '#ffffff'
}

// 1xBet's top-performers ratings only cover a team's standout ~3 players,
// not the full XI (that's all the source data has) — so the badge only
// shows up for whoever's in that list, everyone else's chip looks as before.
function ratingColor(score: number): string {
  if (score >= 7.5) return '#22c55e'
  if (score >= 6.5) return '#3b82f6'
  return '#eab308'
}

function PlayerChip({ p, teamColor, rating, onPitch = true }: { p: any; teamColor?: string; rating?: number; onPitch?: boolean }) {
  const goals = p.stats?.find((s: any) => s.name === 'totalGoals')?.value ?? 0
  const yellow = p.stats?.find((s: any) => s.name === 'yellowCards')?.value ?? 0
  const red = p.stats?.find((s: any) => s.name === 'redCards')?.value ?? 0
  const bg = teamColor ? `#${teamColor}` : '#aec6ff'
  return (
    <div className="flex flex-col items-center gap-1 w-16">
      <div className="relative w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-2 border-white/70" style={{ background: bg, color: contrastText(teamColor) }}>
        {p.jersey}
        {red > 0 && <span className="absolute -top-1 -right-1 w-3 h-4 bg-red-600 rounded-sm border border-white" />}
        {!red && yellow > 0 && <span className="absolute -top-1 -right-1 w-3 h-4 bg-yellow-400 rounded-sm border border-white" />}
        {goals > 0 && <span className="absolute -bottom-1 -right-1 text-[10px]">⚽</span>}
        {rating != null && (
          <span
            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] font-bold px-1 rounded tabular-nums text-white"
            style={{ background: ratingColor(rating) }}
          >
            {rating.toFixed(1)}
          </span>
        )}
      </div>
      <span className={onPitch ? 'text-[10px] text-center text-white leading-tight [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]' : 'text-[10px] text-center text-[var(--color-text-primary)] leading-tight'}>{p.athlete.shortName ?? p.athlete.displayName}</span>
    </div>
  )
}

export default async function MatchDetailPage({ params }: Props) {
  const { matchId } = await params
  const supabase = await createClient()
  const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single()
  if (!match) notFound()
  const m = match as Match

  const summary = await fetchEspnSummary(m.league_id, m.api_football_id, m.kickoff_time, m.home_team_name, m.away_team_name)

  // Our own home_team_id/away_team_id (and home_team_logo/away_team_logo for
  // World Cup rows) can be stale for the same reason api_football_id can be
  // — derive everything from the summary response itself instead.
  const espnCompetitors: any[] = summary?.header?.competitions?.[0]?.competitors ?? []
  const espnHomeId = espnCompetitors.find((c: any) => c.homeAway === 'home')?.team?.id
  const isHomeId = (id: string | number) => String(id) === String(espnHomeId)

  // Same staleness issue as the logos below — World Cup rows never had
  // `venue` backfilled from the pre-ESPN seed, so fall back to ESPN's data.
  const venue = m.venue || summary?.gameInfo?.venue?.fullName

  const boxscoreTeams: any[] = summary?.boxscore?.teams ?? []
  const homeBox = boxscoreTeams.find(t => isHomeId(t.team.id))
  const awayBox = boxscoreTeams.find(t => !isHomeId(t.team.id))
  const homeLogo = homeBox?.team?.logo || m.home_team_logo
  const awayLogo = awayBox?.team?.logo || m.away_team_logo

  // Curated subset (user-picked, 2026-07-06) — ESPN doesn't expose Expected
  // Goals, Big Chances Created/Missed, or Duels Won for this data source
  // (confirmed against multiple matches/competitions), so those are skipped
  // rather than faked. `passPct` comes back as a 0-1 fraction while
  // `possessionPct` is already 0-100, hence the isFractionPct flag.
  const STAT_ROWS: { name: string; label: string; isFractionPct?: boolean }[] = [
    { name: 'possessionPct', label: 'Possession' },
    { name: 'totalShots', label: 'Total Shots' },
    { name: 'shotsOnTarget', label: 'Shots on Target' },
    { name: 'passPct', label: 'Pass Completion %', isFractionPct: true },
    { name: 'wonCorners', label: 'Corner Kicks' },
    { name: 'offsides', label: 'Offsides' },
    { name: 'yellowCards', label: 'Yellow Cards' },
    { name: 'redCards', label: 'Red Cards' },
  ]
  const statVal = (stats: any[], name: string) => stats?.find((s: any) => s.name === name)
  const statRows = STAT_ROWS.map(row => {
    const home = statVal(homeBox?.statistics, row.name)
    const away = statVal(awayBox?.statistics, row.name)
    if (!home || !away) return null
    const scale = row.isFractionPct ? 100 : 1
    const homeNum = (parseFloat(home.displayValue) || 0) * scale
    const awayNum = (parseFloat(away.displayValue) || 0) * scale
    const total = homeNum + awayNum
    const fmt = (n: number) => (row.name === 'possessionPct' || row.isFractionPct) ? `${Math.round(n)}%` : `${n}`
    return {
      label: row.label,
      homeDisplay: fmt(homeNum),
      awayDisplay: fmt(awayNum),
      // 0-0 (e.g. no red cards for either side) has no meaningful split —
      // show an even bar instead of one side defaulting to 0% (all-red/all-blue).
      homeShare: total === 0 ? 50 : (homeNum / total) * 100,
    }
  }).filter((r): r is NonNullable<typeof r> => r != null)

  // Pre-match: boxscore.teams[].statistics swaps to a small tournament-form
  // set (goalDifference/totalGoals/goalAssists/goalsConceded) instead of the
  // 28-field post-match breakdown above — this only exists before kickoff,
  // so it and Match Stats never both render for the same match. Turned
  // into per-match averages using the "last 5 games" form list to count
  // matches actually played this tournament (non-friendly).
  // Known gap: that list is capped at 5, so a team past ~5 tournament
  // matches (deep knockout runs) will undercount and inflate the averages —
  // there's no explicit "matches played" field anywhere else in this
  // response to fall back on.
  function matchesPlayed(teamName: string): number {
    const form = (summary?.boxscore?.form ?? []).find((f: any) => f.team?.displayName === teamName)
    return (form?.events ?? []).filter((e: any) => !(e.competitionName ?? '').toLowerCase().includes('friendly')).length
  }
  const FORM_STAT_ROWS = [
    { name: 'totalGoals', label: 'Average Goals' },
    { name: 'goalsConceded', label: 'Average Goals Conceded' },
    { name: 'goalDifference', label: 'Average Goal Differential' },
    { name: 'goalAssists', label: 'Average Assists' },
  ]
  const homeMatches = matchesPlayed(m.home_team_name)
  const awayMatches = matchesPlayed(m.away_team_name)

  // 1xBet supplement (World Cup only, fetched once at full-time by
  // sync-live — never fetched here, so this section simply doesn't render
  // pre-match or for non-WC matches). Heatmap is stored in onexbet_stats
  // but not rendered — plotting it on a pitch is a separate feature, not
  // just a stats list.
  const onexbet = m.onexbet_stats as any
  const prediction: string[] = onexbet?.prediction?.prediction ?? []

  // recentForm.{home,away} are 1xBet's raw "team's last 5 finished matches"
  // lists — each entry only knows team1/team2, not which side is "us", so
  // resolve W/D/L and the opponent's name by matching against our own team
  // name (normalized the same way sync-live matches ESPN team names).
  function formLine(entries: any[], teamName: string) {
    const norm = normalizeTeamName(teamName).toLowerCase()
    return entries.map((e: any) => {
      const isTeam1 = normalizeTeamName(e.team1?.name ?? '').toLowerCase() === norm
      const us = isTeam1 ? e.score1 : e.score2
      const them = isTeam1 ? e.score2 : e.score1
      const opponent = isTeam1 ? e.team2?.name : e.team1?.name
      const result = us > them ? 'W' : us < them ? 'L' : 'D'
      return { opponent, us, them, result }
    })
  }
  const recentForm = onexbet?.recentForm
  const homeForm = recentForm ? formLine(recentForm.home, m.home_team_name) : []
  const awayForm = recentForm ? formLine(recentForm.away, m.away_team_name) : []
  const formStatRows = (homeMatches && awayMatches) ? FORM_STAT_ROWS.map(row => {
    const home = statVal(homeBox?.statistics, row.name)
    const away = statVal(awayBox?.statistics, row.name)
    if (!home || !away) return null
    const homeAvg = (parseFloat(home.displayValue) || 0) / homeMatches
    const awayAvg = (parseFloat(away.displayValue) || 0) / awayMatches
    const fmt = (n: number) => (n > 0 && row.name === 'goalDifference' ? '+' : '') + n.toFixed(1)
    const total = Math.abs(homeAvg) + Math.abs(awayAvg)
    return {
      label: row.label,
      homeDisplay: fmt(homeAvg),
      awayDisplay: fmt(awayAvg),
      homeShare: total === 0 ? 50 : (Math.abs(homeAvg) / total) * 100,
    }
  }).filter((r): r is NonNullable<typeof r> => r != null) : []

  const rosters: any[] = summary?.rosters ?? []
  const homeRoster = rosters.find(r => isHomeId(r.team.id))
  const awayRoster = rosters.find(r => !isHomeId(r.team.id))

  // Name-matched against ESPN's roster (1xBet has no shared player id with
  // ESPN). Both sources abbreviate to "surname + initial", but disagree on
  // order — ESPN: "F. Lastname", 1xBet: "Lastname F." — so strip any
  // single-letter/initial token from either end rather than assuming a
  // fixed position, leaving just the surname both sides agree on.
  // match/player-stats covers the full squad (starters + subs), unlike
  // top-performers which only lists ~3 standouts per team — so this is the
  // source for the lineup rating badge.
  const surname = (n: string) => n.trim().toLowerCase().split(/\s+/).filter(t => !/^[a-z]\.?$/.test(t)).join(' ') || n.trim().toLowerCase()
  const ratingsByName = new Map<string, number>()
  const playerStats: any[] = onexbet?.playerStats ?? []
  for (const team of playerStats) {
    const summary = team.categories?.find((c: any) => c.title === 'Summary')
    for (const row of summary?.players ?? []) {
      const name = row.player?.shortName ?? row.player?.name
      const rating = parseFloat(row.stats?.R)
      if (name && !Number.isNaN(rating)) ratingsByName.set(surname(name), rating)
    }
  }
  const ratingFor = (p: any) => ratingsByName.get(surname(p.athlete?.shortName ?? p.athlete?.displayName ?? ''))

  const keyEvents: any[] = summary?.keyEvents ?? []
  const timelineEvents = keyEvents
    .filter((e: any) => ['goal', 'goal---header', 'goal---volley', 'penalty---scored', 'own-goal', 'yellow-card', 'red-card', 'substitution'].includes(e.type?.type))
    .sort((a: any, b: any) => (a.clock?.value ?? 0) - (b.clock?.value ?? 0))

  function timelineLabel(e: any): string {
    if (e.type.type === 'substitution') {
      const [inP, outP] = e.participants ?? []
      return inP && outP ? `${inP.athlete.displayName} ↔ ${outP.athlete.displayName}` : (e.text ?? 'Substitution')
    }
    const scorer = e.participants?.[0]?.athlete?.displayName
    const assist = e.participants?.[1]?.athlete?.displayName
    if (e.type.type === 'yellow-card') return `${scorer ?? 'Yellow Card'} (Yellow Card)`
    if (e.type.type === 'red-card') return `${scorer ?? 'Red Card'} (Red Card)`
    if (!scorer) return e.type.text
    const tag = e.type.type === 'own-goal' ? ' (Own Goal)' : e.type.type === 'penalty---scored' ? ' (Penalty)' : ''
    return `${scorer}${tag}${assist ? ` — assist ${assist}` : ''}`
  }

  function eventIcon(type: string) {
    if (type === 'yellow-card') return '🟨'
    if (type === 'red-card') return '🟥'
    if (type === 'substitution') return '↔️'
    return '⚽'
  }

  // Compact goal-scorer summary for the score header, grouped by team + player.
  function scorersFor(teamName: string) {
    const map = new Map<string, string[]>()
    for (const e of keyEvents) {
      if (e.team?.displayName !== teamName || !GOAL_TYPES.includes(e.type?.type)) continue
      const name = e.participants?.[0]?.athlete?.displayName
      if (!name) continue
      const tag = e.type.type === 'penalty---scored' ? ' Pen' : e.type.type === 'own-goal' ? ' OG' : ''
      if (!map.has(name)) map.set(name, [])
      map.get(name)!.push(`${e.clock.displayValue}${tag}`)
    }
    return [...map.entries()].map(([name, minutes]) => ({ name, minutes }))
  }
  function redCardsFor(teamName: string) {
    return keyEvents
      .filter((e: any) => e.team?.displayName === teamName && e.type?.type === 'red-card')
      .map((e: any) => ({ name: e.participants?.[0]?.athlete?.displayName, minute: e.clock.displayValue }))
  }
  const homeScorers = scorersFor(m.home_team_name)
  const awayScorers = scorersFor(m.away_team_name)
  const homeReds = redCardsFor(m.home_team_name)
  const awayReds = redCardsFor(m.away_team_name)

  const h2hEvents: any[] = summary?.headToHeadGames?.[0]?.events ?? []

  // ESPN tags each news item with the teams it's about — filter the
  // competition-wide feed down to ones actually mentioning either side,
  // since the raw feed is the same for every match in the competition.
  const homeNameNorm = normalizeTeamName(m.home_team_name).toLowerCase()
  const awayNameNorm = normalizeTeamName(m.away_team_name).toLowerCase()
  const relatedNews: any[] = (summary?.news?.articles ?? []).filter((a: any) =>
    (a.categories ?? []).some((c: any) => {
      if (c.type !== 'team' || !c.description) return false
      const name = normalizeTeamName(c.description).toLowerCase()
      return name === homeNameNorm || name === awayNameNorm
    })
  )

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <a href="/matches" className="text-sm text-[var(--color-accent-text)] hover:text-[var(--color-accent-hover)] font-[var(--font-jetbrains)] tracking-wide">
        ← Back to Matches
      </a>

      {/* Header */}
      <div className="glass-card rounded-2xl p-8 mt-4 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 flex flex-col items-center gap-2">
            {homeLogo && <img src={homeLogo} alt={m.home_team_name} className={m.league_id === 77 ? 'w-16 h-11 object-cover rounded' : 'w-16 h-16 object-contain'} />}
            <span className="font-[var(--font-anybody)] font-bold text-center text-[var(--color-text-primary)]">{m.home_team_name}</span>
          </div>
          <div className="text-center">
            {m.home_score != null ? (
              <div className="text-4xl font-[var(--font-anybody)] font-extrabold text-[var(--color-text-primary)] tabular-nums">
                {m.home_score} – {m.away_score}
              </div>
            ) : (
              <div className="text-2xl font-[var(--font-anybody)] font-bold text-[var(--color-text-muted)]">VS</div>
            )}
            <div className="text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide mt-2">{m.status}</div>
            <div className="text-xs text-[var(--color-text-muted)] font-[var(--font-jetbrains)] mt-1">{fmtDate(m.kickoff_time)}</div>
            {venue && <div className="text-xs text-[var(--color-text-muted)] font-[var(--font-jetbrains)] mt-1">{venue}</div>}
          </div>
          <div className="flex-1 flex flex-col items-center gap-2">
            {awayLogo && <img src={awayLogo} alt={m.away_team_name} className={m.league_id === 77 ? 'w-16 h-11 object-cover rounded' : 'w-16 h-16 object-contain'} />}
            <span className="font-[var(--font-anybody)] font-bold text-center text-[var(--color-text-primary)]">{m.away_team_name}</span>
          </div>
        </div>

        {/* Goal scorers / red cards */}
        {(homeScorers.length > 0 || awayScorers.length > 0 || homeReds.length > 0 || awayReds.length > 0) && (
          <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-[var(--color-border)] text-sm">
            <div className="text-right space-y-1">
              {homeScorers.map(s => (
                <div key={s.name}>⚽ {s.name} <span className="text-[var(--color-text-muted)]">{s.minutes.join(', ')}</span></div>
              ))}
              {homeReds.map(r => (
                <div key={r.name} className="text-[var(--color-live-text)]">🟥 {r.name} <span className="text-[var(--color-text-muted)]">{r.minute}</span></div>
              ))}
            </div>
            <div className="text-left space-y-1">
              {awayScorers.map(s => (
                <div key={s.name}>{s.name} <span className="text-[var(--color-text-muted)]">{s.minutes.join(', ')}</span> ⚽</div>
              ))}
              {awayReds.map(r => (
                <div key={r.name} className="text-[var(--color-live-text)]">{r.name} <span className="text-[var(--color-text-muted)]">{r.minute}</span> 🟥</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {!summary ? (
        <div className="glass-card rounded-2xl p-8 text-center text-[var(--color-text-secondary)]">
          Match details aren&apos;t available yet for this fixture.
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1xBet: pre-match preview + last-5 form (pre-kickoff only) */}
          {prediction.length > 0 && (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="font-[var(--font-anybody)] font-semibold text-xl text-[var(--color-text-primary)] mb-4">Match Preview</h2>
              <div className="space-y-2 text-sm text-[var(--color-text-primary)]">
                {prediction.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </section>
          )}

          {recentForm && (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="font-[var(--font-anybody)] font-semibold text-xl text-[var(--color-text-primary)] mb-4">Recent Form</h2>
              <div className="grid grid-cols-2 gap-6">
                {[{ label: m.home_team_name, form: homeForm }, { label: m.away_team_name, form: awayForm }].map(({ label, form }) => (
                  <div key={label} className="space-y-2">
                    <div className="text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] uppercase tracking-wide">{label}</div>
                    {form.map((f, i) => (
                      <div key={i} className="grid grid-cols-[1fr_auto_1.5rem] items-center gap-2 text-sm">
                        <span className="text-[var(--color-text-primary)] truncate">vs {f.opponent}</span>
                        <span className="tabular-nums text-[var(--color-text-secondary)] text-right">{f.us}-{f.them}</span>
                        <span className={`font-bold text-center rounded ${f.result === 'W' ? 'text-green-500' : f.result === 'L' ? 'text-red-500' : 'text-[var(--color-text-secondary)]'}`}>{f.result}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Stats */}
          {statRows.length > 0 && (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="font-[var(--font-anybody)] font-semibold text-xl text-[var(--color-text-primary)] mb-4">Match Stats</h2>
              <div className="space-y-4">
                {statRows.map(s => (
                  <div key={s.label}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-bold text-[var(--color-text-primary)] tabular-nums">{s.homeDisplay}</span>
                      <span className="text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide uppercase">{s.label}</span>
                      <span className="font-bold text-[var(--color-text-primary)] tabular-nums">{s.awayDisplay}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden flex bg-[var(--color-input)]">
                      <div className="h-full bg-[var(--color-accent-text)]" style={{ width: `${s.homeShare}%` }} />
                      <div className="h-full bg-[var(--color-live-text)]" style={{ width: `${100 - s.homeShare}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tournament form (pre-match only) */}
          {formStatRows.length > 0 && (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="font-[var(--font-anybody)] font-semibold text-xl text-[var(--color-text-primary)] mb-4">Team Stats</h2>
              <div className="space-y-4">
                {formStatRows.map(s => (
                  <div key={s.label}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-bold text-[var(--color-text-primary)] tabular-nums">{s.homeDisplay}</span>
                      <span className="text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide uppercase">{s.label}</span>
                      <span className="font-bold text-[var(--color-text-primary)] tabular-nums">{s.awayDisplay}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden flex bg-[var(--color-input)]">
                      <div className="h-full bg-[var(--color-accent-text)]" style={{ width: `${s.homeShare}%` }} />
                      <div className="h-full bg-[var(--color-live-text)]" style={{ width: `${100 - s.homeShare}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Style of Play section temporarily removed — 1xBet's data for
              this endpoint has come back empty for every WC2026 match tried,
              so the box only ever rendered empty. Restore once it fills in. */}

          {/* Timeline */}
          {timelineEvents.length > 0 && (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="font-[var(--font-anybody)] font-semibold text-xl text-[var(--color-text-primary)] mb-4">Timeline</h2>
              <div className="space-y-3">
                {timelineEvents.map((e: any) => (
                  <div key={e.id} className="grid grid-cols-[2.5rem_1.5rem_1fr] gap-2 text-sm">
                    <span className="text-[var(--color-text-muted)] font-[var(--font-jetbrains)] pt-0.5">{e.clock?.displayValue || '-'}</span>
                    <span className="pt-0.5">{eventIcon(e.type.type)}</span>
                    <span className="text-[var(--color-text-primary)] leading-snug">
                      {timelineLabel(e)} <span className="text-[var(--color-text-secondary)]">— {e.team?.displayName}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Lineups */}
          {(homeRoster?.roster?.length || awayRoster?.roster?.length) ? (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="font-[var(--font-anybody)] font-semibold text-xl text-[var(--color-text-primary)] mb-4">Formations & Lineups</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[homeRoster, awayRoster].map((roster, idx) => {
                  if (!roster?.roster?.length) return null
                  const subs = keyEvents
                    .filter((e: any) => e.type?.type === 'substitution' && e.team?.displayName === roster.team.displayName)
                    .sort((a: any, b: any) => (a.clock?.value ?? 0) - (b.clock?.value ?? 0))
                  return (
                    <div key={idx}>
                      <div className="text-sm font-bold text-[var(--color-text-primary)] mb-1">{roster.team.displayName} — {roster.formation ?? '—'}</div>
                      <div className="rounded-xl bg-gradient-to-b from-[#1e5c34] to-[#164023] p-4 flex flex-col-reverse justify-evenly gap-4 mt-3 min-h-[420px]">
                        {pitchRows(roster.roster.filter((p: any) => p.starter)).map((row, rIdx) => (
                          <div key={rIdx} className="flex justify-center gap-6 sm:gap-10">
                            {row.map((p: any) => <PlayerChip key={p.athlete.id} p={p} teamColor={roster.team.color} rating={ratingFor(p)} />)}
                          </div>
                        ))}
                      </div>
                      {roster.roster.some((p: any) => !p.starter) && (
                        <div className="mt-4">
                          <div className="text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] uppercase tracking-wide mb-2">Substitutes</div>
                          <div className="flex flex-wrap gap-3">
                            {roster.roster.filter((p: any) => !p.starter).map((p: any) => (
                              <PlayerChip key={p.athlete.id} p={p} teamColor={roster.team.color} rating={ratingFor(p)} onPitch={false} />
                            ))}
                          </div>
                        </div>
                      )}
                      {subs.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {subs.map((e: any) => {
                            const [inP, outP] = e.participants ?? []
                            return (
                              <div key={e.id} className="text-xs text-[var(--color-text-secondary)] flex items-center gap-2">
                                <span className="text-[var(--color-text-muted)] font-[var(--font-jetbrains)] w-8">{e.clock?.displayValue}</span>
                                <span className="text-[var(--color-live-text)]">↓ {outP?.athlete?.displayName ?? '—'}</span>
                                <span className="text-[var(--color-accent-text)]">↑ {inP?.athlete?.displayName ?? '—'}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null}

          {/* Head to head */}
          {h2hEvents.length > 0 && (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="font-[var(--font-anybody)] font-semibold text-xl text-[var(--color-text-primary)] mb-4">Head to Head</h2>
              <div>
                {h2hEvents.map((ev: any) => {
                  const homeIsUsHome = String(ev.homeTeamId) === String(espnHomeId)
                  const leftName = homeIsUsHome ? m.home_team_name : m.away_team_name
                  const rightName = homeIsUsHome ? m.away_team_name : m.home_team_name
                  return (
                    <div key={ev.id} className="grid grid-cols-[1fr_auto_1fr_3.5rem] sm:grid-cols-[1fr_auto_1fr_5rem] items-center gap-2 sm:gap-3 py-2 border-b border-[var(--glass-05)] last:border-0 text-xs sm:text-sm">
                      <span className="text-[var(--color-text-secondary)] text-right truncate">{leftName}</span>
                      <span className="font-bold text-[var(--color-text-primary)] tabular-nums whitespace-nowrap px-1 sm:px-2">{ev.homeTeamScore} – {ev.awayTeamScore}</span>
                      <span className="text-[var(--color-text-secondary)] truncate">{rightName}</span>
                      <span className="text-[var(--color-text-muted)] font-[var(--font-jetbrains)] text-right whitespace-nowrap">{new Date(ev.gameDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Related news */}
          {relatedNews.length > 0 && (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="font-[var(--font-anybody)] font-semibold text-xl text-[var(--color-text-primary)] mb-4">Related News</h2>
              <div className="space-y-4">
                {relatedNews.map((a: any) => (
                  <a key={a.id} href={a.links?.web?.href} target="_blank" rel="noopener noreferrer" className="flex gap-3 group">
                    {a.images?.[0]?.url && (
                      <img src={a.images[0].url} alt="" className="w-24 h-16 object-cover rounded-lg flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-accent-text)] leading-snug">{a.headline}</div>
                      <div className="text-xs text-[var(--color-text-muted)] font-[var(--font-jetbrains)] mt-1">
                        {new Date(a.published).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
