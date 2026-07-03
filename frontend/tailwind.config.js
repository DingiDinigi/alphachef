export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a08',
        bg2: '#0f0e0b',
        bg3: '#141310',
        card: '#1a1608',
        gold: '#c9a227',
        gold2: '#e0b93a',
        cream: '#f0ede6',
        green: '#4ade80',
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
