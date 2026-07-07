// Ad-hoc single-match fill — used to prioritize one specific match without
// spending the backfill script's whole crawl phase again. Not wired into
// any route; delete when no longer needed.
import { createAdminClient } from '../lib/supabase/admin'
import { fetchOnexbetStats } from '../lib/onexbet'

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY
  if (!apiKey) throw new Error('API_FOOTBALL_KEY not set')
  const supabase = createAdminClient()

  const home = process.argv[2]
  const away = process.argv[3]
  const { data: match, error } = await supabase
    .from('matches')
    .select('id, onexbet_stats')
    .eq('home_team_name', home)
    .eq('away_team_name', away)
    .single()
  if (error || !match) throw new Error(`match not found: ${error?.message}`)

  const matchHash = (match.onexbet_stats as any)?.matchHash
  if (!matchHash) throw new Error('no matchHash stored for this match — run the backfill crawl first')

  const stats = await fetchOnexbetStats(apiKey, matchHash)
  console.log('statistics entries:', stats.statistics?.statistics?.length ?? 0)
  console.log('topPerformers teams:', stats.topPerformers?.length ?? 0)
  await supabase.from('matches').update({ onexbet_stats: { matchHash, ...stats } }).eq('id', match.id)
  console.log('saved')
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
