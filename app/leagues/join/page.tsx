'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'

function JoinForm() {
  const searchParams = useSearchParams()
  const [code, setCode] = useState(searchParams.get('code') ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: league } = await supabase.from('private_leagues').select('id, name').eq('invite_code', code.trim().toUpperCase()).single()
    if (!league) { setError('Code not found. Make sure the code is correct.'); setLoading(false); return }

    const { error: joinErr } = await supabase.from('private_league_members').insert({ league_id: league.id, user_id: user.id })
    if (joinErr) {
      if (joinErr.code === '23505') { router.push(`/leagues/${league.id}`); return }
      setError('Failed to join. Try again.')
      setLoading(false)
      return
    }
    router.push(`/leagues/${league.id}`)
  }

  return (
    <form onSubmit={handleJoin} className="space-y-4">
      {error && (
        <div className="bg-[rgba(197,0,5,0.1)] border border-[rgba(255,180,169,0.3)] text-[#ffb4a9] text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}
      <div>
        <label className="block text-sm font-[var(--font-jetbrains)] tracking-wide text-[var(--color-text-secondary)] mb-2">Invite Code</label>
        <input
          type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())} required maxLength={8}
          placeholder="ABCD1234"
          className="w-full bg-[var(--color-input)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-xl px-4 py-3 font-mono text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-[#aec6ff] focus:border-transparent placeholder-[var(--color-text-muted)]"
        />
      </div>
      <button
        type="submit" disabled={loading || code.trim().length < 6}
        className="w-full bg-[#aec6ff] hover:bg-[#c8d8ff] disabled:bg-[rgba(174,198,255,0.5)] text-[#002e6a] font-bold font-[var(--font-anybody)] [font-variation-settings:'wdth'_100] py-3 px-4 rounded-xl transition text-lg"
      >
        {loading ? 'Joining...' : 'Join League'}
      </button>
    </form>
  )
}

export default function JoinLeaguePage() {
  return (
    <div className="max-w-md mx-auto px-8 py-16">
      <h1 className="font-[var(--font-anybody)] font-bold text-[40px] text-[var(--color-text-primary)] mb-2 [font-variation-settings:'wdth'_100]">Join a League</h1>
      <p className="text-[var(--color-text-secondary)] mb-8">Enter the invite code shared by your friend</p>
      <div className="glass-card rounded-2xl p-6">
        <Suspense>
          <JoinForm />
        </Suspense>
      </div>
    </div>
  )
}
