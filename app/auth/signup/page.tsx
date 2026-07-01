'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: existing } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle()
    if (existing) { setError('Username is already taken, try another.'); setLoading(false); return }

    const { error: signupError } = await supabase.auth.signUp({
      email, password,
      options: { data: { username }, emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (signupError) { setError(signupError.message); setLoading(false) }
    else setDone(true)
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#10131a] px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">📧</div>
          <h2 className="font-[var(--font-anybody)] font-bold text-2xl text-[#e1e2ec] mb-3 [font-variation-settings:'wdth'_100]">Check your email!</h2>
          <p className="text-[#c3c6d3]">We sent a confirmation link to <span className="text-[#e1e2ec]">{email}</span>. Click it to activate your account.</p>
          <Link href="/auth/login" className="mt-6 inline-block text-[#aec6ff] hover:text-[#c8d8ff] font-[var(--font-jetbrains)] tracking-wide text-sm">
            Back to Sign In →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#10131a] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-[var(--font-anybody)] font-extrabold text-3xl text-[#aec6ff] tracking-tight [font-variation-settings:'wdth'_100]">The Pitch Invaders</h1>
          <p className="text-[#c3c6d3] mt-2 font-[var(--font-jetbrains)] tracking-wide text-sm">Create your account</p>
        </div>

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
            Sign up with Google
          </button>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.1)]" />
            <span className="text-[#6b7280] text-sm font-[var(--font-jetbrains)]">or</span>
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.1)]" />
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            {error && (
              <div className="bg-[rgba(197,0,5,0.1)] border border-[rgba(255,180,169,0.3)] text-[#ffb4a9] text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}
            {[
              { label: 'Username', type: 'text', value: username, onChange: (v: string) => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, '')), placeholder: 'your_username', min: 3, max: 20 },
              { label: 'Email', type: 'email', value: email, onChange: setEmail, placeholder: 'you@example.com' },
              { label: 'Password', type: 'password', value: password, onChange: setPassword, placeholder: '••••••••', min: 6 },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-sm font-[var(--font-jetbrains)] tracking-wide text-[#c3c6d3] mb-2">{f.label}</label>
                <input
                  type={f.type} value={f.value} onChange={e => f.onChange(e.target.value)} required
                  minLength={f.min} maxLength={f.max} placeholder={f.placeholder}
                  className="w-full bg-[#272a32] border border-[rgba(255,255,255,0.1)] text-[#e1e2ec] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#aec6ff] focus:border-transparent placeholder-[#6b7280]"
                />
              </div>
            ))}
            <button
              type="submit" disabled={loading}
              className="w-full bg-[#aec6ff] hover:bg-[#c8d8ff] disabled:bg-[rgba(174,198,255,0.5)] text-[#002e6a] font-bold font-[var(--font-anybody)] [font-variation-settings:'wdth'_100] py-3 px-4 rounded-xl transition text-lg"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-[#6b7280] text-sm mt-6 font-[var(--font-jetbrains)]">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-[#aec6ff] hover:text-[#c8d8ff]">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
