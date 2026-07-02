// Runs before paint to avoid a flash of the wrong theme. Reads localStorage
// directly (no React state) since this must execute synchronously in <head>.
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
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
