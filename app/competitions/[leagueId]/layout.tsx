import { notFound } from 'next/navigation'
import { COMPETITIONS } from '@/lib/competitions'
import { STANDINGS_LEAGUE_IDS } from '@/lib/standings'
import { LEAGUE_COLORS } from '@/lib/league-colors'
import { getFlagUrl } from '@/lib/flags'
import CompetitionTabs from '@/components/competitions/CompetitionTabs'

interface Props {
  children: React.ReactNode
  params: Promise<{ leagueId: string }>
}

export default async function CompetitionLayout({ children, params }: Props) {
  const { leagueId } = await params
  const id = Number(leagueId)
  const competition = COMPETITIONS.find(c => c.id === id)
  if (!competition) notFound()

  const hasStandings = STANDINGS_LEAGUE_IDS.includes(id)
  const colors = LEAGUE_COLORS[id] ?? LEAGUE_COLORS[77]
  const flagUrl = getFlagUrl(competition.country)

  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      <a href="/competitions" className="text-sm text-[var(--color-accent-text)] hover:text-[var(--color-accent-hover)] font-[var(--font-jetbrains)] tracking-wide">
        ← All Competitions
      </a>

      <div className="flex items-center gap-3 mt-4 mb-6">
        {flagUrl ? (
          <img src={flagUrl} alt="" className="w-10 h-7 object-cover rounded" />
        ) : (
          <span className="w-9 h-9 rounded-full" style={{ backgroundColor: colors.bg }} />
        )}
        <h1 className="font-[var(--font-anybody)] font-extrabold text-3xl sm:text-[40px] text-[var(--color-text-primary)] tracking-[-1px] [font-variation-settings:'wdth'_100]">
          {competition.name}
        </h1>
      </div>

      <CompetitionTabs leagueId={id} hasStandings={hasStandings} />

      {children}
    </div>
  )
}
