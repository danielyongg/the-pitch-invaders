import MatchCard from './MatchCard'
import BasketballMatchCard from './BasketballMatchCard'
import type { Match, Prediction } from '@/lib/supabase/types'

interface Props {
  match: Match
  prediction?: Prediction | null
  userId?: string
}

// Picks the sport-specific card — football and basketball predictions are
// shaped too differently (score stepper vs. winner+margin toggle) to share
// one component without a lot of branching. See
// docs/superpowers/specs/2026-07-21-basketball-predictions-design.md.
export default function MatchCardSwitch({ match, prediction, userId }: Props) {
  if (match.sport === 'basketball') {
    return <BasketballMatchCard match={match} prediction={prediction as any} userId={userId} />
  }
  return <MatchCard match={match} prediction={prediction as any} userId={userId} />
}
