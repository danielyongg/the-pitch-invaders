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
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-[var(--font-jetbrains)] tracking-wide px-3 py-1 rounded-full"
            style={{ backgroundColor: LEAGUE_COLORS[NBA_LEAGUE_ID].bg, color: LEAGUE_COLORS[NBA_LEAGUE_ID].text }}
          >
            NBA
          </span>
          {match.season_type === 'preseason' && (
            <span className="text-xs font-[var(--font-jetbrains)] tracking-wide px-3 py-1 rounded-full bg-[var(--color-border-strong)] text-[var(--color-text-secondary)]">
              Pre Season
            </span>
          )}
        </div>
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
        {canPredict && match.odds_spread != null ? (
          <BasketballPredictionInput
            matchId={match.id}
            userId={userId}
            homeTeamName={match.home_team_name}
            awayTeamName={match.away_team_name}
            oddsSpread={match.odds_spread}
            existing={prediction}
          />
        ) : canPredict ? (
          <p className="text-xs text-center text-[var(--color-text-muted)] font-[var(--font-jetbrains)] tracking-wide py-1">
            Odds not available yet — check back closer to tip-off
          </p>
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
