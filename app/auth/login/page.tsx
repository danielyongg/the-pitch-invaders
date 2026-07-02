'use client'

export const dynamic = 'force-dynamic'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else { router.push(redirectTo); router.refresh() }
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${redirectTo}` },
    })
  }

  return (
    <div className="glass-card rounded-2xl p-8 shadow-xl">
      <button
        onClick={handleGoogle}
        className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-semibold py-3 px-4 rounded-xl hover:bg-gray-100 transition mb-6"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 h-px bg-[var(--color-border)]" />
        <span className="text-[var(--color-text-muted)] text-sm font-[var(--font-jetbrains)]">or</span>
        <div className="flex-1 h-px bg-[var(--color-border)]" />
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        {error && (
          <div className="bg-[rgba(197,0,5,0.1)] border border-[rgba(255,180,169,0.3)] text-[#ffb4a9] text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}
        <div>
          <label className="block text-sm font-[var(--font-jetbrains)] tracking-wide text-[var(--color-text-secondary)] mb-2">Email</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)} required
            placeholder="you@example.com"
            className="w-full bg-[var(--color-input)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#aec6ff] focus:border-transparent placeholder-[var(--color-text-muted)]"
          />
        </div>
        <div>
          <label className="block text-sm font-[var(--font-jetbrains)] tracking-wide text-[var(--color-text-secondary)] mb-2">Password</label>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)} required
            placeholder="••••••••"
            className="w-full bg-[var(--color-input)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#aec6ff] focus:border-transparent placeholder-[var(--color-text-muted)]"
          />
        </div>
        <button
          type="submit" disabled={loading}
          className="w-full bg-[#aec6ff] hover:bg-[#c8d8ff] disabled:bg-[rgba(174,198,255,0.5)] text-[#002e6a] font-bold font-[var(--font-anybody)] [font-variation-settings:'wdth'_100] py-3 px-4 rounded-xl transition text-lg"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <p className="text-center text-[var(--color-text-muted)] text-sm mt-6 font-[var(--font-jetbrains)]">
        Don&apos;t have an account?{' '}
        <Link href="/auth/signup" className="text-[var(--color-accent-text)] hover:text-[var(--color-accent-hover)]">
          Sign up for free
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-navy)] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-[var(--font-anybody)] font-extrabold text-3xl text-[var(--color-accent-text)] tracking-tight [font-variation-settings:'wdth'_100]">The Pitch Invaders</h1>
          <p className="text-[var(--color-text-secondary)] mt-2 font-[var(--font-jetbrains)] tracking-wide text-sm">Sign in to your account</p>
        </div>
        <Suspense fallback={<div className="glass-card rounded-2xl p-8 animate-pulse h-96" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
