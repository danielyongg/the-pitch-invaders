export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import MatchCard from '@/components/matches/MatchCard'
import LivePoller from '@/components/matches/LivePoller'

const F = {
  display: 'var(--font-anybody), sans-serif',
  mono: 'var(--font-jetbrains), monospace',
  body: 'var(--font-hanken), system-ui, sans-serif',
} as const

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const from = new Date()
  const to = new Date()
  to.setDate(to.getDate() + 7)

  const { data: liveMatches } = await supabase
    .from('matches')
    .select('*')
    .not('status', 'in', '("NS","FT","AET","PEN","CANC","PST")')
    .order('kickoff_time', { ascending: true })

  const { data: upcomingMatches } = await supabase
    .from('matches')
    .select('*')
    .eq('status', 'NS')
    .gte('kickoff_time', from.toISOString())
    .lte('kickoff_time', to.toISOString())
    .order('kickoff_time', { ascending: true })
    .limit(50)

  let favoriteTeams: string[] = []
  let favoriteLeagues: number[] = []
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('favorite_team_names, favorite_league_ids')
      .eq('id', user.id)
      .maybeSingle()
    favoriteTeams = profile?.favorite_team_names ?? []
    favoriteLeagues = profile?.favorite_league_ids ?? []
  }
  const isFavorite = (m: { home_team_name: string; away_team_name: string; league_id: number }) =>
    favoriteTeams.includes(m.home_team_name) || favoriteTeams.includes(m.away_team_name) ||
    favoriteLeagues.includes(m.league_id)

  const matches = (upcomingMatches ?? [])
    .sort((a, b) => Number(isFavorite(b)) - Number(isFavorite(a)))
    .slice(0, 6)

  let predictionsMap: Record<string, any> = {}
  const predictableMatchIds = [...matches, ...(liveMatches ?? [])].map(m => m.id)
  if (user && predictableMatchIds.length) {
    const { data: preds } = await supabase
      .from('predictions')
      .select('match_id, predicted_home, predicted_away, points_awarded')
      .eq('user_id', user.id)
      .in('match_id', predictableMatchIds)
    if (preds) predictionsMap = Object.fromEntries(preds.map(p => [p.match_id, p]))
  }

  return (
    <div>
      {!user && (
        <>
          {/* Hero */}
          <section
            className="relative py-32 overflow-hidden"
            style={{
              backgroundImage: 'url(https://images.unsplash.com/photo-1731870881782-1948058d9ce1?q=80&w=1674&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
              backgroundSize: 'cover',
              backgroundPosition: 'center top',
            }}
          >
            {/* Dark overlay */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(10,12,18,0.92) 0%, rgba(10,12,18,0.75) 50%, rgba(10,12,18,0.3) 100%)' }} />
            <div className="relative max-w-7xl mx-auto px-8 flex flex-col items-start max-w-2xl">
            {/* Live badge */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-8 text-xs uppercase"
              style={{
                background: 'rgba(197,0,5,0.2)',
                border: '1px solid #c50005',
                color: '#ffb4a9',
                fontFamily: F.mono,
                letterSpacing: '1.4px',
              }}
            >
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#ffb4a9' }} />
              Live: World Cup 2026
            </div>

            {/* Headline */}
            <h1
              className="mb-8 leading-tight text-[40px] sm:text-[56px] lg:text-[72px]"
              style={{
                fontFamily: F.display,
                fontVariationSettings: '"wdth" 100',
                fontWeight: 800,
                color: '#e1e2ec',
                letterSpacing: '-1.44px',
              }}
            >
              Master the Pitch.<br />
              <span style={{ color: '#aec6ff', fontWeight: 400 }}>Predict</span> the Glory.
            </h1>

            <p className="text-base sm:text-lg leading-relaxed mb-10 max-w-xl" style={{ color: '#c3c6d3' }}>
              Step into the arena where precision meets passion. Join the elite community of football predictors and turn your insights into tangible rewards.
            </p>

            <div className="flex flex-wrap gap-3 sm:gap-4">
              <Link
                href="/auth/signup"
                className="px-6 sm:px-10 py-3 sm:py-4 rounded-xl transition font-bold text-base sm:text-2xl"
                style={{
                  fontFamily: F.display,
                  fontVariationSettings: '"wdth" 100',
                  background: '#aec6ff',
                  color: '#001a42',
                }}
              >
                Join for Free
              </Link>
              <Link
                href="/competitions"
                className="px-6 sm:px-10 py-3 sm:py-4 rounded-xl transition font-bold text-base sm:text-2xl"
                style={{
                  fontFamily: F.display,
                  fontVariationSettings: '"wdth" 100',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(174,198,255,0.3)',
                  color: '#e1e2ec',
                  backdropFilter: 'blur(8px)',
                }}
              >
                View Matches
              </Link>
            </div>
            </div>
          </section>

          <div className="max-w-7xl mx-auto px-8">
          {/* Scoring System */}
          <section className="py-16" style={{ borderTop: '1px solid var(--color-border)' }}>
            <div className="mb-10">
              <h2
                className="mb-2"
                style={{ fontFamily: F.display, fontVariationSettings: '"wdth" 100', fontWeight: 700, fontSize: 40, color: 'var(--color-text-primary)' }}
              >
                The Winning Formula
              </h2>
              <p style={{ color: 'var(--color-text-secondary)' }}>Strategic points system designed for the true fans.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <ScoreCard
                points="3" pointsColor="var(--color-accent-text)" title="Exact Score"
                description="Predict the final scoreline perfectly to claim the maximum reward."
                iconBg="rgba(174,198,255,0.2)" emoji="🎯"
              />
              <ScoreCard
                points="1" pointsColor="var(--color-live-text)" title="Match Result"
                description="Correctly guess the winner or a draw to stay ahead in the race."
                iconBg="rgba(255,180,169,0.2)" emoji="⚽"
              />
              {/* Community card */}
              <div className="glass-card rounded-3xl p-8 flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-xl mb-5 flex items-center justify-center text-2xl" style={{ background: 'rgba(174,198,255,0.2)' }}>
                    🌍
                  </div>
                  <div
                    style={{ fontFamily: F.display, fontVariationSettings: '"wdth" 100', fontWeight: 700, fontSize: 32, color: 'var(--color-text-primary)' }}
                  >Join the Squad</div>
                </div>
                <p className="text-sm mt-4" style={{ color: 'var(--color-text-secondary)' }}>
                  Compete with friends, climb the leaderboard, and turn every matchday into a battle of instincts.
                </p>
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="py-20">
            <div
              className="rounded-[48px] px-6 sm:px-16 py-14 sm:py-24 text-center relative overflow-hidden"
              style={{
                background: 'linear-gradient(25deg, rgba(174,198,255,0.1) 0%, rgba(255,180,169,0.05) 100%)',
                border: '1px solid var(--color-border)',
              }}
            >
              <h2
                className="mb-6 leading-tight text-[36px] sm:text-[56px] lg:text-[72px]"
                style={{
                  fontFamily: F.display,
                  fontVariationSettings: '"wdth" 100',
                  fontWeight: 800,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-1.44px',
                }}
              >
                Ready to join<br />the invasion?
              </h2>
              <p className="text-base sm:text-lg mb-10 max-w-2xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
                Don&apos;t just watch the game. Own the outcome. Register today and get your first prediction streak bonus.
              </p>
              <Link
                href="/auth/signup"
                className="inline-block px-8 sm:px-12 py-4 sm:py-5 rounded-2xl font-bold transition text-base sm:text-2xl"
                style={{
                  fontFamily: F.display,
                  fontVariationSettings: '"wdth" 100',
                  background: '#aec6ff',
                  color: '#001a42',
                }}
              >
                Create Free Account
              </Link>
            </div>
          </section>
          </div>
        </>
      )}

      <div className="max-w-7xl mx-auto px-8">
      <LivePoller hasLiveMatch={(liveMatches?.length ?? 0) > 0} />

      {/* Live Now */}
      {liveMatches && liveMatches.length > 0 && (
        <section className="py-10" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3 mb-6">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffb4a9] animate-pulse" />
            <h2 style={{ fontFamily: F.display, fontVariationSettings: '"wdth" 100', fontWeight: 800, fontSize: 32, color: 'var(--color-live-text)', letterSpacing: '-0.5px' }}>
              Live Now
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveMatches.map(match => (
              <MatchCard key={match.id} match={match} prediction={predictionsMap[match.id]} userId={user?.id} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Matches */}
      <section className={user ? 'py-8' : 'py-16'} style={user ? {} : { borderTop: '1px solid var(--color-border)' }}>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8">
          <div>
            <h2
              className="text-[28px] sm:text-[40px]"
              style={{
                fontFamily: F.display,
                fontVariationSettings: '"wdth" 100',
                fontWeight: 800,
                color: 'var(--color-text-primary)',
                letterSpacing: '-1px',
              }}
            >
              {user ? 'Match Predictor' : 'Upcoming Matches'}
            </h2>
            <p className="mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              {user
                ? "Lock in your scores for this week's fixtures. Precision is everything."
                : 'The biggest fixtures ready for your predictions.'}
            </p>
          </div>
          <Link
            href="/competitions"
            className="text-sm transition hover:opacity-80"
            style={{ fontFamily: F.mono, color: 'var(--color-accent-text)', letterSpacing: '0.7px' }}
          >
            VIEW ALL FIXTURES →
          </Link>
        </div>

        {!matches?.length ? (
          <div className="text-center py-20" style={{ color: 'var(--color-text-secondary)' }}>
            <div className="mb-3 flex flex-col items-center">
              <div className="w-14 h-14 rounded-xl overflow-hidden border border-[var(--color-border)] flex flex-col">
                <div className="bg-[#e53e3e] text-white text-[10px] font-bold tracking-widest uppercase text-center py-1">
                  {new Date().toLocaleDateString('en-GB', { month: 'short' })}
                </div>
                <div className="bg-[#1e2028] flex-1 flex items-center justify-center text-[var(--color-text-primary)] text-2xl font-extrabold font-[var(--font-anybody)] [font-variation-settings:'wdth'_100]">
                  {new Date().getDate()}
                </div>
              </div>
            </div>
            <p>No matches in the next 7 days</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {matches.map(match => (
              <MatchCard key={match.id} match={match} prediction={predictionsMap[match.id]} userId={user?.id} />
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  )
}

function ScoreCard({ points, pointsColor, title, description, iconBg, emoji }: {
  points: string; pointsColor: string; title: string; description: string; iconBg: string; emoji: string;
}) {
  const F = { display: 'var(--font-anybody), sans-serif', mono: 'var(--font-jetbrains), monospace' }
  return (
    <div className="glass-card rounded-3xl p-8 relative overflow-hidden">
      <div className="w-12 h-12 rounded-xl mb-5 flex items-center justify-center text-2xl" style={{ background: iconBg }}>
        {emoji}
      </div>
      <h3 style={{ fontFamily: F.display, fontVariationSettings: '"wdth" 100', fontWeight: 700, fontSize: 32, color: 'var(--color-text-primary)' }}>
        {title}
      </h3>
      <div className="flex items-baseline gap-2 my-3">
        <span style={{ fontFamily: F.display, fontVariationSettings: '"wdth" 100', fontWeight: 800, fontSize: 48, color: pointsColor }}>
          {points}
        </span>
        <span style={{ fontFamily: F.mono, fontSize: 14, color: 'var(--color-text-secondary)', letterSpacing: '0.7px' }}>PTS</span>
      </div>
      <p style={{ color: 'var(--color-text-secondary)' }}>{description}</p>
    </div>
  )
}
