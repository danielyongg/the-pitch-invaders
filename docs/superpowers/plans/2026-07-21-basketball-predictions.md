# Basketball (NBA) Predictions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add NBA basketball predictions (winner-side + margin-bucket vs. a bookmaker-spread threshold) alongside the existing football predictions, sharing one combined leaderboard.

**Architecture:** New `matches.sport` discriminator + `odds_spread` snapshot column; nullable/extended `predictions` columns; `lib/espn.ts` generalized in-place with a `sportPath` concept so it can address ESPN's basketball endpoints; two new, fully isolated API routes (`sync-fixtures-nba`, `sync-live-nba`) instead of touching the existing football sync routes; a new `score_match_predictions` branch keyed on `matches.sport`; sibling UI components (`BasketballMatchCard`, `BasketballPredictionInput`) picked by a small switch component instead of branching inside the football-shaped ones.

**Tech Stack:** Next.js 16 (App Router) + Supabase (Postgres + RLS) + ESPN's free/unofficial `site.api.espn.com` JSON API, same as every existing integration in this project.

## Global Constraints

- No test framework exists in this repo (`package.json` has no jest/vitest/playwright) — verification uses `npx tsc --noEmit`, direct curl against real ESPN endpoints, and a standalone `npx tsx` assertion script, matching how every prior migration in this project (PEN-scoring fixes, PEN-scoring swap) was hand-validated.
- Never introduce a new npm dependency for this feature — everything needed (fetch, Supabase client, React) is already installed.
- `league_id` for NBA is `200` — a free, internal, arbitrary integer (confirmed via grep that the old api-sports.io numbering this historically came from is fully dead code).
- Every new/modified file must satisfy `npx tsc --noEmit` with zero errors before being considered done.
- Points scale for basketball must stay 0–3, matching football's scale, so the shared `leaderboard_cache` stays fair across sports.

---

## Task 1: Database migration — schema + scoring function + scoring self-check

**Files:**
- Create: `supabase/migrations/017_basketball_predictions.sql`
- Create: `scripts/verify-basketball-scoring.ts`

**Interfaces:**
- Produces: `matches.sport` (`text`, default `'football'`, check `in ('football','basketball')`), `matches.odds_spread` (`numeric`, nullable). `predictions.predicted_home`/`predicted_away` now nullable. `predictions.predicted_winner_side` (`text`, nullable, check `in ('home','away')`), `predictions.predicted_margin_bucket` (`text`, nullable, check `in ('more','exact','less')`). `score_match_predictions(p_match_id uuid)` (unchanged signature) now branches on `matches.sport`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/017_basketball_predictions.sql
-- Adds NBA basketball predictions alongside the existing football
-- predictions, sharing one leaderboard. See
-- docs/superpowers/specs/2026-07-21-basketball-predictions-design.md.

-- matches.sport: discriminator; existing rows are all football.
alter table public.matches add column sport text not null default 'football';
alter table public.matches add constraint matches_sport_check check (sport in ('football', 'basketball'));

