// Shared national-flag lookup (flagcdn.com, keyed by ISO 3166-1 alpha-2 —
// England/Scotland use flagcdn's gb-eng/gb-sct subdivision codes since
// they're not ISO countries). Used instead of any upstream provider's team
// "logo" field for World Cup matches: those have repeatedly turned out to be
// stale placeholder crests or a 404 CDN host, never actual flags.
const COUNTRY_CODE: Record<string, string> = {
  'Algeria': 'dz', 'Argentina': 'ar', 'Australia': 'au', 'Austria': 'at',
  'Belgium': 'be', 'Bosnia and Herzegovina': 'ba', 'Brazil': 'br',
  'Canada': 'ca', 'Cape Verde': 'cv', 'Chile': 'cl', 'Colombia': 'co',
  'Croatia': 'hr', 'Curacao': 'cw', 'Czechia': 'cz', 'Czech Republic': 'cz',
  'DR Congo': 'cd', 'Ecuador': 'ec', 'Egypt': 'eg', 'England': 'gb-eng',
  'France': 'fr', 'Germany': 'de', 'Ghana': 'gh', 'Haiti': 'ht',
  'Iran': 'ir', 'Iraq': 'iq', 'Italy': 'it', 'Ivory Coast': 'ci',
  'Japan': 'jp', 'Jordan': 'jo', 'Mexico': 'mx', 'Morocco': 'ma',
  'Netherlands': 'nl', 'New Zealand': 'nz', 'Nigeria': 'ng', 'Norway': 'no',
  'Panama': 'pa', 'Paraguay': 'py', 'Peru': 'pe', 'Poland': 'pl',
  'Portugal': 'pt', 'Qatar': 'qa', 'Saudi Arabia': 'sa',
  'Scotland': 'gb-sct', 'Senegal': 'sn', 'Serbia': 'rs',
  'South Africa': 'za', 'South Korea': 'kr', 'Spain': 'es',
  'Sweden': 'se', 'Switzerland': 'ch', 'Tunisia': 'tn',
  'Turkiye': 'tr', 'Turkey': 'tr', 'Ukraine': 'ua',
  'USA': 'us', 'United States': 'us', 'Uruguay': 'uy',
  'Uzbekistan': 'uz', 'Wales': 'gb-wls',
}

export function getFlagUrl(teamName: string): string | null {
  const code = COUNTRY_CODE[teamName.trim()]
  if (!code) return null
  return `https://flagcdn.com/${code}.svg`
}

// "Team A/Team B" placeholder (knockout TBD) — show both candidates' flags
export function getFlagUrls(teamName: string): string[] {
  return teamName.split('/').map(getFlagUrl).filter((u): u is string => !!u)
}
