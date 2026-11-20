import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests for pure frontend rules (src/**/*.spec.ts). No browser: the rules files import no DOM.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
})
