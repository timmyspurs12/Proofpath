import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        current: '#102F36',
        teal: '#1B736F',
        lime: '#D8EE6A',
        mist: '#F5F4EE',
        salt: '#FFFFFF',
        slate: '#52666A',
        cloud: '#DCE5E0',
        coral: '#DE745E',
      },
      fontFamily: {
        heading: ['Sora', 'sans-serif'],
        sans: ['DM Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      boxShadow: {
        crisp: '0 1px 0 rgba(16, 47, 54, 0.06), 0 12px 32px rgba(16, 47, 54, 0.05)',
        lift: '0 16px 42px rgba(16, 47, 54, 0.12)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'line-drift': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-8px)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.45' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 420ms cubic-bezier(.2,.7,.2,1) both',
        'line-drift': 'line-drift 5s ease-in-out infinite alternate',
        'pulse-soft': 'pulse-soft 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
