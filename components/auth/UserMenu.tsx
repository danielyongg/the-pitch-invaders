'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'

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
        className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition"
      >
        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-black font-bold text-sm">
          {profile.username[0].toUpperCase()}
        </div>
        <span className="hidden sm:block">{profile.username}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-800 rounded-xl shadow-xl overflow-hidden z-50">
          <Link
            href={`/profile/${profile.id}`}
            className="block px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition"
            onClick={() => setOpen(false)}
          >
            My Profile
          </Link>
          <Link
            href="/leagues"
            className="block px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition"
            onClick={() => setOpen(false)}
          >
            My Leagues
          </Link>
          <div className="border-t border-gray-800" />
          <button
            onClick={signOut}
            className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-gray-800 transition"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