-- One-time odds snapshot (abs(spread) from ESPN's pickcenter), frozen before
-- kickoff — same pattern as pregame_summary/onexbet_stats, since the market
-- moves/disappears after that.
alter table public.matches add column odds_spread numeric;

-- Football predictions are a score guess (predicted_home/predicted_away);
-- basketball predictions are a winner-side + margin-bucket guess. A row only
-- ever populates the pair matching its match's sport — enforced at the
-- application level, not a cross-table CHECK/trigger (judged not worth the
-- complexity for now, see design spec).
alter table public.predictions alter column predicted_home drop not null;
alter table public.predictions alter column predicted_away drop not null;
alter table public.predictions add column predicted_winner_side text;
alter table public.predictions add column predicted_margin_bucket text;
alter table public.predictions add constraint predictions_winner_side_check
  check (predicted_winner_side is null or predicted_winner_side in ('home', 'away'));
alter table public.predictions add constraint predictions_margin_bucket_check
  check (predicted_margin_bucket is null or predicted_margin_bucket in ('more', 'exact', 'less'));

-- score_match_predictions: add a basketball branch ahead of the existing
-- football/PEN branches (both unchanged from migration 016). Basketball
-- scoring: winner_correct = predicted side matches actual winner;
-- margin_correct = predicted bucket ('more'/'exact'/'less') matches
-- abs(home_score - away_score) vs. round(coalesce(odds_spread, 5)). Both
-- correct = 3, winner only = 2, margin only = 1, neither = 0 — same 0-3
-- scale as football so the combined leaderboard stays fair.
create or replace function public.score_match_predictions(p_match_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_home_score integer;
  v_away_score integer;
  v_status text;
  v_home_pen integer;
  v_away_pen integer;
  v_sport text;
  v_odds_spread numeric;
  v_threshold numeric;
  v_actual_margin integer;
  v_actual_winner text;
begin
  select home_score, away_score, status, home_penalty_score, away_penalty_score, sport, odds_spread
  into v_home_score, v_away_score, v_status, v_home_pen, v_away_pen, v_sport, v_odds_spread
  from public.matches
  where id = p_match_id and status in ('FT', 'AET', 'PEN');

  if not found then
    raise exception 'Match % not found or not finished', p_match_id;
  end if;

  if v_sport = 'basketball' then
    v_threshold := round(coalesce(v_odds_spread, 5));
    v_actual_margin := abs(v_home_score - v_away_score);
    v_actual_winner := case when v_home_score > v_away_score then 'home' else 'away' end;

    update public.predictions
    set
      points_awarded = case
        when predicted_winner_side = v_actual_winner
         and (
           (predicted_margin_bucket = 'more' and v_actual_margin > v_threshold) or
           (predicted_margin_bucket = 'exact' and v_actual_margin = v_threshold) or
           (predicted_margin_bucket = 'less' and v_actual_margin < v_threshold)
         )
        then 3
        when predicted_winner_side = v_actual_winner then 2
        when (predicted_margin_bucket = 'more' and v_actual_margin > v_threshold) or
             (predicted_margin_bucket = 'exact' and v_actual_margin = v_threshold) or
             (predicted_margin_bucket = 'less' and v_actual_margin < v_threshold)
        then 1
        else 0
      end,
      updated_at = now()
    where match_id = p_match_id;
  elsif v_status = 'PEN' and v_home_pen is not null and v_away_pen is not null then
    update public.predictions
    set
      points_awarded = case
        when predicted_home = v_home_score and predicted_away = v_away_score then 3
        when predicted_home = predicted_away then 2 -- predicted a draw, wrong exact score
        when (predicted_home > predicted_away) = (v_home_pen > v_away_pen) then 1 -- predicted the shootout winner
        else 0 -- predicted a decisive result, wrong winner
      end,
      updated_at = now()
    where match_id = p_match_id;
  else
    update public.predictions
    set
      points_awarded = case
        when predicted_home = v_home_score and predicted_away = v_away_score then 3
        when sign(predicted_home - predicted_away) = sign(v_home_score - v_away_score) then 1
        else 0
      end,
      updated_at = now()
    where match_id = p_match_id;
  end if;

  -- Refresh leaderboard_cache for affected users (unchanged, sport-agnostic —
  -- sums points_awarded regardless of which sport earned them).
  insert into public.leaderboard_cache (user_id, username, avatar_url, total_points, exact_scores, correct_results, total_preds)
  select
    p.user_id,
    pr.username,
    pr.avatar_url,
    coalesce(sum(p.points_awarded), 0),
    count(*) filter (where p.points_awarded = 3),
    count(*) filter (where p.points_awarded >= 1),
    count(*)
  from public.predictions p
  join public.profiles pr on pr.id = p.user_id
  where p.user_id in (
    select distinct user_id from public.predictions where match_id = p_match_id
  )
  and p.points_awarded is not null
  group by p.user_id, pr.username, pr.avatar_url
  on conflict (user_id) do update set
    username        = excluded.username,
    avatar_url      = excluded.avatar_url,
    total_points    = excluded.total_points,
    exact_scores    = excluded.exact_scores,
    correct_results = excluded.correct_results,
    total_preds     = excluded.total_preds,
    updated_at      = now();
end;
$$;
```

- [ ] **Step 2: Apply the migration to Supabase**

```bash
supabase link --project-ref atehbhjttspmmlnevbfb
supabase db push
```

Needs a fresh `SUPABASE_ACCESS_TOKEN` (ask the user — not stored permanently, per this project's established pattern). If `db push` errors with "column/constraint already exists", it means this migration was already partially applied manually — run `supabase migration repair --status applied 017` first, then re-push. If no token is available this session, apply the SQL in Step 1 manually via the Supabase SQL Editor instead (same as migrations 015/016 were sometimes applied).

- [ ] **Step 3: Write the scoring self-check script**

No test framework exists in this repo, so this mirrors the SQL branch above in plain TypeScript and asserts against it — the smallest runnable check for a scoring/money-path formula (matches how every prior scoring migration in this project was hand-validated, just made runnable and repeatable here instead of a one-off manual query).

```typescript
// scripts/verify-basketball-scoring.ts
// Mirrors score_match_predictions' basketball branch
// (supabase/migrations/017_basketball_predictions.sql) in plain TS so the
// point formula can be sanity-checked without a live DB.
// Run: npx tsx scripts/verify-basketball-scoring.ts
import assert from 'node:assert'

type WinnerSide = 'home' | 'away'
type MarginBucket = 'more' | 'exact' | 'less'

function scoreBasketball(
  homeScore: number,
  awayScore: number,
  oddsSpread: number | null,
  predictedWinnerSide: WinnerSide,
  predictedMarginBucket: MarginBucket
): number {
  const threshold = Math.round(Math.abs(oddsSpread ?? 5))
  const actualMargin = Math.abs(homeScore - awayScore)
  const actualWinner: WinnerSide = homeScore > awayScore ? 'home' : 'away'

  const winnerCorrect = predictedWinnerSide === actualWinner
  const marginCorrect =
    (predictedMarginBucket === 'more' && actualMargin > threshold) ||
    (predictedMarginBucket === 'exact' && actualMargin === threshold) ||
    (predictedMarginBucket === 'less' && actualMargin < threshold)

  if (winnerCorrect && marginCorrect) return 3
  if (winnerCorrect) return 2
  if (marginCorrect) return 1
  return 0
}

// Home wins 110-95 (margin 15), spread was home -10 (threshold 10).
assert.strictEqual(scoreBasketball(110, 95, -10, 'home', 'more'), 3, 'winner + margin both correct -> 3')
assert.strictEqual(scoreBasketball(110, 95, -10, 'home', 'less'), 2, 'winner correct, margin wrong -> 2')
assert.strictEqual(scoreBasketball(110, 95, -10, 'away', 'more'), 1, 'winner wrong, margin correct -> 1')
assert.strictEqual(scoreBasketball(110, 95, -10, 'away', 'less'), 0, 'winner + margin both wrong -> 0')

// Exact-threshold boundary: margin lands exactly on the line.
assert.strictEqual(scoreBasketball(105, 95, 10, 'home', 'exact'), 3, 'margin exactly on the line scores as exact')
assert.strictEqual(scoreBasketball(105, 95, 10, 'home', 'more'), 2, '"more" bucket does not also match the exact boundary')

// No odds snapshot for this match -> falls back to a threshold of 5.
assert.strictEqual(scoreBasketball(100, 94, null, 'home', 'more'), 3, 'null odds_spread falls back to threshold 5 (margin 6 > 5)')
assert.strictEqual(scoreBasketball(100, 96, null, 'home', 'less'), 3, 'null odds_spread falls back to threshold 5 (margin 4 < 5)')

console.log('All basketball scoring checks passed.')
```

- [ ] **Step 4: Run the self-check**

Run: `npx tsx scripts/verify-basketball-scoring.ts`
Expected: `All basketball scoring checks passed.` (no assertion errors)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/017_basketball_predictions.sql scripts/verify-basketball-scoring.ts
git commit -m "Add NBA predictions schema + scoring branch"
```

---

## Task 2: Generalize `lib/espn.ts` for basketball + guard the football scoreboard loop

**Files:**
- Modify: `lib/espn.ts:40-102`
- Modify: `app/api/sync-live/route.ts:485-511`

**Interfaces:**
- Consumes: nothing new.
- Produces: `LEAGUE_SLUGS[200] = 'nba'`. New exported `LEAGUE_SPORT_PATHS: Record<number, string>` (only non-soccer leagues need an entry; default is `'soccer'`). `resolveEspnEventId(slug, kickoffIso, homeTeam, awayTeam, sportPath = 'soccer')` — new optional 5th param. `fetchEspnSummary(leagueId, apiFootballId, kickoffIso, homeTeam, awayTeam)` — signature unchanged, now sport-aware internally.

- [ ] **Step 1: Add NBA to the slug map and add a sport-path map**

In `lib/espn.ts`, replace the `LEAGUE_SLUGS` block (lines 37-48):

```typescript
// ESPN's site-api scoreboard slug per internal league_id — the one place
// this mapping lives, so match-detail lookups and any future sync code
// stay in sync with each other.
export const LEAGUE_SLUGS: Record<number, string> = {
  77: 'fifa.world',
  47: 'eng.1',
  87: 'esp.1',
  54: 'ger.1',
  55: 'ita.1',
  53: 'fra.1',
  100: 'club.friendly',
  200: 'nba',
}

// Sport-family URL segment ESPN's site-api needs ahead of the slug
// (`sports/{sportPath}/{slug}/...`) — every league synced so far has been
// soccer, so this only needs entries for anything else (basketball).
export const LEAGUE_SPORT_PATHS: Record<number, string> = {
  200: 'basketball',
}

function sportPathFor(leagueId: number): string {
  return LEAGUE_SPORT_PATHS[leagueId] ?? 'soccer'
}
```

- [ ] **Step 2: Thread `sportPath` through `resolveEspnEventId`**

Replace the `resolveEspnEventId` function (lines 56-77):

```typescript
// World Cup rows predate this project's switch to ESPN (2026-07-03) and
// still carry their original (non-ESPN) provider's numeric id, so
// `api_football_id` can't be trusted to be an ESPN event id for every
// match. Resolve it for real by searching the scoreboard for the match's
// kickoff date and matching on team names, same technique sync-live already
// uses to apply score updates.
export async function resolveEspnEventId(slug: string, kickoffIso: string, homeTeam: string, awayTeam: string, sportPath = 'soccer'): Promise<string | null> {
  const kickoff = new Date(kickoffIso)
  const home = normalizeTeamName(homeTeam).toLowerCase()
  const away = normalizeTeamName(awayTeam).toLowerCase()

  for (const offset of [0, -1, 1]) {
    const d = new Date(kickoff)
    d.setUTCDate(d.getUTCDate() + offset)
    const date = d.toISOString().slice(0, 10).replace(/-/g, '')

    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportPath}/${slug}/scoreboard?dates=${date}`, { next: { revalidate: 0 } })
    if (!res.ok) continue
    const json = await res.json()
    for (const e of json.events ?? []) {
      const comp = e.competitions[0]
      const h = comp.competitors.find((c: any) => c.homeAway === 'home')?.team?.displayName ?? ''
      const a = comp.competitors.find((c: any) => c.homeAway === 'away')?.team?.displayName ?? ''
      if (normalizeTeamName(h).toLowerCase() === home && normalizeTeamName(a).toLowerCase() === away) return e.id
    }
  }
  return null
}
```

- [ ] **Step 3: Make `fetchEspnSummary` sport-aware**

Replace the `fetchEspnSummary` function (lines 79-102):

```typescript
// Full match detail (stats, lineups, timeline, head-to-head) for the match
// detail page. Tries the stored id directly first (correct already for
// leagues/friendlies, synced straight from ESPN) and only falls back to the
// date+team-name search above when that fails (World Cup's stale ids, or
// any other mismatch).
export async function fetchEspnSummary(leagueId: number, apiFootballId: number, kickoffIso: string, homeTeam: string, awayTeam: string): Promise<any | null> {
  const slug = LEAGUE_SLUGS[leagueId]
  if (!slug) return null
  const sportPath = sportPathFor(leagueId)

  async function trySummary(eventId: number | string): Promise<any | null> {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportPath}/${slug}/summary?event=${eventId}`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    const json = await res.json()
    if (json.code) return null // ESPN's error shape: { code, message }
    return json
  }

  const direct = await trySummary(apiFootballId)
  if (direct) return direct

  const resolvedId = await resolveEspnEventId(slug, kickoffIso, homeTeam, awayTeam, sportPath)
  if (!resolvedId) return null
  return trySummary(resolvedId)
}
```

- [ ] **Step 4: Guard the football sync-live scoreboard loop against the new NBA slug**

`tryEspn()` in `app/api/sync-live/route.ts` loops `Object.values(LEAGUE_SLUGS)` and hardcodes `sports/soccer/...` — without a guard it would now also (harmlessly, but wastefully and incorrectly) query `sports/soccer/nba/scoreboard`. NBA has its own dedicated route (Task 6), so exclude non-soccer leagues here.

In `app/api/sync-live/route.ts`, change the import (line 3):

```typescript
import { mapEspnStatus, normalizeTeamName, LEAGUE_SLUGS, LEAGUE_SPORT_PATHS } from '@/lib/espn'
```

Then replace the first line of `tryEspn` (line 486):

```typescript
  // Basketball has its own sync-live-nba route (different sport path,
  // different update shape — no penalties/shootouts) — exclude it here so
  // this loop doesn't also query "sports/soccer/nba/scoreboard".
  const slugs = Object.entries(LEAGUE_SLUGS)
    .filter(([id]) => (LEAGUE_SPORT_PATHS[Number(id)] ?? 'soccer') === 'soccer')
    .map(([, slug]) => slug)
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/espn.ts app/api/sync-live/route.ts
git commit -m "Generalize lib/espn.ts for basketball's sport-path, guard football scoreboard loop"
```

---

## Task 3: Extend Supabase types

**Files:**
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Produces: `Match['sport']: string`, `Match['odds_spread']: number | null`, `Prediction['predicted_home']`/`predicted_away`: `number | null` (was `number`), `Prediction['predicted_winner_side']`/`predicted_margin_bucket`: `string | null`.

- [ ] **Step 1: Add `sport`/`odds_spread` to the `matches` table types**

In `lib/supabase/types.ts`, in the `matches.Row` block, add after `venue: string | null` (currently line 51):

```typescript
          venue: string | null
          sport: string
          odds_spread: number | null
```

In `matches.Insert`, add after `venue?: string | null` (currently line 75):

```typescript
          venue?: string | null
          sport?: string
          odds_spread?: number | null
```

In `matches.Update`, add after `pregame_summary?: string | null` (currently line 84):

```typescript
          pregame_summary?: string | null
          sport?: string
          odds_spread?: number | null
```

- [ ] **Step 2: Make `predicted_home`/`predicted_away` nullable and add the basketball columns**

In `lib/supabase/types.ts`, replace the entire `predictions` block (currently lines 88-113):

```typescript
      predictions: {
        Row: {
          id: string
          user_id: string
          match_id: string
          predicted_home: number | null
          predicted_away: number | null
          predicted_winner_side: string | null
          predicted_margin_bucket: string | null
          points_awarded: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          match_id: string
          predicted_home?: number | null
          predicted_away?: number | null
          predicted_winner_side?: string | null
          predicted_margin_bucket?: string | null
          points_awarded?: number | null
        }
        Update: {
          predicted_home?: number | null
          predicted_away?: number | null
          predicted_winner_side?: string | null
          predicted_margin_bucket?: string | null
          points_awarded?: number | null
          updated_at?: string
        }
      }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: errors only in files this plan hasn't updated yet (`components/predictions/PredictionInput.tsx` and any page assuming `predicted_home`/`predicted_away` are non-null) — none yet, since those files' existing football-only usage patterns (`.upsert` with numbers, template-literal rendering) are structurally compatible with a wider `number | null` type. Confirm no new errors appear.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "Add basketball columns to Supabase types"
```

---

## Task 4: Register NBA as a competition

**Files:**
- Modify: `lib/competitions.ts`
- Modify: `lib/fixtures-pagination.ts:8-15`
- Modify: `lib/league-colors.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `COMPETITIONS` includes `{ id: 200, name: 'NBA', country: 'USA' }`. `fixturesModeFor(200) === 'week'`. `LEAGUE_COLORS[200]` exists.

- [ ] **Step 1: Add NBA to `COMPETITIONS`**

In `lib/competitions.ts`, add a new entry at the end of the array:

```typescript
export const COMPETITIONS: { id: number; name: string; country: string; logo?: string }[] = [
  { id: 77, name: 'World Cup 2026', country: 'International', logo: 'https://upload.wikimedia.org/wikipedia/commons/1/17/2026_FIFA_World_Cup_emblem.svg' },
  { id: 100, name: 'Club Friendlies', country: 'International' },
  { id: 47, name: 'Premier League', country: 'England' },
  { id: 87, name: 'La Liga', country: 'Spain' },
  { id: 54, name: 'Bundesliga', country: 'Germany' },
  { id: 55, name: 'Serie A', country: 'Italy' },
  { id: 53, name: 'Ligue 1', country: 'France' },
  { id: 200, name: 'NBA', country: 'USA' },
]
```

`country: 'USA'` reuses `lib/flags.ts`'s existing `COUNTRY_CODE['USA'] = 'us'` mapping for free — the `/competitions` landing page and the `/competitions/[leagueId]` header both already call `getFlagUrl(competition.country)`, so NBA gets the American flag with zero new code.

- [ ] **Step 2: Route NBA through the 'week' pagination mode**

In `lib/fixtures-pagination.ts`, replace lines 8-15:

```typescript
const WORLD_CUP_LEAGUE_ID = 77
const FRIENDLY_LEAGUE_ID = 100
const NBA_LEAGUE_ID = 200

export function fixturesModeFor(leagueId: number): FixturesMode {
  if (leagueId === WORLD_CUP_LEAGUE_ID) return 'stage'
  if (leagueId === FRIENDLY_LEAGUE_ID || leagueId === NBA_LEAGUE_ID) return 'week'
  return 'matchday'
}
```

(`paginateFixtures`'s `'week'` branch only reads `kickoff_time`/`status` off each match, never `round`, so NBA fixtures don't need a matchday/round value at all.)

- [ ] **Step 3: Add an NBA color**

In `lib/league-colors.ts`, add an entry:

```typescript
export const LEAGUE_COLORS: Record<number, { bg: string; text: string }> = {
  77: { bg: '#00408f', text: '#aec6ff' },
  47: { bg: '#3d195b', text: '#e6cdfb' },
  87: { bg: '#8c1c40', text: '#ffc9dd' },
  54: { bg: '#7a0017', text: '#ffb3bd' },
  55: { bg: '#024494', text: '#a9d4ff' },
  53: { bg: '#091c3e', text: '#9fc1ff' },
  100: { bg: '#3a3a3a', text: '#d4d4d4' },
  200: { bg: '#c9082a', text: '#ffc2cd' },
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/competitions.ts lib/fixtures-pagination.ts lib/league-colors.ts
git commit -m "Register NBA as a competition"
```

---

## Task 5: NBA fixture sync route

**Files:**
- Create: `app/api/sync-fixtures-nba/route.ts`

**Interfaces:**
- Consumes: `mapEspnStatus` from `lib/espn.ts` (unchanged signature — already sport-agnostic, confirmed against real ESPN NBA data: `STATUS_SCHEDULED`/`state:'pre'` -> `NS`, `STATUS_FINAL`/`state:'post'` -> `FT`).
- Produces: `GET` handler upserting `matches` rows with `league_id: 200, sport: 'basketball'`, `onConflict: 'api_football_id'`.

- [ ] **Step 1: Write the route**

Isolated from the existing 5-European-leagues loop in `app/api/sync-fixtures/route.ts` on purpose (per design spec: NBA has no penalty columns and doesn't fit `assignMatchdays()`'s round-robin numbering) — this is its own small file, following the same "each sync loop owns its own scoreboard-fetch code" pattern the codebase already uses (football's fixture-sync and live-sync each fetch independently rather than sharing one fetcher).

```typescript
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification against real ESPN data**

Run: `curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20260401" | head -c 500`
Expected: real JSON with an `events` array (confirms the endpoint/shape is still live — this was verified during planning against a real finished game, Wizards vs 76ers, `status.type.name: "STATUS_FINAL"`).

Once deployed, trigger the route directly (`curl https://the-pitch-invaders.vercel.app/api/sync-fixtures-nba`) and check the response's `upserted` count. Early on (before ESPN publishes the 2026-27 schedule) this may legitimately be `0` — that's expected, not a bug.

- [ ] **Step 4: Commit**

```bash
git add app/api/sync-fixtures-nba/route.ts
git commit -m "Add NBA fixture sync route"
```

---

## Task 6: NBA live-score sync + odds pre-fill route

**Files:**
- Create: `app/api/sync-live-nba/route.ts`

**Interfaces:**
- Consumes: `mapEspnStatus`, `fetchEspnSummary` from `lib/espn.ts` (Task 2). `score_match_predictions` RPC (Task 1, now sport-aware).
- Produces: `GET` handler that (a) snapshots `odds_spread` once per upcoming NBA match, (b) updates `status`/`home_score`/`away_score` for NBA matches whose kickoff has passed, (c) calls `score_match_predictions` on the FT transition.

- [ ] **Step 1: Write the route**

Deliberately its own file rather than a branch inside `app/api/sync-live/route.ts` (per design spec) — that file's fallback-provider chain, adaptive cooldown, and World-Cup-only bracket logic exist to protect scarce RapidAPI quota and handle football's provider quirks, none of which apply here (NBA only ever uses ESPN, which has no request limit, and NBA team names — both coming from ESPN on both sides — never have the cross-provider spelling mismatches football's `normalizeTeamName` exists for). Scoped to `league_id = 200` throughout for isolation, even though team-name matching alone would likely be enough.

```typescript
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapEspnStatus, fetchEspnSummary } from '@/lib/espn'

const NBA_LEAGUE_ID = 200
const NBA_SPORT_PATH = 'basketball'
const NBA_SLUG = 'nba'
const FINISHED_STATUSES = ['FT']

// One-time snapshot of the bookmaker spread — same shape as
// fillOnexbetPreMatch in sync-live/route.ts, guarded so it only ever fetches
// once per match (the query in GET() already filters to odds_spread IS
// NULL, so this function doesn't need its own re-check).
async function fillOddsSpread(
  supabase: ReturnType<typeof createAdminClient>,
  matchId: string,
  apiFootballId: number,
  kickoffIso: string,
  homeTeam: string,
  awayTeam: string
) {
  try {
    const summary = await fetchEspnSummary(NBA_LEAGUE_ID, apiFootballId, kickoffIso, homeTeam, awayTeam)
    const spread = summary?.pickcenter?.[0]?.spread
    if (spread == null) return
    await supabase.from('matches').update({ odds_spread: Math.abs(Number(spread)) }).eq('id', matchId)
  } catch {
    // best-effort — leave odds_spread null, scoring falls back to the default threshold of 5
  }
}

export async function GET() {
  const supabase = createAdminClient()

  // Odds pre-fill: any upcoming NBA match that hasn't been snapshotted yet.
  const { data: needsOdds } = await supabase
    .from('matches')
    .select('id, api_football_id, kickoff_time, home_team_name, away_team_name')
    .eq('league_id', NBA_LEAGUE_ID)
    .eq('status', 'NS')
    .is('odds_spread', null)
    .gt('kickoff_time', new Date().toISOString())
  for (const row of needsOdds ?? []) {
    await fillOddsSpread(supabase, row.id, row.api_football_id, row.kickoff_time, row.home_team_name, row.away_team_name)
  }

  // Any NBA match not yet finished whose kickoff has already passed needs a score check.
  const { data: activeMatches } = await supabase
    .from('matches')
    .select('kickoff_time')
    .eq('league_id', NBA_LEAGUE_ID)
    .not('status', 'eq', 'FT')
    .lte('kickoff_time', new Date().toISOString())

  if (!activeMatches || activeMatches.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, scored: 0, skipped: 'no active matches' })
  }

  // Always check today/yesterday for matches in progress, plus the kickoff
  // date of every stuck match (same reasoning as football sync-live: a
  // match whose kickoff date this job never ran a sync for would otherwise
  // stay stuck at its pre-kickoff status forever).
  const dates = new Set<string>()
  for (const offset of [-1, 0]) {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    dates.add(d.toISOString().slice(0, 10))
  }
  for (const m of activeMatches) dates.add(m.kickoff_time.slice(0, 10))

  const updates: { homeTeam: string; awayTeam: string; status: string; homeScore: number | null; awayScore: number | null }[] = []
  for (const date of [...dates].map(d => d.replace(/-/g, ''))) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${NBA_SPORT_PATH}/${NBA_SLUG}/scoreboard?dates=${date}`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) continue
    const json = await res.json()
    for (const e of json.events ?? []) {
      const comp = e.competitions[0]
      const home = comp.competitors.find((c: any) => c.homeAway === 'home')
      const away = comp.competitors.find((c: any) => c.homeAway === 'away')
      updates.push({
        homeTeam: home?.team?.displayName,
        awayTeam: away?.team?.displayName,
        status: mapEspnStatus(comp.status.type, comp.status.displayClock),
        homeScore: home?.score != null ? Number(home.score) : null,
        awayScore: away?.score != null ? Number(away.score) : null,
      })
    }
  }

  let updated = 0
  let scored = 0
  const errors: string[] = []
  for (const u of updates.filter(x => x.homeTeam && x.awayTeam)) {
    const { data, error } = await supabase
      .from('matches')
      .update({ status: u.status, home_score: u.homeScore, away_score: u.awayScore })
      .eq('league_id', NBA_LEAGUE_ID)
      .ilike('home_team_name', u.homeTeam)
      .ilike('away_team_name', u.awayTeam)
      .select('id')
    if (error) {
      errors.push(`${u.homeTeam} vs ${u.awayTeam}: ${error.message}`)
      continue
    }
    updated += data?.length ?? 0

    if (FINISHED_STATUSES.includes(u.status)) {
      for (const row of data ?? []) {
        const { error: scoreError } = await supabase.rpc('score_match_predictions', { p_match_id: row.id })
        if (scoreError) errors.push(`score ${u.homeTeam} vs ${u.awayTeam}: ${scoreError.message}`)
        else scored++
      }
    }
  }

  return NextResponse.json({ ok: true, updated, scored, errors })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/sync-live-nba/route.ts
git commit -m "Add NBA live-score sync + odds pre-fill route"
```

---

## Task 7: `BasketballPredictionInput` component

**Files:**
- Create: `components/predictions/BasketballPredictionInput.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/client` (same client-side upsert pattern as `PredictionInput.tsx`).
- Produces: `BasketballPredictionInput` component, props `{ matchId: string; userId: string; homeTeamName: string; awayTeamName: string; oddsSpread: number | null; existing?: { predicted_winner_side: string | null; predicted_margin_bucket: string | null } | null; onSaved?: () => void }`. Writes `predicted_winner_side`/`predicted_margin_bucket` via `supabase.from('predictions').upsert(...)`.

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type WinnerSide = 'home' | 'away'
type MarginBucket = 'more' | 'exact' | 'less'

interface Props {
  matchId: string
  userId: string
  homeTeamName: string
  awayTeamName: string
  oddsSpread: number | null
  existing?: { predicted_winner_side: string | null; predicted_margin_bucket: string | null } | null
  onSaved?: () => void
}

export default function BasketballPredictionInput({ matchId, userId, homeTeamName, awayTeamName, oddsSpread, existing, onSaved }: Props) {
  const [winnerSide, setWinnerSide] = useState<WinnerSide | null>((existing?.predicted_winner_side as WinnerSide) ?? null)
  const [marginBucket, setMarginBucket] = useState<MarginBucket | null>((existing?.predicted_margin_bucket as MarginBucket) ?? null)
  const [savedWinnerSide, setSavedWinnerSide] = useState(existing?.predicted_winner_side ?? null)
  const [savedMarginBucket, setSavedMarginBucket] = useState(existing?.predicted_margin_bucket ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const threshold = Math.round(Math.abs(oddsSpread ?? 5))
  const isLocked = savedWinnerSide === winnerSide && savedMarginBucket === marginBucket
  const canSave = winnerSide != null && marginBucket != null

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError(null)

    const payload = {
      user_id: userId,
      match_id: matchId,
      predicted_winner_side: winnerSide,
      predicted_margin_bucket: marginBucket,
    }
    const { error: err } = await supabase.from('predictions').upsert(payload, { onConflict: 'user_id,match_id' })

    setSaving(false)
    if (err) {
      setError('Failed to save. The match may have already started.')
    } else {
      setSavedWinnerSide(winnerSide)
      setSavedMarginBucket(marginBucket)
      onSaved?.()
    }
  }

  function Toggle<T extends string>({ value, options, onChange }: { value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
    return (
      <div className="flex gap-2">
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${
              value === o.value
                ? 'bg-[#aec6ff] text-[#002e6a] border-[#aec6ff]'
                : 'bg-[var(--color-input)] text-[var(--color-text-primary)] border-[var(--color-border)] hover:bg-[var(--color-border-strong)]'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3 py-2">
      <div>
        <p className="text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide mb-1">Who wins?</p>
        <Toggle
          value={winnerSide}
          options={[{ value: 'home', label: homeTeamName }, { value: 'away', label: awayTeamName }]}
          onChange={setWinnerSide}
        />
      </div>

      <div>
        <p className="text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide mb-1">Margin vs. {threshold}-point line</p>
        <Toggle
          value={marginBucket}
          options={[
            { value: 'more', label: `More than ${threshold}` },
            { value: 'exact', label: `Exactly ${threshold}` },
            { value: 'less', label: `Less than ${threshold}` },
          ]}
          onChange={setMarginBucket}
        />
      </div>

      {error && <p className="text-xs text-[var(--color-live-text)] text-center font-[var(--font-jetbrains)]">{error}</p>}

      <button
        onClick={save}
        disabled={saving || isLocked || !canSave}
        className={`w-full py-3 rounded-xl text-sm font-bold font-[var(--font-anybody)] [font-variation-settings:'wdth'_100] tracking-wide transition ${
          isLocked
            ? 'bg-[rgba(174,198,255,0.2)] text-[var(--color-accent-text)] border border-[rgba(174,198,255,0.4)]'
            : 'bg-[#aec6ff] hover:bg-[#c8d8ff] text-[#002e6a]'
        } disabled:opacity-50`}
      >
        {saving ? 'Saving...' : isLocked ? '✓ Locked In' : savedWinnerSide != null ? 'Update Prediction' : 'Lock In Prediction'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/predictions/BasketballPredictionInput.tsx
git commit -m "Add BasketballPredictionInput component"
```

---

## Task 8: `BasketballMatchCard` component

**Files:**
- Create: `components/matches/BasketballMatchCard.tsx`

**Interfaces:**
- Consumes: `KickoffCountdown` (`components/matches/KickoffCountdown.tsx`, unchanged, sport-agnostic), `BasketballPredictionInput` (Task 7), `LEAGUE_COLORS` (Task 4), `Match`/`Prediction` types (Task 3).
- Produces: `BasketballMatchCard` component, props `{ match: Match; prediction?: Pick<Prediction, 'predicted_winner_side' | 'predicted_margin_bucket' | 'points_awarded'> | null; userId?: string }`.

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useState } from 'react'
import KickoffCountdown from './KickoffCountdown'
import BasketballPredictionInput from '@/components/predictions/BasketballPredictionInput'
import type { Match, Prediction } from '@/lib/supabase/types'
import { LEAGUE_COLORS } from '@/lib/league-colors'

