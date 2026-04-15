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
        neutral: { ink: '#1F2937', mist: '#E5E7EB', canvas: '#FFFFFF' },
        app: '#F9FAFB'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      }
    }
  }
} satisfies Config