export const COMPETITIONS: { id: number; name: string; country: string; sport: 'football' | 'basketball'; logo?: string }[] = [
  { id: 77, name: 'World Cup 2026', country: 'International', sport: 'football', logo: 'https://upload.wikimedia.org/wikipedia/commons/1/17/2026_FIFA_World_Cup_emblem.svg' },
  { id: 100, name: 'Club Friendlies', country: 'International', sport: 'football' },
  { id: 47, name: 'Premier League', country: 'England', sport: 'football' },
  { id: 53, name: 'Ligue 1', country: 'France', sport: 'football' },
  { id: 54, name: 'Bundesliga', country: 'Germany', sport: 'football' },
  { id: 55, name: 'Serie A', country: 'Italy', sport: 'football' },
  { id: 87, name: 'La Liga', country: 'Spain', sport: 'football' },
  { id: 200, name: 'NBA', country: 'USA', sport: 'basketball' },
]

export const SPORTS: { key: 'football' | 'basketball'; label: string }[] = [
  { key: 'football', label: 'Football' },
  { key: 'basketball', label: 'Basketball' },
]
