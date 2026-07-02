'use client'

import { useState } from 'react'
import Image from 'next/image'
import KickoffCountdown from './KickoffCountdown'
import PredictionInput from '@/components/predictions/PredictionInput'
import type { Match, Prediction } from '@/lib/supabase/types'

const ROUND_LABELS: Record<string, string> = {
  group: 'Group Stage',
  knockout: 'Knockout Stage',
}

const LEAGUE_NAMES: Record<number, string> = {
  77: 'World Cup 2026',
  47: 'English Premier League',
  87: 'La Liga',
  54: 'Bundesliga',
  55: 'Serie A',
  53: 'Ligue 1',
}

// Each league's primary brand color, for the header pill
const LEAGUE_COLORS: Record<number, { bg: string; text: string }> = {
  77: { bg: '#00408f', text: '#aec6ff' },
  47: { bg: '#3d195b', text: '#e6cdfb' },
  87: { bg: '#8c1c40', text: '#ffc9dd' },
  54: { bg: '#7a0017', text: '#ffb3bd' },
  55: { bg: '#024494', text: '#a9d4ff' },
  53: { bg: '#091c3e', text: '#9fc1ff' },
}

const COUNTRY_CODE: Record<string, string> = {
  'Algeria': 'dz', 'Argentina': 'ar', 'Australia': 'au', 'Austria': 'at',
  'Belgium': 'be', 'Bosnia and Herzegovina': 'ba', 'Brazil': 'br',
  'Canada': 'ca', 'Cape Verde': 'cv', 'Chile': 'cl', 'Colombia': 'co',
  'Croatia': 'hr', 'Curacao': 'cw', 'Czechia': 'cz', 'Czech Republic': 'cz',
  'DR Congo': 'cd', 'Ecuador': 'ec', 'Egypt': 'eg', 'England': 'gb-eng',
  'France': 'fr', 'Germany': 'de', 'Ghana': 'gh', 'Haiti': 'ht',
  'Iran': 'ir', 'Iraq': 'iq', 'Italy': 'it', 'Ivory Coast': 'ci',
  'Japan': 'jp', 'Jordan': 'jo', 'Mexico': 'mx', 'Morocco': 'ma',
  'Netherlands': 'nl', 'New Zealand': 'nz', 'Nigeria': 'ng', 'Norway': 'no',
  'Panama': 'pa', 'Paraguay': 'py', 'Peru': 'pe', 'Poland': 'pl',
  'Portugal': 'pt', 'Qatar': 'qa', 'Saudi Arabia': 'sa',
  'Scotland': 'gb-sct', 'Senegal': 'sn', 'Serbia': 'rs',
  'South Africa': 'za', 'South Korea': 'kr', 'Spain': 'es',
  'Sweden': 'se', 'Switzerland': 'ch', 'Tunisia': 'tn',
  'Turkiye': 'tr', 'Turkey': 'tr', 'Ukraine': 'ua',
  'USA': 'us', 'United States': 'us', 'Uruguay': 'uy',
  'Uzbekistan': 'uz', 'Wales': 'gb-wls',
}

function getFlagUrl(teamName: string): string | null {
  // Handle "Team A/Team B" placeholder names (knockout TBD)
  const base = teamName.split('/')[0].trim()
  const code = COUNTRY_CODE[teamName] ?? COUNTRY_CODE[base]
  if (!code) return null
  return `https://flagcdn.com/${code}.svg`
}

function getTeamImageUrl(match: Match, isHome: boolean): string | null {
  if (match.league_id === 77) return getFlagUrl(isHome ? match.home_team_name : match.away_team_name)
  return (isHome ? match.home_team_logo : match.away_team_logo) ?? null
}

