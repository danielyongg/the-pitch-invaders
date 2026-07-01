type Winner = 'home' | 'away' | 'draw'

function getWinner(home: number, away: number): Winner {
  if (home > away) return 'home'
  if (away > home) return 'away'
  return 'draw'
}

export function calculatePoints(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number
): number {
  if (predictedHome === actualHome && predictedAway === actualAway) return 3
  if (getWinner(predictedHome, predictedAway) === getWinner(actualHome, actualAway)) return 1
  return 0
}
