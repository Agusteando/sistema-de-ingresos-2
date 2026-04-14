import type { Config } from 'tailwindcss'

export default {
  content: [
    "./components/**/*.{js,vue,ts}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./plugins/**/*.{js,ts}",
    "./app.vue",
    "./error.vue"
  ],
  theme: {
    extend: {
      colors: {
        brand: { leaf: '#8EC153', campus: '#4E844E', teal: '#3F8468' },
        accent: { coral: '#E83F4B', gold: '#FCBF2D', sky: '#67A8D8' },
        neutral: { ink: '#232C25', mist: '#D0D3C7', canvas: '#FFFFFF' },
        app: '#F6F7F5'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      }
    }
  }
} satisfies Config