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
