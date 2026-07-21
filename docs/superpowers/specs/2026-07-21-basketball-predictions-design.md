# Basketball (NBA) Predictions — Design Spec

Status: approved by user 2026-07-21, ready for implementation planning.

## Why

The Pitch Invaders currently only supports football predictions. User wants to add NBA basketball predictions alongside football, sharing one combined leaderboard (`leaderboard_cache` sums `points_awarded` across all of a user's predictions regardless of sport).

## Scope

Full vertical slice for **NBA specifically**: DB schema, odds ingestion, fixture sync, live score sync, scoring function, prediction UI.

**Out of scope**: standings/conference-table page (future work, not designed here).

**Known test constraint**: NBA 2026-27 regular season doesn't start until ~October 2026 (design done in July 2026) — no live game to test end-to-end yet. Verification leans on historical/finished-game data instead (see Testing section).

## Prediction shape

Per basketball match, two independent choices:
1. `predicted_winner_side`: `'home'` | `'away'` — which team wins.
2. `predicted_margin_bucket`: `'more'` | `'exact'` | `'less'` — margin of victory vs. a threshold shown in the UI (e.g. "wins by more than 5 / exactly 5 / less than 5"), where the threshold = `round(abs(bookmaker spread))` for that match.

## Scoring formula

- `actual_winner_side` = `'home'` if `home_score > away_score` else `'away'` (no ties in basketball).
- `actual_margin` = `abs(home_score - away_score)` — **absolute, side-independent**. Deliberately not "signed relative to the picked team": that version had a loophole (pick the eventual loser + always pick "less than N" auto-scores margin-correct every time, since a losing margin is always negative and therefore always < N). Absolute/unsigned margin makes the winner-pick and margin-pick fully independent, non-gameable questions.
- `threshold` = `round(matches.odds_spread)`; if `odds_spread` is null (no market data snapshotted for that match), fall back to a fixed default threshold of 5.
- `margin_correct` = `(bucket='more' AND actual_margin > threshold) OR (bucket='exact' AND actual_margin = threshold) OR (bucket='less' AND actual_margin < threshold)`
- `winner_correct` = `predicted_winner_side = actual_winner_side`
- Points: both correct = **3**, winner correct only = **2**, margin correct only = **1**, neither = **0**. Matches the existing football 0–3 scale so the combined leaderboard stays fair (see current football formula in migration `016_swap_pen_draw_winner_points.sql`).

## Odds data source

`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={id}` — free, no key, same ESPN family already used by the project. Returns `pickcenter[0].spread` (signed number from DraftKings, e.g. `-5.5`). Take `abs()`.

Must be **snapshotted into the DB once, before kickoff** (new `matches.odds_spread` column) — same one-time-fill pattern as `pregame_summary`/`onexbet_stats`: odds move/disappear as the market changes, so scoring later must read the frozen snapshot, not refetch.

## Data model changes

- `matches.sport` (text, default `'football'`) — new discriminator column.
- `matches.odds_spread` (numeric, nullable) — snapshot of `abs(pickcenter[0].spread)`, filled once pre-kickoff.
- `predictions`:
  - `predicted_home` / `predicted_away` become nullable (currently `NOT NULL`, football-only shape).
  - New nullable columns: `predicted_winner_side text`, `predicted_margin_bucket text`.
  - Which columns are populated depends on `matches.sport` — enforced at the **application level**, not a DB CHECK/trigger across tables (deliberate simplification; a cross-column trigger was judged not worth the complexity for now — revisit if bad data gets in).
- NBA gets a new `league_id` (e.g. `200`). `league_id` is a purely internal arbitrary integer today (historically api-sports.io numbering, that provider is fully dead code now) — zero collision risk assigning a new one.

## `lib/espn.ts` generalization

**Approach: generalize in-place** (not a parallel module). Every ESPN helper today hardcodes the `soccer` URL path (`.../sports/soccer/${slug}/scoreboard`, `.../soccer/${slug}/summary`, etc). Basketball's family is `.../sports/basketball/nba/scoreboard`, `.../basketball/nba/summary` — a different sport path segment, not just a new slug in the existing map.

- Add a `sportPath` parameter (default `'soccer'`) to the core functions (`fetchEspnSummary`, `resolveEspnEventId`, scoreboard fetchers, etc).
- Per-league config carries `{ slug, sportPath }` instead of just `slug`.
- Check whether `mapEspnStatus`'s status-code enum (`STATUS_FULL_TIME` etc.) is shared between soccer and NBA on ESPN's side — add a small branch there only if it differs.

Rejected alternative: a parallel `lib/basketball.ts` with its own copies of fetch/resolve/status-map logic. Would isolate football from any regression risk, but duplicates logic that will need fixing in two places if ESPN's response shape changes again later. In-place generalization keeps one source of truth, matching how this codebase already shares `lib/espn.ts` helpers across `sync-live` and `sync-fixtures`.

## `sync-fixtures` — NBA block

A loop separate from the existing 5-European-leagues loop:
- No penalty-related columns (basketball has no PEN/AET concept).
- Round-numbering: NBA doesn't fit `assignMatchdays()` (that's built for round-robin league matchdays). Reuse the **'week' pagination mode** already built for Club Friendlies (`lib/fixtures-pagination.ts`), not 'matchday' mode.

