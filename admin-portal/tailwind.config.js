/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cricket: '#0a5227', // The brand green for Local Legends
        surface: '#ffffff',
        surfaceHigh: '#f0f2f3',
      }
    },
  },
  plugins: [],
}
