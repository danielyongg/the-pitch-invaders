import { redirect } from 'next/navigation'

// Superseded by /competitions (pick-a-competition landing + per-competition
// Fixtures/Standings tabs) — kept as a redirect rather than deleted outright
// so any bookmarked/shared /matches links still land somewhere sensible.
export default function MatchesPage() {
  redirect('/competitions')
}
