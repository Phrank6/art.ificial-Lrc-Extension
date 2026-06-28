/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Figma design tokens
        'ds-bg':     '#050608',
        'ds-panel':  '#0A0D12',
        'ds-card':   '#121822',
        'ds-line':   '#263040',
        'ds-ink':    '#F7F7F2',
        'ds-muted':  '#8D93A1',
        'ds-violet': '#8B5CF6',
        'ds-violet-dark': '#7C3AED',
      },
      fontFamily: {
        inter:    ['Inter', 'sans-serif'],
        poppins:  ['Poppins', 'sans-serif'],
        opensans: ['"Open Sans"', 'sans-serif'],
      },
      animation: {
        'pulse-glow':  'pulseGlow 1.5s ease-in-out infinite',
        'float':       'float 2s ease-in-out infinite',
        'success-pop': 'successPop 0.4s ease-out forwards',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 6px 2px rgba(251,191,36,0.6)', transform: 'scale(1)' },
          '50%':      { boxShadow: '0 0 14px 6px rgba(251,191,36,0.9)', transform: 'scale(1.15)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
        successPop: {
          '0%':   { transform: 'scale(0.8)', opacity: '0' },
          '60%':  { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)',   opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