## `sync-live` — NBA block + odds pre-fill

- `applyUpdates()` is already sport-agnostic in principle (matches by team name, writes generic status/score columns). Confirm the WC-only special cases (`advanceBracketSeed`, `advanceKnockoutWinner`, 1xBet fill — all gated on `league_id === 77`) don't fire for basketball. They shouldn't; the gate is already specific to that literal league id.
- New pre-fill loop needed for `odds_spread`, same shape as `fillOnexbetPreMatch`: for `status='NS'` upcoming NBA matches, fetch `pickcenter[0].spread`, take `abs()`, write once, guarded so it doesn't refetch after it's already filled.

## Scoring — new migration

A migration after `016_swap_pen_draw_winner_points.sql` adds a basketball branch to `score_match_predictions`, branching on `matches.sport` at the top of the function, without touching the existing football/PEN logic. Implements the formula in the Scoring section above.

## UI — sibling components

**Approach: new sibling components**, not branches inside the existing football components. `MatchCard.tsx` and `PredictionInput.tsx` are both deeply football-shaped (two number-stepper score inputs, football-only badges/labels). Basketball's input shape (winner-side toggle + 3-way margin-bucket picker) is different enough that cramming both into one component would mean a lot of branching `if/else` that's easy to get subtly wrong, versus two focused, independently-readable files.

New files: `BasketballMatchCard.tsx`, `BasketballPredictionInput.tsx`. Parent pages (`/competitions/[leagueId]`, favorites, home, etc.) pick the component to render based on `match.sport`.

## Testing / verification plan

No live NBA game exists to test end-to-end until the season starts (~October 2026). Verification instead:
1. Use a **finished historical NBA game's real data** (final score + a known DraftKings spread from that game) to hand-validate the scoring function's math — same approach used to validate the PEN-scoring fix and the PEN-scoring-swap migration in this project (manual query + expected-math check by hand).
2. Verify the ESPN odds endpoint against a real historical `event={id}` via curl before relying on its shape in code (same practice already used for every other ESPN/FOX/Fotmob integration in this project).
3. `npx tsc --noEmit` clean as a baseline sanity check, same as prior sync-live changes in this codebase.
4. Fixture sync and live-score sync for NBA can be smoke-tested against ESPN's real current-season schedule/scoreboard data (even off-season, ESPN typically has last season's finished games and next season's early schedule available) rather than needing a currently-live game.

## Open items intentionally deferred (not blockers for this spec)

- Standings/conference tables for NBA — explicitly out of scope, future work.
- Cross-column DB-level validation between `matches.sport` and which `predictions` columns are populated — deliberately left to application-level validation for now.
