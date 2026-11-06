/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        rpg: {
          bg: '#0c0e14',
          panel: '#151922',
          surface: '#1c2230',
          border: '#2a3447',
          gold: '#eab308',
          goldHover: '#facc15',
          goldMuted: 'rgba(234, 179, 8, 0.15)',
          amber: '#f59e0b',
          crimson: '#e11d48',
          accent: '#38bdf8',
          emerald: '#10b981',
          purple: '#a855f7'
        }
      },
      boxShadow: {
        'glow-gold': '0 0 20px -3px rgba(234, 179, 8, 0.35)',
        'glow-crimson': '0 0 20px -3px rgba(225, 29, 72, 0.4)',
        'glow-blue': '0 0 20px -3px rgba(56, 189, 248, 0.35)',
      }
    },
  },
  plugins: [],
}
