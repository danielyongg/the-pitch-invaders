// Three ways a competition's fixtures get paginated, extracted from the old
// /matches page (which had to sniff which strategy applied per-row since one
// page could show a mixed filter result). Now that each Fixtures page only
// ever serves a single league_id (known from the URL), the mode is decided
// directly from that id instead.
export type FixturesMode = 'stage' | 'week' | 'matchday'

const WORLD_CUP_LEAGUE_ID = 77
const FRIENDLY_LEAGUE_ID = 100

export function fixturesModeFor(leagueId: number): FixturesMode {
  if (leagueId === WORLD_CUP_LEAGUE_ID) return 'stage'
  if (leagueId === FRIENDLY_LEAGUE_ID) return 'week'
  return 'matchday'
}

// World Cup 2026's fixed round sequence, in bracket order. Final and 3rd
// place share a page since they're both "the last stage" for pagination
// purposes.
const WC_STAGES: { id: string; label: string; rounds: string[] }[] = [
  { id: 'group', label: 'Group Stage', rounds: ['group'] },
  { id: 'round_of_32', label: 'Round of 32', rounds: ['round_of_32'] },
  { id: 'round_of_16', label: 'Round of 16', rounds: ['round_of_16'] },
  { id: 'quarterfinal', label: 'Quarterfinal', rounds: ['quarterfinal'] },
  { id: 'semifinal', label: 'Semifinal', rounds: ['semifinal'] },
  { id: 'final', label: 'Final & 3rd Place', rounds: ['final', 'third_place'] },
]

const msPerWeek = 7 * 24 * 60 * 60 * 1000
const weekBucket = (kickoff: string) => Math.floor(new Date(kickoff).getTime() / msPerWeek)

export interface FixturesGroup<T> {
  id: string
  label: string
  matches: T[]
}

interface MatchLike {
  round: string | null
  kickoff_time: string
  status: string
}

const isUnfinished = (status: string) => status !== 'FT' && status !== 'AET' && status !== 'PEN'

// Groups matches into pages per the given mode, sorted chronologically, with
// the default page being the first one containing a not-yet-finished match
// (falls back to the last page if every match is finished).
export function paginateFixtures<T extends MatchLike>(mode: FixturesMode, matches: T[]): { groups: FixturesGroup<T>[]; defaultIdx: number } {
  if (mode === 'stage') {
    const groups = WC_STAGES
      .map(s => ({ id: s.id, label: s.label, matches: matches.filter(m => s.rounds.includes(m.round ?? '')) }))
      .filter(g => g.matches.length > 0)
    const defaultIdx = groups.findIndex(g => g.matches.some(m => isUnfinished(m.status)))
    return { groups, defaultIdx: defaultIdx >= 0 ? defaultIdx : groups.length - 1 }
  }

  if (mode === 'week') {
    const buckets = new Map<number, T[]>()
    for (const m of matches) {
      const wb = weekBucket(m.kickoff_time)
      if (!buckets.has(wb)) buckets.set(wb, [])
      buckets.get(wb)!.push(m)
    }
    const keys = Array.from(buckets.keys()).sort((a, b) => a - b)
    const fmt = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    const groups = keys.map(wb => {
      const group = buckets.get(wb)!
      const dates = group.map(m => new Date(m.kickoff_time).getTime())
      return { id: String(wb), label: `${fmt(Math.min(...dates))} – ${fmt(Math.max(...dates))}`, matches: group }
    })
    const defaultIdx = groups.findIndex(g => g.matches.some(m => isUnfinished(m.status)))
    return { groups, defaultIdx: defaultIdx >= 0 ? defaultIdx : groups.length - 1 }
  }

  // matchday
  const mdGroups = new Map<number, T[]>()
  for (const m of matches) {
    const md = Number(m.round)
    if (!md) continue
    if (!mdGroups.has(md)) mdGroups.set(md, [])
    mdGroups.get(md)!.push(m)
  }
  const keys = Array.from(mdGroups.keys()).sort((a, b) => a - b)
  const groups = keys.map(md => ({ id: String(md), label: `Matchday ${md}`, matches: mdGroups.get(md)! }))
  const defaultIdx = groups.findIndex(g => g.matches.some(m => isUnfinished(m.status)))
  return { groups, defaultIdx: defaultIdx >= 0 ? defaultIdx : groups.length - 1 }
}

// Query param name each mode reads/writes — kept distinct so a page's mode
// (and thus its allowed values) is unambiguous from the URL alone.
export function paramNameFor(mode: FixturesMode): 'stage' | 'matchday' {
  return mode === 'stage' ? 'stage' : 'matchday'
}
