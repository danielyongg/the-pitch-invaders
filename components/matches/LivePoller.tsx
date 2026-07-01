'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LivePoller() {
  const router = useRouter()

  useEffect(() => {
    const poll = async () => {
      await fetch('/api/sync-live')
      router.refresh()
    }

    // Poll every 3 minutes (server also enforces its own cooldown
    // to protect the RapidAPI 500 req/month quota)
    const interval = setInterval(poll, 3 * 60_000)

    // Also poll immediately on mount
    poll()

    return () => clearInterval(interval)
  }, [router])

  return null
}
