import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Paleta "Naturalna Harmonia" z PRD
        primary: {
          DEFAULT: '#4A7C59', // Głęboka, stonowana zieleń
          light: '#5A9269',
          dark: '#3A6C49',
        },
        secondary: {
          DEFAULT: '#E8B4A8', // Miękki, ciepły brzoskwiniowy
          light: '#F0C4B8',
          dark: '#D8A498',
        },
        accent: {
          DEFAULT: '#F4A460', // Złoty pomarańczowy
          light: '#F6B470',
          dark: '#E49450',
        },
        neutral: {
          dark: '#2C3E3A', // Ciemna zieleń prawie czarna (tekst, nagłówki)
          light: '#F9F6F3', // Ciepła biel (tło, przestrzeń)
        },
      },
      fontFamily: {
        // Typografia z PRD
        heading: ['Montserrat', 'sans-serif'], // Nagłówki: 600, 700
        body: ['Open Sans', 'sans-serif'], // Tekst: 400, 600
      },
      spacing: {
        // 8px grid system
        '18': '4.5rem', // 72px
        '112': '28rem', // 448px
      },
      borderRadius: {
        // Zaokrąglone rogi z PRD
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
      },
      boxShadow: {
        // Miękkie, subtle shadows
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'soft-lg': '0 10px 40px -10px rgba(0, 0, 0, 0.1)',
      },
    },
  },
  plugins: [
    typography,
  ],
}
