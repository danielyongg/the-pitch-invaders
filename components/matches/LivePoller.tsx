'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ESPN (primary provider, checked first in sync-live) has no request quota,
// so poll much more aggressively while a match is actually live — the
// server's own cooldown (sync-live's COOLDOWN_MS) shortens to match this
// when it detects an active match, so this doesn't waste calls once the
// match ends. Idle interval matches the GitHub Actions cron backup (5 min),
// no point polling faster client-side than the backend will actually fetch.
const LIVE_POLL_MS = 20_000
const IDLE_POLL_MS = 5 * 60_000

export default function LivePoller({ hasLiveMatch = false }: { hasLiveMatch?: boolean }) {
  const router = useRouter()

  useEffect(() => {
    const poll = async () => {
      await fetch('/api/sync-live')
      router.refresh()
    }

    const interval = setInterval(poll, hasLiveMatch ? LIVE_POLL_MS : IDLE_POLL_MS)
    poll()

    return () => clearInterval(interval)
  }, [router, hasLiveMatch])

  // Push-based backstop: the interval above still has to wait out its own
  // tick, so a Realtime subscription refreshes the page the instant
  // sync-live (from *any* trigger — this poller, another visitor's poller,
  // or the GitHub Actions cron) actually writes a new score/status to
  // `matches`, instead of waiting for this client's own next poll.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('matches-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, () => router.refresh())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [router])

  return null
}
