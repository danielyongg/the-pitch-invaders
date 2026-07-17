import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import UserMenu from '@/components/auth/UserMenu'
import MobileMenu from '@/components/ui/MobileMenu'
import ThemeToggle from '@/components/ui/ThemeToggle'

export default async function Navbar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  let totalPoints = 0
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data
    const { data: lb } = await supabase
      .from('leaderboard_cache')
      .select('total_points')
      .eq('user_id', user.id)
      .maybeSingle()
    totalPoints = lb?.total_points ?? 0
  }

  return (
    <nav
      className="sticky top-0 z-40 h-20 border-b relative"
      style={{
        backgroundColor: 'var(--color-navbar-bg)',
        borderColor: 'var(--color-border)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-full flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-8 min-w-0">
          <Link href="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Image
              src="/TPI New Logo - Transparant.png"
              alt="The Pitch Invaders Logo"
              width={44}
              height={44}
              className="object-contain flex-shrink-0 sm:w-12 sm:h-12"
            />
            <div className="flex flex-col whitespace-nowrap">
              <span
                className="font-extrabold text-lg sm:text-lg tracking-tight leading-tight"
                style={{
                  fontFamily: 'var(--font-anybody), sans-serif',
                  fontVariationSettings: '"wdth" 100',
                  color: 'var(--color-accent-text)',
                }}
              >
                The Pitch Invaders
              </span>
              <span
                className="block text-[9px] xs:text-[9px] sm:text-[10px] tracking-[0.5px] sm:tracking-[1px] uppercase"
                style={{ fontFamily: 'var(--font-jetbrains), monospace', color: 'var(--color-text-secondary)' }}
              >
                Your Sports League Simulator
              </span>
            </div>
          </Link>

          <div className="hidden lg:flex items-center gap-6 whitespace-nowrap">
            <NavLink href="/competitions" label="Matches" />
            <NavLink href="/leaderboard" label="Leaderboard" />
            {user && <NavLink href="/leagues" label="Private Leagues" />}
            {user && <NavLink href="/predict" label="My Predictions" />}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          {user && profile ? (
            <>
              <Link
                href={`/profile/${user.id}`}
                className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition hover:brightness-125"
                style={{
                  background: 'rgba(0,64,143,0.2)',
                  border: '1px solid rgba(174,198,255,0.2)',
                }}
              >
                <span style={{ fontFamily: 'var(--font-jetbrains), monospace', color: 'var(--color-accent-text)', fontSize: 13, letterSpacing: '0.7px' }}>
                  {totalPoints.toLocaleString('en-US')} pts
                </span>
              </Link>
              <UserMenu profile={profile} />
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/auth/login"
                className="hidden sm:inline text-sm transition"
                style={{ fontFamily: 'var(--font-jetbrains), monospace', color: 'var(--color-text-secondary)', letterSpacing: '0.7px' }}
              >
                Sign In
              </Link>
              <Link
                href="/auth/signup"
                className="text-sm font-bold px-3 sm:px-5 py-2 rounded-xl transition whitespace-nowrap"
                style={{
                  fontFamily: 'var(--font-anybody), sans-serif',
                  fontVariationSettings: '"wdth" 100',
                  background: '#aec6ff',
                  color: '#002e6a',
                }}
              >
                Join for Free
              </Link>
            </div>
          )}
          <MobileMenu
            items={[
              { href: '/competitions', label: 'Matches' },
              { href: '/leaderboard', label: 'Leaderboard' },
              ...(user ? [{ href: '/leagues', label: 'Private Leagues' }, { href: '/predict', label: 'My Predictions' }] : [{ href: '/auth/login', label: 'Sign In' }]),
            ]}
            userId={user?.id}
            totalPoints={user ? totalPoints : undefined}
          />
        </div>
      </div>
    </nav>
  )
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-sm transition hover:opacity-80 whitespace-nowrap"
      style={{ fontFamily: 'var(--font-jetbrains), monospace', color: 'var(--color-text-secondary)', letterSpacing: '0.7px' }}
    >
      {label}
    </Link>
  )
}
