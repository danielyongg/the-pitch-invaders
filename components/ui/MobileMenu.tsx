'use client'

import { useState } from 'react'
import Link from 'next/link'
import ThemeToggle from '@/components/ui/ThemeToggle'

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
        <span className={`block w-6 h-0.5 bg-[var(--color-text-primary)] transition-transform ${open ? 'translate-y-2 rotate-45' : ''}`} />
        <span className={`block w-6 h-0.5 bg-[var(--color-text-primary)] transition-opacity ${open ? 'opacity-0' : ''}`} />
        <span className={`block w-6 h-0.5 bg-[var(--color-text-primary)] transition-transform ${open ? '-translate-y-2 -rotate-45' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-20 border-b px-8 py-4 flex flex-col gap-4"
          style={{ backgroundColor: 'var(--color-navy)', borderColor: 'var(--color-border)' }}
        >
          {items.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="text-sm transition hover:opacity-80"
              style={{ fontFamily: 'var(--font-jetbrains), monospace', color: 'var(--color-text-secondary)', letterSpacing: '0.7px' }}
            >
              {item.label}
            </Link>
          ))}
          {userId && totalPoints !== undefined && (
            <Link
              href={`/profile/${userId}`}
              onClick={() => setOpen(false)}
              className="text-sm transition hover:opacity-80"
              style={{ fontFamily: 'var(--font-jetbrains), monospace', color: 'var(--color-accent-text)', letterSpacing: '0.7px' }}
            >
              {totalPoints.toLocaleString('en-US')} pts
            </Link>
          )}
          <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <span className="text-xs uppercase tracking-widest mb-2 block" style={{ fontFamily: 'var(--font-jetbrains), monospace', color: 'var(--color-text-muted)' }}>
              Appearance
            </span>
            <ThemeToggle />
          </div>
        </div>
      )}
    </div>
  )
}
