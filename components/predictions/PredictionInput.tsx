'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  matchId: string
  userId: string
  existing?: { predicted_home: number | null; predicted_away: number | null } | null
  onSaved?: () => void
}

export default function PredictionInput({ matchId, userId, existing, onSaved }: Props) {
  const [home, setHome] = useState(existing?.predicted_home ?? 0)
  const [away, setAway] = useState(existing?.predicted_away ?? 0)
  const [savedHome, setSavedHome] = useState(existing?.predicted_home)
  const [savedAway, setSavedAway] = useState(existing?.predicted_away)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const isLocked = savedHome === home && savedAway === away

  async function save() {
    setSaving(true)
    setError(null)

    const payload = { user_id: userId, match_id: matchId, predicted_home: home, predicted_away: away }
    const { error: err } = await supabase.from('predictions').upsert(payload, { onConflict: 'user_id,match_id' })

    setSaving(false)
    if (err) {
      setError('Failed to save. The match may have already started.')
    } else {
      setSavedHome(home)
      setSavedAway(away)
      onSaved?.()
    }
  }

  function ScoreInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-8 h-8 rounded-lg bg-[var(--color-input)] hover:bg-[var(--color-border-strong)] text-[var(--color-text-primary)] font-bold flex items-center justify-center transition border border-[var(--color-border)]"
        >
          −
        </button>
        <div className="w-12 h-12 bg-[var(--color-surface)] border border-[var(--glass-20)] rounded-lg flex items-center justify-center">
          <span className="font-bold text-[var(--color-text-primary)] text-2xl">{value}</span>
        </div>
        <button
          type="button"
          onClick={() => onChange(Math.min(20, value + 1))}
          className="w-8 h-8 rounded-lg bg-[var(--color-input)] hover:bg-[var(--color-border-strong)] text-[var(--color-text-primary)] font-bold flex items-center justify-center transition border border-[var(--color-border)]"
        >
          +
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center justify-center gap-4">
        <ScoreInput value={home} onChange={setHome} />
        <span className="text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] italic">VS</span>
        <ScoreInput value={away} onChange={setAway} />
      </div>

      {error && <p className="text-xs text-[var(--color-live-text)] text-center font-[var(--font-jetbrains)]">{error}</p>}

      <button
        onClick={save}
        disabled={saving || isLocked}
        className={`w-full py-3 rounded-xl text-sm font-bold font-[var(--font-anybody)] [font-variation-settings:'wdth'_100] tracking-wide transition ${
          isLocked
            ? 'bg-[rgba(174,198,255,0.2)] text-[var(--color-accent-text)] border border-[rgba(174,198,255,0.4)]'
            : 'bg-[#aec6ff] hover:bg-[#c8d8ff] text-[#002e6a]'
        } disabled:opacity-50`}
      >
        {saving ? 'Saving...' : isLocked ? '✓ Locked In' : savedHome != null ? 'Update Prediction' : 'Lock In Prediction'}
      </button>
    </div>
  )
}
