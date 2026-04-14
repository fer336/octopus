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
        primary: {
          50: '#f5f2fa',
          100: '#ece6f6',
          200: '#d9caeb',
          300: '#c3abdf',
          400: '#ad8ed2',
          500: '#9d84bf',
          600: '#7c5ca8',
          700: '#5c3a8c',
          800: '#4b2f72',
          900: '#3a2459',
          950: '#25163a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
