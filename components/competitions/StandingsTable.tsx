import type { StandingsRow } from '@/lib/standings'

interface Props {
  rows: StandingsRow[]
}

export default function StandingsTable({ rows }: Props) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="grid grid-cols-[32px_1fr_60px] sm:grid-cols-[48px_1fr_48px_48px_48px_48px_56px_56px_64px_56px] gap-2 sm:gap-3 px-4 sm:px-6 py-3 text-xs font-[var(--font-jetbrains)] tracking-widest uppercase text-[var(--color-text-secondary)] border-b border-[var(--color-border)] bg-[rgba(174,198,255,0.06)]">
        <span>#</span>
        <span>Team</span>
        <span className="text-center sm:hidden">Pts</span>
        <span className="text-center hidden sm:block">P</span>
        <span className="text-center hidden sm:block">W</span>
        <span className="text-center hidden sm:block">D</span>
        <span className="text-center hidden sm:block">L</span>
        <span className="text-center hidden sm:block">GF</span>
        <span className="text-center hidden sm:block">GA</span>
        <span className="text-center hidden sm:block">GD</span>
        <span className="text-center hidden sm:block">Pts</span>
      </div>
      {rows.map(row => (
        <div
          key={row.teamName}
          className="grid grid-cols-[32px_1fr_60px] sm:grid-cols-[48px_1fr_48px_48px_48px_48px_56px_56px_64px_56px] gap-2 sm:gap-3 px-4 sm:px-6 py-3 items-center border-b border-[var(--glass-05)] last:border-0 hover:bg-[var(--glass-03)] transition"
        >
          <span className="font-[var(--font-anybody)] text-base text-[var(--color-text-secondary)] [font-variation-settings:'wdth'_100]">{row.rank}</span>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {row.teamLogo && <img src={row.teamLogo} alt="" className="w-6 h-6 object-contain flex-shrink-0" />}
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">{row.teamName}</span>
          </div>
          <span className="font-[var(--font-anybody)] text-base font-bold text-[var(--color-accent-text)] text-center sm:hidden [font-variation-settings:'wdth'_100]">{row.points}</span>
          <span className="text-sm text-[var(--color-text-muted)] text-center hidden sm:block">{row.played}</span>
          <span className="text-sm text-[var(--color-text-secondary)] text-center hidden sm:block">{row.wins}</span>
          <span className="text-sm text-[var(--color-text-secondary)] text-center hidden sm:block">{row.draws}</span>
          <span className="text-sm text-[var(--color-text-secondary)] text-center hidden sm:block">{row.losses}</span>
          <span className="text-sm text-[var(--color-text-secondary)] text-center hidden sm:block">{row.goalsFor}</span>
          <span className="text-sm text-[var(--color-text-secondary)] text-center hidden sm:block">{row.goalsAgainst}</span>
          <span className="text-sm text-[var(--color-text-secondary)] text-center hidden sm:block">{row.goalDifference}</span>
          <span className="font-[var(--font-anybody)] text-xl font-bold text-[var(--color-accent-text)] text-center hidden sm:block [font-variation-settings:'wdth'_100]">{row.points}</span>
        </div>
      ))}
    </div>
  )
}
