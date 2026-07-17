'use client'

import { usePathname } from 'next/navigation'

interface Props {
  leagueId: number
  hasStandings: boolean
}

export default function CompetitionTabs({ leagueId, hasStandings }: Props) {
  const pathname = usePathname()
  const isStandings = pathname.endsWith('/standings')

  const tab = (active: boolean) =>
    `px-4 py-2 text-sm font-[var(--font-jetbrains)] tracking-wide border-b-2 transition ${
      active
        ? 'text-[var(--color-text-primary)] border-[#aec6ff]'
        : 'text-[var(--color-text-secondary)] border-transparent hover:text-[var(--color-text-primary)]'
    }`

  return (
    <div className="flex gap-2 mb-8 border-b border-[var(--color-border)]">
      <a href={`/competitions/${leagueId}`} className={tab(!isStandings)}>Fixtures</a>
      {hasStandings && (
        <a href={`/competitions/${leagueId}/standings`} className={tab(isStandings)}>Standings</a>
      )}
    </div>
  )
}
