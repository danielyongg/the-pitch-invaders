'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function CreateLeaguePage() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: league, error: err } = await supabase
      .from('private_leagues')
      .insert({ name: name.trim(), created_by: user.id })
      .select().single()

    if (err || !league) { setError('Failed to create league. Try again.'); setLoading(false); return }

    await supabase.from('private_league_members').insert({ league_id: league.id, user_id: user.id })
    router.push(`/leagues/${league.id}`)
  }

  return (
    <div className="max-w-md mx-auto px-8 py-16">
      <h1 className="font-[var(--font-anybody)] font-bold text-[40px] text-[#e1e2ec] mb-2 [font-variation-settings:'wdth'_100]">Create a League</h1>
      <p className="text-[#c3c6d3] mb-8">Create a private league and invite your friends</p>

      <div className="glass-card rounded-2xl p-6">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && (
            <div className="bg-[rgba(197,0,5,0.1)] border border-[rgba(255,180,169,0.3)] text-[#ffb4a9] text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-[var(--font-jetbrains)] tracking-wide text-[#c3c6d3] mb-2">League Name</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)} required maxLength={50}
              placeholder="e.g. Friday Night Predictors"
              className="w-full bg-[#272a32] border border-[rgba(255,255,255,0.1)] text-[#e1e2ec] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#aec6ff] focus:border-transparent placeholder-[#6b7280]"
            />
          </div>
          <button
            type="submit" disabled={loading || !name.trim()}
            className="w-full bg-[#aec6ff] hover:bg-[#c8d8ff] disabled:bg-[rgba(174,198,255,0.5)] text-[#002e6a] font-bold font-[var(--font-anybody)] [font-variation-settings:'wdth'_100] py-3 px-4 rounded-xl transition text-lg"
          >
            {loading ? 'Creating...' : 'Create League'}
          </button>
        </form>
      </div>
    </div>
  )
}
