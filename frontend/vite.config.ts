import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: process.env.VITEST
      ? {
          'lucide-react': path.resolve(dirname, 'src/test-stubs/lucide-react.ts'),
        }
      : undefined,
  },

  build: {
    rollupOptions: {
      output: {}
    }
  },

  test: {
    // Use jsdom so DOM APIs (document, window, etc.) are available in unit tests
    environment: 'jsdom',
    // Only pick up Vitest unit tests — exclude Playwright E2E specs entirely
    include: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
    // Make @testing-library/jest-dom matchers available globally
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
})