// ponytail: img URLs from upstream APIs sometimes 404 — initials badge as visual fallback, no extra request
function TeamBadge({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()
  return (
    <div className="w-16 h-16 flex items-center justify-center">
      {src && !failed
        ? <img src={src} alt={name} className="w-full h-full object-contain" onError={() => setFailed(true)} />
        : <div className="w-full h-full rounded-full bg-[var(--color-border-strong)] flex items-center justify-center">
            <span className="text-sm font-bold text-[var(--color-text-secondary)]">{initials}</span>
          </div>
      }
    </div>
  )
}

const POINTS_LABEL: Record<number, { label: string; color: string }> = {
  3: { label: '+3', color: 'text-[#aec6ff]' },
  1: { label: '+1', color: 'text-[#ffb4a9]' },
  0: { label: '+0', color: 'text-[var(--color-text-muted)]' },
}

interface Props {
  match: Match
  prediction?: Prediction | null
  userId?: string
}

export default function MatchCard({ match, prediction, userId }: Props) {
  const kickoffTime = new Date(match.kickoff_time)
  const [locked, setLocked] = useState(kickoffTime <= new Date())
  const isFinished = match.status === 'FT' || match.status === 'AET' || match.status === 'PEN'
  const isLive = match.status === 'HT' || match.status === 'LIVE' ||
    ['1H','2H','ET','BT','P'].includes(match.status) ||
    /^\d+['′]$/.test(match.status ?? '')
  const liveMinute = isLive ? match.status : null

  const canPredict = userId && !locked && !isFinished

  return (
    <div className="glass-card rounded-2xl overflow-hidden hover:border-[rgba(174,198,255,0.2)] transition">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-xs font-[var(--font-jetbrains)] tracking-wide px-3 py-1 rounded-full"
            style={{
              backgroundColor: (LEAGUE_COLORS[match.league_id] ?? LEAGUE_COLORS[77]).bg,
              color: (LEAGUE_COLORS[match.league_id] ?? LEAGUE_COLORS[77]).text,
            }}
          >
            {LEAGUE_NAMES[match.league_id] ?? 'Match'}
          </span>
          {match.league_id === 77 && match.round && (
            <span className="text-xs font-[var(--font-jetbrains)] tracking-wide px-3 py-1 rounded-full bg-[var(--color-input)] text-[var(--color-text-secondary)] border border-[var(--glass-08)]">
              {ROUND_LABELS[match.round] ?? match.round}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1 text-xs text-[#ffb4a9] font-[var(--font-jetbrains)] font-semibold tracking-wide">
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
            <span className="text-xs text-[#ffb4a9] bg-[rgba(255,180,169,0.1)] px-2 py-0.5 rounded-full font-[var(--font-jetbrains)] tracking-wide">Locked</span>
          ) : (
            <KickoffCountdown kickoffTime={match.kickoff_time} onKickoff={() => setLocked(true)} />
          )}
        </div>
      </div>

      {/* Teams & Score */}
      <div className="px-4 py-6">
        <div className="flex items-start gap-3">
          {/* Home */}
          <div className="flex-1 flex flex-col items-center gap-3">
            <TeamBadge src={getTeamImageUrl(match, true)} name={match.home_team_name} />
            <span className="text-sm font-[var(--font-anybody)] font-semibold text-[var(--color-text-primary)] text-center leading-tight min-h-[2.5rem] flex items-center [font-variation-settings:'wdth'_100]">
              {match.home_team_name}
            </span>
          </div>

          {/* Score or VS */}
          <div className="flex-shrink-0 text-center px-2 pt-4">
            {(isFinished || isLive) && match.home_score != null ? (
              <div>
                <div className="text-3xl font-[var(--font-anybody)] font-extrabold text-[var(--color-text-primary)] tabular-nums [font-variation-settings:'wdth'_100]">
                  {match.home_score} – {match.away_score}
                </div>
                {match.status === 'PEN' && match.home_penalty_score != null && (
                  <div className="text-xs text-[var(--color-text-muted)] font-[var(--font-jetbrains)] tracking-wide mt-1">
                    ({match.home_penalty_score} – {match.away_penalty_score} pens)
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <span className="font-[var(--font-anybody)] font-bold text-2xl text-[rgba(195,198,211,0.5)] [font-variation-settings:'wdth'_100]">VS</span>
                <div className="text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide">
                  {kickoffTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  <div className="text-[var(--color-text-muted)]">
                    {kickoffTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Away */}
          <div className="flex-1 flex flex-col items-center gap-3">
            <TeamBadge src={getTeamImageUrl(match, false)} name={match.away_team_name} />
            <span className="text-sm font-[var(--font-anybody)] font-semibold text-[var(--color-text-primary)] text-center leading-tight min-h-[2.5rem] flex items-center [font-variation-settings:'wdth'_100]">
              {match.away_team_name}
            </span>
          </div>
        </div>
      </div>

      {/* Prediction Section */}
      <div className="px-4 pb-4 pt-2 border-t border-[var(--color-border)] bg-[var(--glass-03)]">
        {canPredict ? (
          <PredictionInput matchId={match.id} userId={userId} existing={prediction} />
        ) : prediction ? (
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--color-text-secondary)]">
              Your prediction:{' '}
              <span className="font-bold text-[var(--color-text-primary)] font-[var(--font-anybody)] [font-variation-settings:'wdth'_100]">
                {prediction.predicted_home} – {prediction.predicted_away}
              </span>
            </div>
            {prediction.points_awarded != null && (
              <span className={`text-sm font-bold font-[var(--font-anybody)] [font-variation-settings:'wdth'_100] ${POINTS_LABEL[prediction.points_awarded]?.color ?? 'text-[var(--color-text-secondary)]'}`}>
                {POINTS_LABEL[prediction.points_awarded]?.label}
              </span>
            )}
          </div>
        ) : userId ? (
          <p className="text-xs text-center text-[var(--color-text-muted)] font-[var(--font-jetbrains)] tracking-wide py-1">
            {locked ? 'Predictions closed before kickoff' : 'No prediction yet'}
          </p>
        ) : (
          <p className="text-xs text-center text-[var(--color-text-muted)] py-1">
            <a href="/auth/login" className="text-[#aec6ff] hover:text-[#c8d8ff] font-[var(--font-jetbrains)] tracking-wide">Sign in</a>
            {' '}to make a prediction
          </p>
        )}
      </div>
    </div>
  )
}
