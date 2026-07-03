import Script from 'next/script'

// Runs before paint to avoid a flash of the wrong theme. Reads localStorage
// directly (no React state) since this must execute synchronously, before
// hydration. Uses next/script's beforeInteractive strategy — a raw
// <script> tag placed in a custom root-layout <head> isn't guaranteed to
// run at a consistent point across all rendering paths, which was
// intermittently leaving data-theme unset (page stuck on the default dark
// theme even though localStorage still had 'light' saved).
const script = `
(function () {
  try {
    var stored = localStorage.getItem('theme') || 'system';
    var theme = stored === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : stored;
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`

export default function ThemeScript() {
  return <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: script }} />
}
