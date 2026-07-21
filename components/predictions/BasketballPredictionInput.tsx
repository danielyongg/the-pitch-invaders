'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type WinnerSide = 'home' | 'away'
type MarginBucket = 'more' | 'exact' | 'less'

interface Props {
  matchId: string
  userId: string
  homeTeamName: string
  awayTeamName: string
  oddsSpread: number | null
  existing?: { predicted_winner_side: string | null; predicted_margin_bucket: string | null } | null
  onSaved?: () => void
}

export default function BasketballPredictionInput({ matchId, userId, homeTeamName, awayTeamName, oddsSpread, existing, onSaved }: Props) {
  const [winnerSide, setWinnerSide] = useState<WinnerSide | null>((existing?.predicted_winner_side as WinnerSide) ?? null)
  const [marginBucket, setMarginBucket] = useState<MarginBucket | null>((existing?.predicted_margin_bucket as MarginBucket) ?? null)
  const [savedWinnerSide, setSavedWinnerSide] = useState(existing?.predicted_winner_side ?? null)
  const [savedMarginBucket, setSavedMarginBucket] = useState(existing?.predicted_margin_bucket ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const threshold = Math.round(Math.abs(oddsSpread ?? 5))
  const isLocked = savedWinnerSide === winnerSide && savedMarginBucket === marginBucket
  const canSave = winnerSide != null && marginBucket != null

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError(null)

    const payload = {
      user_id: userId,
      match_id: matchId,
      predicted_winner_side: winnerSide,
      predicted_margin_bucket: marginBucket,
    }
    const { error: err } = await supabase.from('predictions').upsert(payload, { onConflict: 'user_id,match_id' })

    setSaving(false)
    if (err) {
      setError('Failed to save. The match may have already started.')
    } else {
      setSavedWinnerSide(winnerSide)
      setSavedMarginBucket(marginBucket)
      onSaved?.()
    }
  }

  function Toggle<T extends string>({ value, options, onChange }: { value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
    return (
      <div className="flex gap-2">
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${
              value === o.value
                ? 'bg-[#aec6ff] text-[#002e6a] border-[#aec6ff]'
                : 'bg-[var(--color-input)] text-[var(--color-text-primary)] border-[var(--color-border)] hover:bg-[var(--color-border-strong)]'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3 py-2">
      <div>
        <p className="text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide mb-1">Who wins?</p>
        <Toggle
          value={winnerSide}
          options={[{ value: 'home', label: homeTeamName }, { value: 'away', label: awayTeamName }]}
          onChange={setWinnerSide}
        />
      </div>

      <div>
        <p className="text-xs text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide mb-1">Margin vs. {threshold}-point line</p>
        <Toggle
          value={marginBucket}
          options={[
            { value: 'more', label: `More than ${threshold}` },
            { value: 'exact', label: `Exactly ${threshold}` },
            { value: 'less', label: `Less than ${threshold}` },
          ]}
          onChange={setMarginBucket}
        />
      </div>

      {error && <p className="text-xs text-[var(--color-live-text)] text-center font-[var(--font-jetbrains)]">{error}</p>}

      <button
        onClick={save}
        disabled={saving || isLocked || !canSave}
        className={`w-full py-3 rounded-xl text-sm font-bold font-[var(--font-anybody)] [font-variation-settings:'wdth'_100] tracking-wide transition ${
          isLocked
            ? 'bg-[rgba(174,198,255,0.2)] text-[var(--color-accent-text)] border border-[rgba(174,198,255,0.4)]'
            : 'bg-[#aec6ff] hover:bg-[#c8d8ff] text-[#002e6a]'
        } disabled:opacity-50`}
      >
        {saving ? 'Saving...' : isLocked ? '✓ Locked In' : savedWinnerSide != null ? 'Update Prediction' : 'Lock In Prediction'}
      </button>
    </div>
  )
}
