/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        panel: 'var(--panel)',
        ink: 'var(--ink)',
        mute: 'var(--mute)',
        faint: 'var(--faint)',
        line: 'var(--line)',
        hair: 'var(--hair)',
        accent: 'var(--accent)',
        hover: 'var(--hover)',
      },
      fontFamily: {
        ui: ['"tl-instrumentsans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"tl-jetbrains"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        mark: ['"tl-archivo"', 'ui-sans-serif', 'sans-serif'],
      },
      fontSize: { '2xs': ['10px', '12px'], xs: ['11px', '14px'] },
    },
  },
  plugins: [],
}
