'use client'

import { useState } from 'react'

export default function InviteCodeDisplay({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2">
      <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2">
        <span className="font-mono text-sm font-bold text-white tracking-widest">{code}</span>
      </div>
      <button
        onClick={copy}
        className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-xl transition"
      >
        {copied ? '✓ Disalin' : 'Salin'}
      </button>
    </div>
  )
}