const NBA_LEAGUE_ID = 200

const MARGIN_LABEL: Record<string, string> = {
  more: 'more than',
  exact: 'exactly',
  less: 'less than',
}

function TeamBadge({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()

  if (!src || failed) {
    return (
      <div className="w-16 h-16 flex items-center justify-center">
        <div className="w-full h-full rounded-full bg-[var(--color-border-strong)] flex items-center justify-center">
          <span className="text-sm font-bold text-[var(--color-text-secondary)]">{initials}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-16 h-16 flex items-center justify-center">
      <img src={src} alt={name} className="w-full h-full object-contain" onError={() => setFailed(true)} />
    </div>
  )
}

interface Props {
  match: Match
  prediction?: Pick<Prediction, 'predicted_winner_side' | 'predicted_margin_bucket' | 'points_awarded'> | null
  userId?: string
}

export default function BasketballMatchCard({ match, prediction, userId }: Props) {
  const kickoffTime = new Date(match.kickoff_time)
  const [locked, setLocked] = useState(kickoffTime <= new Date())
  const isFinished = match.status === 'FT'
  const isLive = !isFinished && match.status !== 'NS' && match.status !== 'PST'
  const liveMinute = isLive ? match.status : null

  const canPredict = userId && !locked && !isFinished
  const threshold = Math.round(Math.abs(match.odds_spread ?? 5))

  return (
    <div className="glass-card rounded-2xl overflow-hidden hover:border-[rgba(174,198,255,0.2)] transition">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <span
          className="text-xs font-[var(--font-jetbrains)] tracking-wide px-3 py-1 rounded-full"
          style={{ backgroundColor: LEAGUE_COLORS[NBA_LEAGUE_ID].bg, color: LEAGUE_COLORS[NBA_LEAGUE_ID].text }}
        >
          NBA
        </span>
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1 text-xs text-[var(--color-live-text)] font-[var(--font-jetbrains)] font-semibold tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4a9] animate-pulse" />
              {liveMinute && liveMinute !== 'LIVE' ? `LIVE ${liveMinute}` : 'LIVE'}
            </span>
          )}
          {isFinished ? (
            <div className="flex flex-col items-end">
              <span className="text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide">Finished</span>
              <span className="text-xs text-[var(--color-text-muted)] font-[var(--font-jetbrains)]">
                {kickoffTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          ) : locked ? (
            <span className="text-xs text-[var(--color-live-text)] bg-[rgba(255,180,169,0.1)] px-2 py-0.5 rounded-full font-[var(--font-jetbrains)] tracking-wide">Locked</span>
          ) : (
            <KickoffCountdown kickoffTime={match.kickoff_time} onKickoff={() => setLocked(true)} />
          )}
        </div>
      </div>

      <div className="px-4 py-6">
        <div className="flex items-start gap-3">
          <div className="flex-1 flex flex-col items-center gap-3">
            <TeamBadge src={match.home_team_logo} name={match.home_team_name} />
            <span className="text-sm font-[var(--font-anybody)] font-semibold text-[var(--color-text-primary)] text-center leading-tight min-h-[2.5rem] flex items-center [font-variation-settings:'wdth'_100]">
              {match.home_team_name}
            </span>
          </div>

          <div className="flex-shrink-0 text-center px-2 pt-4">
            {(isFinished || isLive) && match.home_score != null ? (
              <div className="text-3xl font-[var(--font-anybody)] font-extrabold text-[var(--color-text-primary)] tabular-nums [font-variation-settings:'wdth'_100]">
                {match.home_score} – {match.away_score}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <span className="font-[var(--font-anybody)] font-bold text-2xl text-[var(--color-text-muted)] [font-variation-settings:'wdth'_100]">VS</span>
                <div className="text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide">
                  {kickoffTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  <div className="text-[var(--color-text-muted)]">
                    {kickoffTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col items-center gap-3">
            <TeamBadge src={match.away_team_logo} name={match.away_team_name} />
            <span className="text-sm font-[var(--font-anybody)] font-semibold text-[var(--color-text-primary)] text-center leading-tight min-h-[2.5rem] flex items-center [font-variation-settings:'wdth'_100]">
              {match.away_team_name}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 pt-2 border-t border-[var(--color-border)] bg-[var(--glass-03)]">
        {canPredict ? (
          <BasketballPredictionInput
            matchId={match.id}
            userId={userId}
            homeTeamName={match.home_team_name}
            awayTeamName={match.away_team_name}
            oddsSpread={match.odds_spread}
            existing={prediction}
          />
        ) : prediction?.predicted_winner_side ? (
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--color-text-secondary)]">
              Your prediction:{' '}
              <span className="font-bold text-[var(--color-text-primary)]">
                {prediction.predicted_winner_side === 'home' ? match.home_team_name : match.away_team_name} wins,{' '}
                {MARGIN_LABEL[prediction.predicted_margin_bucket ?? 'more']} {threshold}
              </span>
            </div>
            {prediction.points_awarded != null && (
              <span className="text-sm font-bold font-[var(--font-anybody)] [font-variation-settings:'wdth'_100] text-[var(--color-accent-text)]">
                +{prediction.points_awarded}
              </span>
            )}
          </div>
        ) : userId ? (
          <p className="text-xs text-center text-[var(--color-text-muted)] font-[var(--font-jetbrains)] tracking-wide py-1">
            {isFinished ? "You didn't make a prediction for this match" : locked ? 'Predictions closed before kickoff' : 'No prediction yet'}
          </p>
        ) : (
          <p className="text-xs text-center text-[var(--color-text-muted)] py-1">
            <a href="/auth/login" className="text-[var(--color-accent-text)] hover:text-[var(--color-accent-hover)] font-[var(--font-jetbrains)] tracking-wide">Sign in</a>
            {' '}to make a prediction
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/matches/BasketballMatchCard.tsx
git commit -m "Add BasketballMatchCard component"
```

---

## Task 9: Switch component + wire into the 3 pages that render match cards

**Files:**
- Create: `components/matches/MatchCardSwitch.tsx`
- Modify: `app/page.tsx:5,56-65,244,298`
- Modify: `app/competitions/[leagueId]/page.tsx:4,62-69,92,125`
- Modify: `app/competitions/favorites/page.tsx:5,78-84,125,133`

**Interfaces:**
- Consumes: `MatchCard` (existing, unchanged), `BasketballMatchCard` (Task 8), `Match`/`Prediction` types (Task 3).
- Produces: `MatchCardSwitch` component, same props shape as `MatchCard` (`{ match: Match; prediction?: Prediction | null; userId?: string }`), picks the right card by `match.sport`.

- [ ] **Step 1: Write the switch component**

```tsx
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
```

- [ ] **Step 2: Wire it into `app/page.tsx`**

Change the import (line 5):

```typescript
import MatchCardSwitch from '@/components/matches/MatchCardSwitch'
```

Extend the predictions select (line 61, inside the `if (user && predictableMatchIds.length)` block):

```typescript
    const { data: preds } = await supabase
      .from('predictions')
      .select('match_id, predicted_home, predicted_away, predicted_winner_side, predicted_margin_bucket, points_awarded')
      .eq('user_id', user.id)
      .in('match_id', predictableMatchIds)
```

Replace both `<MatchCard key={match.id} match={match} prediction={predictionsMap[match.id]} userId={user?.id} />` usages (lines 244 and 298) with:

```tsx
              <MatchCardSwitch key={match.id} match={match} prediction={predictionsMap[match.id]} userId={user?.id} />
```

- [ ] **Step 3: Wire it into `app/competitions/[leagueId]/page.tsx`**

Change the import (line 4):

```typescript
import MatchCardSwitch from '@/components/matches/MatchCardSwitch'
```

Extend the predictions select (line 66):

```typescript
    const { data: preds } = await supabase
      .from('predictions')
      .select('match_id, predicted_home, predicted_away, predicted_winner_side, predicted_margin_bucket, points_awarded')
      .eq('user_id', user.id)
```

Replace both `<MatchCard key={match.id} match={match} prediction={predictionsMap[match.id] as any} userId={user?.id} />` usages (lines 92 and 125) with:

```tsx
                  <MatchCardSwitch key={match.id} match={match} prediction={predictionsMap[match.id] as any} userId={user?.id} />
```

- [ ] **Step 4: Wire it into `app/competitions/favorites/page.tsx`**

Change the import (line 5):

```typescript
import MatchCardSwitch from '@/components/matches/MatchCardSwitch'
```

Extend the predictions select (line 81):

```typescript
  const { data: preds } = await supabase
    .from('predictions')
    .select('match_id, predicted_home, predicted_away, predicted_winner_side, predicted_margin_bucket, points_awarded')
    .eq('user_id', user.id)
```

Replace both `<MatchCard key={match.id} match={match} prediction={predictionsMap[match.id] as any} userId={user.id} />` usages (lines 125 and 133) with:

```tsx
                  <MatchCardSwitch key={match.id} match={match} prediction={predictionsMap[match.id] as any} userId={user.id} />
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/matches/MatchCardSwitch.tsx app/page.tsx "app/competitions/[leagueId]/page.tsx" app/competitions/favorites/page.tsx
git commit -m "Wire MatchCardSwitch into home, competition, and favorites pages"
```

---

## Task 10: Basketball-aware profile page

**Files:**
- Modify: `app/profile/[userId]/page.tsx:118-136`

**Interfaces:**
- Consumes: `Match`/`Prediction` types (Task 3) — `p.matches` is already joined via `.select('*, matches(*)')`, so `match?.sport` is available with no query change.

- [ ] **Step 1: Fix the points color ternary to handle basketball's new `2`-point outcome**

`points_awarded` can now legitimately be `2` (basketball: winner correct, margin wrong) — the existing ternary chain only special-cased `3` and `1`, silently falling through to the muted "0" color for `2`. Replace line 123:

```tsx
                    <span className={`font-[var(--font-anybody)] font-bold text-sm text-right [font-variation-settings:'wdth'_100] sm:order-last sm:w-8 ${pts === 3 || pts === 2 ? 'text-[var(--color-accent-text)]' : pts === 1 ? 'text-[var(--color-live-text)]' : 'text-[var(--color-text-muted)]'}`}>
```

- [ ] **Step 2: Render the right prediction label per sport**

Replace line 129 (the football-only `predicted_home`–`predicted_away` label):

```tsx
                    <div className="text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide">
                      Prediction:{' '}
                      <span className="text-[var(--color-text-primary)] font-bold">
                        {match?.sport === 'basketball'
                          ? `${p.predicted_winner_side === 'home' ? match?.home_team_name : match?.away_team_name} wins (${p.predicted_margin_bucket})`
                          : `${p.predicted_home}–${p.predicted_away}`}
                      </span>
                    </div>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/profile/[userId]/page.tsx"
git commit -m "Make profile page's recent-predictions section basketball-aware"
```

---

## Task 11: Cron wiring for the two new NBA routes

**Files:**
- Create: `.github/workflows/sync-fixtures-nba.yml`
- Create: `.github/workflows/sync-live-nba.yml`

**Interfaces:**
- Consumes: nothing new — same pattern as `.github/workflows/sync-club-friendlies.yml` and `.github/workflows/sync-live-scores.yml`.

- [ ] **Step 1: Fixture-sync cron**

```yaml
name: Sync NBA fixtures

on:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch: {}

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger sync-fixtures-nba
        run: curl -sf "https://the-pitch-invaders.vercel.app/api/sync-fixtures-nba"
```

- [ ] **Step 2: Live-score cron**

```yaml
name: Sync NBA live scores

on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch: {}

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger sync-live-nba
        run: curl -sf "https://the-pitch-invaders.vercel.app/api/sync-live-nba"
```

- [ ] **Step 3: Push (workflow-scope gotcha)**

If `git push` is rejected with "refusing to allow an OAuth App to create or update workflow ... without `workflow` scope" (this has happened before in this repo for `.github/workflows/*` changes), run `gh auth refresh -h github.com -s workflow` (device-code flow, approve in browser) and push again — no new PAT needed.

```bash
git add .github/workflows/sync-fixtures-nba.yml .github/workflows/sync-live-nba.yml
git commit -m "Add GitHub Actions cron for NBA fixture + live-score sync"
git push
```

---

## Task 12: End-to-end manual verification

No live NBA game exists to test against until the 2026-27 season starts (~October 2026) — this project's established alternative (used for every scoring-formula change so far, e.g. the PEN-scoring fixes and swap) is hand-validating against real historical/finished data plus a full type-check.

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole project.

- [ ] **Step 2: Deploy and trigger the fixture sync**

```bash
curl -s "https://the-pitch-invaders.vercel.app/api/sync-fixtures-nba"
```

Expected: `{"ok":true,"upserted":N}` — `N` may be `0` if ESPN hasn't published the 2026-27 schedule yet; that's expected, not a failure. If ESPN happens to still expose the tail of the finished 2025-26 season for some date range, cross-check a handful of upserted rows in Supabase against `curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD"` for the same date, confirming team names/ids/scores match.

- [ ] **Step 3: Trigger the live sync**

```bash
curl -s "https://the-pitch-invaders.vercel.app/api/sync-live-nba"
```

Expected: `{"ok":true,"updated":N,"scored":N,"errors":[]}` (or the `skipped` shape if nothing is active yet).

- [ ] **Step 4: Confirm `/competitions` and the NBA fixtures page render**

Run: `npm run dev`, then open `http://localhost:3000/competitions` — expect an "NBA" tile under a "USA" section header, with the American flag icon (from `getFlagUrl('USA')`). Click into it — expect week-paginated fixtures (or "No matches found" if the schedule isn't published yet) and no console errors. If any NBA fixtures exist, confirm a `BasketballMatchCard` renders (winner-side toggle + margin-bucket toggle, not the football score stepper).

- [ ] **Step 5: Hand-validate the scoring formula against real historical NBA data**

Pick any finished 2025-26 NBA game (e.g. the Wizards 131–153 76ers game confirmed live during planning, event id `401810960`, DraftKings spread `PHI -14.5`). Compute by hand: `threshold = round(abs(14.5)) = 15` (wait: `spread` field itself was `14.5`, already unsigned in this instance — use whatever `pickcenter[0].spread` actually returns for the chosen game). Confirm `npx tsx scripts/verify-basketball-scoring.ts` (Task 1) still passes, and that its formula matches what's in `supabase/migrations/017_basketball_predictions.sql` line-for-line (read both side by side).

- [ ] **Step 6: Confirm the football path didn't regress**

Open any existing football match-detail/prediction page and confirm the score-stepper `PredictionInput` still renders and saves correctly — the `tryEspn()` guard in Task 2 and the nullable-column migration in Task 1 are the two changes with the most theoretical blast radius on the existing football flow.
