'use client'

import { useEffect, useRef, useState } from 'react'

type ThemeChoice = 'light' | 'dark' | 'system'

function applyTheme(choice: ThemeChoice) {
  const resolved = choice === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : choice
  document.documentElement.setAttribute('data-theme', resolved)
}

const OPTIONS: { value: ThemeChoice; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'system', label: 'System', icon: '💻' },
]

export default function ThemeToggle() {
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<ThemeChoice>('system')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stored = (localStorage.getItem('theme') as ThemeChoice) || 'system'
    setChoice(stored)
    // Backstop: re-apply in case the beforeInteractive theme-init script
    // didn't run for this load (data-theme would otherwise be stuck at
    // whatever the CSS default is, even though localStorage is correct).
    applyTheme(stored)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function choose(value: ThemeChoice) {
    setChoice(value)
    localStorage.setItem('theme', value)
    applyTheme(value)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Theme settings"
        className="flex items-center justify-center w-9 h-9 rounded-full transition hover:brightness-125"
        style={{ background: 'var(--glass-08)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
      >
        {OPTIONS.find(o => o.value === choice)?.icon}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-40 rounded-xl shadow-xl overflow-hidden z-50"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          {OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => choose(o.value)}
              className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm transition hover:brightness-125"
              style={{
                color: choice === o.value ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                fontFamily: 'var(--font-jetbrains), monospace',
              }}
            >
              <span>{o.icon}</span> {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
