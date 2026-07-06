export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchEspnSummary } from '@/lib/espn'
import type { Match } from '@/lib/supabase/types'

interface Props {
  params: Promise<{ matchId: string }>
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default async function MatchDetailPage({ params }: Props) {
  const { matchId } = await params
  const supabase = await createClient()
  const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single()
  if (!match) notFound()
  const m = match as Match

  const summary = await fetchEspnSummary(m.league_id, m.api_football_id, m.kickoff_time, m.home_team_name, m.away_team_name)

  // Our own home_team_id/away_team_id can be stale for the same reason
  // api_football_id can be (World Cup rows predate the ESPN sync) — derive
  // the real ESPN home team id from the summary response itself instead of
  // trusting ours, so every lookup below stays internally consistent.
  const espnCompetitors: any[] = summary?.header?.competitions?.[0]?.competitors ?? []
  const espnHomeId = espnCompetitors.find((c: any) => c.homeAway === 'home')?.team?.id
  const isHomeId = (id: string | number) => String(id) === String(espnHomeId)

  const boxscoreTeams: any[] = summary?.boxscore?.teams ?? []
  const homeStats = boxscoreTeams.find(t => isHomeId(t.team.id))?.statistics ?? []
  const awayStats = boxscoreTeams.find(t => !isHomeId(t.team.id))?.statistics ?? []
  const statRows = homeStats.map((s: any) => ({
    label: s.label,
    home: s.displayValue,
    away: awayStats.find((a: any) => a.name === s.name)?.displayValue ?? '-',
  }))

  const rosters: any[] = summary?.rosters ?? []
  const homeRoster = rosters.find(r => isHomeId(r.team.id))
  const awayRoster = rosters.find(r => !isHomeId(r.team.id))

  const keyEvents: any[] = (summary?.keyEvents ?? [])
    .filter((e: any) => ['goal', 'yellow-card', 'red-card', 'substitution'].some(t => e.type?.type?.includes(t)))
    .sort((a: any, b: any) => (a.clock?.value ?? 0) - (b.clock?.value ?? 0))

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
            {m.home_team_logo && <img src={m.home_team_logo} alt={m.home_team_name} className="w-16 h-16 object-contain" />}
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
            {m.venue && <div className="text-xs text-[var(--color-text-muted)] font-[var(--font-jetbrains)] mt-1">{m.venue}</div>}
          </div>
          <div className="flex-1 flex flex-col items-center gap-2">
            {m.away_team_logo && <img src={m.away_team_logo} alt={m.away_team_name} className="w-16 h-16 object-contain" />}
            <span className="font-[var(--font-anybody)] font-bold text-center text-[var(--color-text-primary)]">{m.away_team_name}</span>
          </div>
        </div>
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
              <div className="space-y-3">
                {statRows.map((s: any) => (
                  <div key={s.label} className="flex items-center gap-3 text-sm">
                    <span className="w-12 text-right font-bold text-[var(--color-text-primary)] tabular-nums">{s.home}</span>
                    <span className="flex-1 text-center text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide uppercase">{s.label}</span>
                    <span className="w-12 text-left font-bold text-[var(--color-text-primary)] tabular-nums">{s.away}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Timeline */}
          {keyEvents.length > 0 && (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="font-[var(--font-anybody)] font-semibold text-xl text-[var(--color-text-primary)] mb-4">Timeline</h2>
              <div className="space-y-2">
                {keyEvents.map((e: any) => (
                  <div key={e.id} className="flex items-center gap-3 text-sm">
                    <span className="w-10 text-[var(--color-text-muted)] font-[var(--font-jetbrains)]">{e.clock?.displayValue || '-'}</span>
                    <span className="text-[var(--color-text-primary)]">
                      {e.type?.text} — {e.team?.displayName}
                      {e.athletesInvolved?.[0]?.athlete?.displayName && (
                        <span className="text-[var(--color-text-secondary)]"> ({e.athletesInvolved[0].athlete.displayName})</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Lineups */}
          {(homeRoster?.roster?.length || awayRoster?.roster?.length) ? (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="font-[var(--font-anybody)] font-semibold text-xl text-[var(--color-text-primary)] mb-4">Lineups</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[homeRoster, awayRoster].map((roster, idx) => roster?.roster?.length && (
                  <div key={idx}>
                    <div className="text-sm font-bold text-[var(--color-text-primary)] mb-1">{roster.team.displayName}</div>
                    <div className="text-xs text-[var(--color-text-muted)] font-[var(--font-jetbrains)] mb-3">{roster.formation ?? '—'}</div>
                    <ul className="space-y-1">
                      {roster.roster.filter((p: any) => p.starter).map((p: any) => (
                        <li key={p.athlete.id} className="text-sm text-[var(--color-text-secondary)] flex gap-2">
                          <span className="text-[var(--color-text-muted)] w-6 tabular-nums">{p.jersey}</span>
                          <span>{p.athlete.displayName}</span>
                        </li>
                      ))}
                    </ul>
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
                    <div key={ev.id} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--color-text-secondary)]">{leftName} vs {rightName}</span>
                      <span className="font-bold text-[var(--color-text-primary)] tabular-nums">{ev.homeTeamScore} – {ev.awayTeamScore}</span>
                      <span className="text-xs text-[var(--color-text-muted)] font-[var(--font-jetbrains)]">{new Date(ev.gameDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
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
