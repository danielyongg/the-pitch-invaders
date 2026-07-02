'use client'

import { useState, useEffect } from 'react'

interface Props {
  kickoffTime: string
  onKickoff?: () => void
}

export default function KickoffCountdown({ kickoffTime, onKickoff }: Props) {
  const [diff, setDiff] = useState(() => new Date(kickoffTime).getTime() - Date.now())

  useEffect(() => {
    if (diff <= 0) {
      onKickoff?.()
      return
    }
    const interval = setInterval(() => {
      const remaining = new Date(kickoffTime).getTime() - Date.now()
      setDiff(remaining)
      if (remaining <= 0) {
        clearInterval(interval)
        onKickoff?.()
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [kickoffTime, onKickoff, diff])

  if (diff <= 0) return <span className="text-xs text-orange-400 font-medium">Starting now</span>

  const totalSeconds = Math.floor(diff / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) {
    return <span className="text-xs text-[var(--color-text-secondary)]">in {days}d {hours}h</span>
  }

  if (hours > 0) {
    return <span className="text-xs text-[var(--color-text-secondary)]">in {hours}h {minutes}m</span>
  }

  return (
    <span className="text-xs text-green-400 font-mono">
      {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
    </span>
  )
}
