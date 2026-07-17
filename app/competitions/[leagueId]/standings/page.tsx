import { notFound } from 'next/navigation'
import { fetchStandings, STANDINGS_LEAGUE_IDS } from '@/lib/standings'
import StandingsTable from '@/components/competitions/StandingsTable'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function CompetitionStandingsPage({ params }: Props) {
  const { leagueId } = await params
  const id = Number(leagueId)
  if (!STANDINGS_LEAGUE_IDS.includes(id)) notFound()

  const rows = await fetchStandings(id)

  if (!rows?.length) {
    return (
      <div className="text-center py-20 text-[var(--color-text-secondary)]">
        <div className="text-4xl mb-3">📊</div>
        <p>Standings aren't available yet.</p>
      </div>
    )
  }

  return <StandingsTable rows={rows} />
}
