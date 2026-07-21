import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapEspnStatus } from '@/lib/espn'

const NBA_LEAGUE_ID = 200
const NBA_SPORT_PATH = 'basketball'
const NBA_SLUG = 'nba'

// Wide enough to cover a full Oct-Jun NBA season in one request. The
// 2026-27 season's schedule won't be published by ESPN until later in the
// 2026 off-season — this intentionally isn't date-gated (same precedent as
// the 5 European leagues' sync-fixtures): querying before the schedule
// exists just returns an empty events list, no special-casing needed.
const SEASON_DATE_RANGE = '20260801-20270630'

export async function GET() {
  const supabase = createAdminClient()

  const url = `https://site.api.espn.com/apis/site/v2/sports/${NBA_SPORT_PATH}/${NBA_SLUG}/scoreboard?dates=${SEASON_DATE_RANGE}&limit=1000`
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) return NextResponse.json({ ok: false, error: `HTTP ${res.status}` }, { status: 500 })

  const json = await res.json()
  const events = json.events ?? []
  if (!events.length) return NextResponse.json({ ok: true, upserted: 0 })

  const rows = events.map((e: any) => {
    const comp = e.competitions[0]
    const home = comp.competitors.find((c: any) => c.homeAway === 'home')
    const away = comp.competitors.find((c: any) => c.homeAway === 'away')
    return {
      api_football_id: Number(e.id),
      league_id: NBA_LEAGUE_ID,
      sport: 'basketball',
      season: Number(e.season?.year) || new Date(e.date).getFullYear(),
      home_team_id: Number(home?.team?.id ?? 0),
      away_team_id: Number(away?.team?.id ?? 0),
      home_team_name: home?.team?.displayName ?? '',
      away_team_name: away?.team?.displayName ?? '',
      home_team_logo: home?.team?.logo ?? null,
      away_team_logo: away?.team?.logo ?? null,
      kickoff_time: e.date,
      status: mapEspnStatus(comp.status.type),
      home_score: home?.score != null ? Number(home.score) : null,
      away_score: away?.score != null ? Number(away.score) : null,
    }
  })

  const { error } = await supabase.from('matches').upsert(rows, { onConflict: 'api_football_id' })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, upserted: rows.length })
}
