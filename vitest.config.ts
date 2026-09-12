import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // Les tests d'intégration partagent une base : on évite les courses.
    fileParallelism: false,
    coverage: { include: ['src/domain/**'], thresholds: { lines: 95, functions: 95 } },
  },
})
