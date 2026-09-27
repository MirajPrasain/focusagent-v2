import { colors, fontSans } from './src/theme/tokens.ts';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: fontSans,
      },
    },
  },
  plugins: [],
};
