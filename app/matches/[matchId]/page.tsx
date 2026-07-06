export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchEspnSummary } from '@/lib/espn'
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

function PlayerChip({ p }: { p: any }) {
  const goals = p.stats?.find((s: any) => s.name === 'totalGoals')?.value ?? 0
  const yellow = p.stats?.find((s: any) => s.name === 'yellowCards')?.value ?? 0
  const red = p.stats?.find((s: any) => s.name === 'redCards')?.value ?? 0
  return (
    <div className="flex flex-col items-center gap-1 w-16">
      <div className="relative w-9 h-9 rounded-full bg-[#aec6ff] text-[#002e6a] flex items-center justify-center font-bold text-sm">
        {p.jersey}
        {red > 0 && <span className="absolute -top-1 -right-1 w-3 h-4 bg-red-600 rounded-sm border border-white" />}
        {!red && yellow > 0 && <span className="absolute -top-1 -right-1 w-3 h-4 bg-yellow-400 rounded-sm border border-white" />}
        {goals > 0 && <span className="absolute -bottom-1 -right-1 text-[10px]">⚽</span>}
      </div>
      <span className="text-[10px] text-center text-white leading-tight [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">{p.athlete.shortName ?? p.athlete.displayName}</span>
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
    const total = homeNum + awayNum || 1
    const fmt = (n: number) => (row.name === 'possessionPct' || row.isFractionPct) ? `${Math.round(n)}%` : `${n}`
    return {
      label: row.label,
      homeDisplay: fmt(homeNum),
      awayDisplay: fmt(awayNum),
      homeShare: (homeNum / total) * 100,
    }
  }).filter((r): r is NonNullable<typeof r> => r != null)

  const rosters: any[] = summary?.rosters ?? []
  const homeRoster = rosters.find(r => isHomeId(r.team.id))
  const awayRoster = rosters.find(r => !isHomeId(r.team.id))

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

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <a href="/matches" className="text-sm text-[var(--color-accent-text)] hover:text-[var(--color-accent-hover)] font-[var(--font-jetbrains)] tracking-wide">
        ← Back to Matches
      </a>

      {/* Header */}
      <div className="glass-card rounded-2xl p-8 mt-4 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 flex flex-col items-center gap-2">
            {homeLogo && <img src={homeLogo} alt={m.home_team_name} className="w-16 h-16 object-contain" />}
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
            {awayLogo && <img src={awayLogo} alt={m.away_team_name} className="w-16 h-16 object-contain" />}
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

          {/* Timeline */}
          {timelineEvents.length > 0 && (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="font-[var(--font-anybody)] font-semibold text-xl text-[var(--color-text-primary)] mb-4">Timeline</h2>
              <div className="space-y-2">
                {timelineEvents.map((e: any) => (
                  <div key={e.id} className="flex items-center gap-3 text-sm">
                    <span className="w-10 text-[var(--color-text-muted)] font-[var(--font-jetbrains)]">{e.clock?.displayValue || '-'}</span>
                    <span>{eventIcon(e.type.type)}</span>
                    <span className="text-[var(--color-text-primary)]">
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
                {[homeRoster, awayRoster].map((roster, idx) => roster?.roster?.length && (
                  <div key={idx}>
                    <div className="text-sm font-bold text-[var(--color-text-primary)] mb-1">{roster.team.displayName} — {roster.formation ?? '—'}</div>
                    <div className="rounded-xl bg-gradient-to-b from-[#1e5c34] to-[#164023] p-4 flex flex-col-reverse justify-evenly gap-4 mt-3 min-h-[420px]">
                      {pitchRows(roster.roster.filter((p: any) => p.starter)).map((row, rIdx) => (
                        <div key={rIdx} className="flex justify-center gap-6 sm:gap-10">
                          {row.map((p: any) => <PlayerChip key={p.athlete.id} p={p} />)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Head to head */}
          {h2hEvents.length > 0 && (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="font-[var(--font-anybody)] font-semibold text-xl text-[var(--color-text-primary)] mb-4">Head to Head</h2>
              <div className="space-y-2">
                {h2hEvents.map((ev: any) => {
                  const homeIsUsHome = String(ev.homeTeamId) === String(espnHomeId)
                  const leftName = homeIsUsHome ? m.home_team_name : m.away_team_name
                  const rightName = homeIsUsHome ? m.away_team_name : m.home_team_name
                  return (
                    <div key={ev.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
                      <span className="text-[var(--color-text-secondary)] text-right truncate">{leftName}</span>
                      <span className="font-bold text-[var(--color-text-primary)] tabular-nums whitespace-nowrap px-2">{ev.homeTeamScore} – {ev.awayTeamScore}</span>
                      <span className="text-[var(--color-text-secondary)] truncate flex items-center justify-between gap-3">
                        {rightName}
                        <span className="text-xs text-[var(--color-text-muted)] font-[var(--font-jetbrains)] whitespace-nowrap">{new Date(ev.gameDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
