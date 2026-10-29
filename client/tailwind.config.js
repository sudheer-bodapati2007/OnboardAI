/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        midnight: {
          50: '#f0f4ff',
          100: '#dde6ff',
          200: '#b9ccff',
          300: '#8aaaff',
          400: '#5580ff',
          500: '#2d5af0',
          600: '#1a3dd6',
          700: '#152fad',
          800: '#16298d',
          900: '#172772',
          950: '#111827',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

