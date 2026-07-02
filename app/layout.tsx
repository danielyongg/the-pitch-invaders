import type { Metadata } from 'next'
import { Anybody, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/ui/Navbar'
import ThemeScript from '@/components/ui/ThemeScript'

const anybody = Anybody({
  subsets: ['latin'],
  variable: '--font-anybody',
  axes: ['wdth'],
})

const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  weight: ['400', '500', '600', '700', '800'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'The Pitch Invaders',
  description: 'Predict European football scores and compete with friends in private leagues',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anybody.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable} h-full`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full antialiased flex flex-col" style={{ backgroundColor: 'var(--color-navy)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-hanken), system-ui, sans-serif' }}>
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-[var(--color-border)] bg-[var(--color-footer)] py-6 text-center text-sm text-[var(--color-text-secondary)] font-[var(--font-jetbrains)] tracking-wide">
          <div className="flex items-center justify-center gap-4 mb-3">
            <a href="https://x.com/PitchInvadersID" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://www.instagram.com/pitchinvadersid?igsh=MTc0dTBvOGt2Y3hhNg%3D%3D&utm_source=qr" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zM12 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
            </a>
            <a href="https://www.threads.com/@pitchinvadersid?igshid=NTc4MTIwNjQ2YQ==" target="_blank" rel="noopener noreferrer" aria-label="Threads" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.075-3.87-3.816-5.858-8.148-5.916-2.874.02-5.049.9-6.466 2.615C4.564 6.53 3.897 8.94 3.87 12.001c.027 3.061.694 5.472 2.006 7.169 1.417 1.715 3.592 2.596 6.466 2.616 2.586-.019 4.28-.66 5.66-2.146 1.578-1.7 1.55-3.789 1.048-5.075-.297-.756-.837-1.386-1.573-1.845-.183 1.32-.612 2.373-1.28 3.14-.888 1.021-2.147 1.583-3.74 1.669-1.212.065-2.375-.222-3.275-.808-1.064-.692-1.69-1.762-1.762-3.013-.07-1.221.4-2.345 1.323-3.169.883-.788 2.127-1.246 3.601-1.325a10.9 10.9 0 0 1 3.264.257c-.133-.803-.401-1.443-.8-1.907-.545-.635-1.388-.96-2.505-.968h-.03c-.9.007-2.113.246-2.889 1.416l-1.789-1.222c1.04-1.559 2.719-2.416 4.71-2.416h.038c3.379.023 5.394 2.14 5.594 5.856.114.049.226.1.336.153 1.523.727 2.638 1.842 3.222 3.226.812 1.917.885 5.043-1.622 7.663-1.876 1.964-4.14 2.828-7.328 2.851zm.907-9.925c-.117-.007-.235-.014-.353-.014-1.31.04-2.11.622-2.066 1.481.046.899 1.017 1.317 1.951 1.264 1.176-.062 2.12-.522 2.309-2.393a8.8 8.8 0 0 0-1.841-.338z"/></svg>
            </a>
            <a href="https://www.tiktok.com/@pitchinvadersid?_r=1&_t=ZS-97fMfGYoUia" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.82s.51.5 0 0A4.278 4.278 0 0 1 15.54 3h-3.09v12.4a2.592 2.592 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z"/></svg>
            </a>
          </div>
          The Pitch Invaders © {new Date().getFullYear()}
        </footer>
      </body>
    </html>
  )
}
