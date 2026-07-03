// Shared ESPN (site.api.espn.com) status mapping — used by sync-fixtures
// (schedule sync) and sync-live (score/status sync). ESPN doesn't expose a
// status enum in its docs (it's an unofficial public API), so this is built
// from observed values rather than documentation.
export function mapEspnStatus(type: { name: string; state: string }, displayClock?: string): string {
  if (type.state === 'pre') return 'NS'
  if (type.name === 'STATUS_POSTPONED' || type.name === 'STATUS_CANCELED') return 'PST'
  if (type.state === 'post') {
    if (type.name.includes('PEN')) return 'PEN'
    if (type.name.includes('AET') || type.name.includes('EXTRA')) return 'AET'
    return 'FT'
  }
  if (type.name === 'STATUS_HALFTIME') return 'HT'
  // In-progress — displayClock is minute text ("46'"), matches the format
  // MatchCard already renders as-is for other live-minute providers.
  return displayClock || 'LIVE'
}
