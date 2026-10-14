/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep navy — primary navigation, headings and structure.
        navy: {
          50: '#f3f6fb',
          100: '#e4eaf4',
          200: '#c6d3e7',
          300: '#9db2d2',
          400: '#6d89b4',
          500: '#4a6896',
          600: '#374f79',
          700: '#2c4063',
          800: '#22314b',
          900: '#172438',
          950: '#0d1727',
        },
        // Single restrained accent for primary actions and focus.
        accent: {
          50: '#eef4ff',
          100: '#dbe6ff',
          200: '#bcd0ff',
          300: '#8fb0ff',
          400: '#5b86ff',
          500: '#3563f5',
          600: '#2447db',
          700: '#1d38b0',
          800: '#1d3390',
          900: '#1d2f73',
        },
        // Neutral ink scale for text, borders and surfaces.
        ink: {
          50: '#f7f8fa',
          100: '#eef0f4',
          200: '#dfe3ea',
          300: '#c8ced9',
          400: '#98a2b3',
          500: '#667085',
          600: '#4b5565',
          700: '#384150',
          800: '#252c38',
          900: '#161a22',
        },
        // Semantic status colors (used with text/icon, never color alone).
        status: {
          low: '#0f9d58',
          lowBg: '#e7f6ee',
          medium: '#b7791f',
          mediumBg: '#fdf3e2',
          high: '#d97706',
          highBg: '#fdeee0',
          critical: '#c0392b',
          criticalBg: '#fbeceb',
          info: '#3563f5',
          infoBg: '#eef4ff',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        md: '0.5rem',
        lg: '0.625rem',
        xl: '0.875rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06)',
        panel:
          '0 1px 3px 0 rgb(16 24 40 / 0.06), 0 4px 12px -2px rgb(16 24 40 / 0.08)',
        focus: '0 0 0 3px rgb(53 99 245 / 0.30)',
      },
    },
  },
  plugins: [],
}
