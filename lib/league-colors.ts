// Plain module (not a 'use client' file) so it can be imported from both
// client components (MatchCard) and server components (competitions pages) —
// importing a constant out of a 'use client' module into a Server Component
// resolves to undefined at runtime (documented gotcha in this project).
export const LEAGUE_COLORS: Record<number, { bg: string; text: string }> = {
  77: { bg: '#00408f', text: '#aec6ff' },
  47: { bg: '#3d195b', text: '#e6cdfb' },
  87: { bg: '#8c1c40', text: '#ffc9dd' },
  54: { bg: '#7a0017', text: '#ffb3bd' },
  55: { bg: '#024494', text: '#a9d4ff' },
  53: { bg: '#091c3e', text: '#9fc1ff' },
  100: { bg: '#3a3a3a', text: '#d4d4d4' },
}
