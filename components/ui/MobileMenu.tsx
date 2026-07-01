'use client'

import { useState } from 'react'
import Link from 'next/link'

interface NavItem {
  href: string
  label: string
}

export default function MobileMenu({ items, totalPoints, userId }: { items: NavItem[]; totalPoints?: number; userId?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Toggle menu"
        className="flex flex-col gap-1.5 p-2 -mr-2"
      >
        <span className={`block w-6 h-0.5 bg-[#e1e2ec] transition-transform ${open ? 'translate-y-2 rotate-45' : ''}`} />
        <span className={`block w-6 h-0.5 bg-[#e1e2ec] transition-opacity ${open ? 'opacity-0' : ''}`} />
        <span className={`block w-6 h-0.5 bg-[#e1e2ec] transition-transform ${open ? '-translate-y-2 -rotate-45' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-20 border-b px-8 py-4 flex flex-col gap-4"
          style={{ backgroundColor: '#10131a', borderColor: 'rgba(255,255,255,0.1)' }}
        >
          {items.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="text-sm transition hover:opacity-80"
              style={{ fontFamily: 'var(--font-jetbrains), monospace', color: '#c3c6d3', letterSpacing: '0.7px' }}
            >
              {item.label}
            </Link>
          ))}
          {userId && totalPoints !== undefined && (
            <Link
              href={`/profile/${userId}`}
              onClick={() => setOpen(false)}
              className="text-sm transition hover:opacity-80"
              style={{ fontFamily: 'var(--font-jetbrains), monospace', color: '#aec6ff', letterSpacing: '0.7px' }}
            >
              {totalPoints.toLocaleString('en-US')} pts
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
