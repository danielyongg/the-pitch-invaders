'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'
import Avatar from '@/components/ui/Avatar'

export default function UserMenu({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition"
      >
        <Avatar url={profile.avatar_url} username={profile.username} size={32} />
        <span className="hidden sm:block">{profile.username}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl overflow-hidden z-50">
          <Link
            href={`/profile/${profile.id}`}
            className="block px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--glass-08)] hover:text-[var(--color-text-primary)] transition"
            onClick={() => setOpen(false)}
          >
            My Profile
          </Link>
          <Link
            href="/leagues"
            className="block px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--glass-08)] hover:text-[var(--color-text-primary)] transition"
            onClick={() => setOpen(false)}
          >
            My Leagues
          </Link>
          <div className="border-t border-[var(--color-border)]" />
          <button
            onClick={signOut}
            className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-[var(--glass-08)] transition"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
