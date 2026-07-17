import { COMPETITIONS } from './competitions'
import type { createClient } from './supabase/server'

// Scanning select('league_id') across the whole table hits Supabase's
// project-level max-rows cap (1000, not overridable via .limit()) once
// total match count grows past it, silently dropping leagues from the
// picker. Check each known competition's existence directly instead —
// cheap (a handful of limit(1) queries) and immune to the row cap.
export async function getAvailableLeagueIds(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number[]> {
  const results = await Promise.all(
    COMPETITIONS.map(async c => {
      const { data } = await supabase.from('matches').select('id').eq('league_id', c.id).limit(1)
      return { id: c.id, exists: (data?.length ?? 0) > 0 }
    })
  )
  return results.filter(r => r.exists).map(r => r.id)
}
