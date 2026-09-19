/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      colors: {
        defence: {
          50:  '#f0f4ff',
          100: '#e0e9ff',
          200: '#c0d3ff',
          300: '#93b2ff',
          400: '#6087f8',
          500: '#3b5ff0',
          600: '#2641e3',
          700: '#1d2fc9',
          800: '#1d2ba3',
          900: '#1e2b7e',
          950: '#161c52',
        },
        panel: {
          bg:       '#f2f4f8',
          surface:  '#ffffff',
          border:   '#d4d9e2',
          'border-dark': '#b8bfcc',
        },
        status: {
          ready:      '#16a34a',
          recording:  '#dc2626',
          processing: '#d97706',
          complete:   '#059669',
          error:      '#dc2626',
          waiting:    '#9ca3af',
        },
        chart: {
          noisy:    '#3b82f6',
          enhanced: '#10b981',
          grid:     '#e5e7eb',
          axis:     '#6b7280',
        },
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        xs:   ['0.75rem',  { lineHeight: '1rem' }],
      },
      spacing: {
        px: '1px',
        0.5: '2px',
      },
      boxShadow: {
        panel: '0 1px 3px 0 rgba(0,0,0,0.07), 0 1px 2px -1px rgba(0,0,0,0.05)',
        'panel-sm': '0 1px 2px 0 rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
