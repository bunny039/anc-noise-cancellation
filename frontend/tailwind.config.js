/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
        display: ['Outfit', 'Inter', 'sans-serif'],
      },
      colors: {
        /* Base Dark Palette */
        bg: {
          DEFAULT: '#030712',
          surface: '#070c18',
          card: '#0a1224',
          elevated: '#0e172e',
          glass: 'rgba(10, 18, 36, 0.75)',
        },
        border: {
          DEFAULT: 'rgba(56, 189, 248, 0.12)',
          bright: 'rgba(56, 189, 248, 0.3)',
          subtle: 'rgba(255, 255, 255, 0.07)',
          focus: '#00f0ff',
        },

        /* Electric Accents */
        cyan: {
          DEFAULT: '#00f0ff',
          400: '#38bdf8',
          500: '#06b6d4',
          600: '#0284c7',
          700: '#0369a1',
          900: '#0c4a6e',
          950: '#082f49',
        },
        ice: {
          DEFAULT: '#a5f3fc',
          dim: '#38bdf8',
          glow: 'rgba(0, 240, 255, 0.25)',
        },

        /* Signal & Noise */
        noisy: {
          DEFAULT: '#f59e0b',
          dim: '#d97706',
          dark: '#78350f',
          glow: 'rgba(245, 158, 11, 0.25)',
        },
        enhanced: {
          DEFAULT: '#00f0ff',
          dim: '#06b6d4',
          glow: 'rgba(0, 240, 255, 0.3)',
        },

        /* Status colors */
        status: {
          pass: '#10b981',
          warn: '#f59e0b',
          fail: '#ef4444',
          processing: '#00f0ff',
        },

        /* Text tiers */
        tx: {
          1: '#f8fafc',
          2: '#cbd5e1',
          3: '#94a3b8',
          4: '#64748b',
          muted: '#475569',
        },
      },
      backgroundImage: {
        'grad-brand': 'linear-gradient(135deg, #00f0ff 0%, #3b82f6 50%, #8b5cf6 100%)',
        'grad-cyan-blue': 'linear-gradient(135deg, #00f0ff 0%, #0284c7 100%)',
        'grad-noisy': 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
        'grad-enhanced': 'linear-gradient(135deg, #00f0ff 0%, #10b981 100%)',
        'grad-dark': 'linear-gradient(180deg, #070c18 0%, #030712 100%)',
        'glow-cyan': 'radial-gradient(circle at center, rgba(0, 240, 255, 0.15) 0%, transparent 70%)',
        'glow-violet': 'radial-gradient(circle at center, rgba(139, 92, 246, 0.12) 0%, transparent 70%)',
        'tech-grid': "radial-gradient(circle, rgba(56, 189, 248, 0.08) 1px, transparent 1px)",
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
        'glass-cyan': '0 8px 32px 0 rgba(0, 240, 255, 0.08), inset 0 0 0 1px rgba(0, 240, 255, 0.15)',
        'glow-cyan': '0 0 25px rgba(0, 240, 255, 0.35)',
        'glow-cyan-sm': '0 0 12px rgba(0, 240, 255, 0.25)',
        'glow-emerald': '0 0 25px rgba(16, 185, 129, 0.35)',
        'glow-amber': '0 0 25px rgba(245, 158, 11, 0.35)',
        'hud-card': '0 10px 40px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease forwards',
        'slide-up': 'slideUp 0.4s ease forwards',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'radar-sweep': 'radarSweep 4s linear infinite',
        'signal-flow': 'signalFlow 2s ease-in-out infinite',
        'blink-fast': 'blink 0.8s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        radarSweep: { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
        signalFlow: {
          '0%, 100%': { transform: 'translateX(-100%)', opacity: '0.2' },
          '50%': { transform: 'translateX(100%)', opacity: '0.8' },
        },
        blink: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.2' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      backdropBlur: { xs: '2px', sm: '4px', md: '12px', lg: '24px', xl: '48px' },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};

