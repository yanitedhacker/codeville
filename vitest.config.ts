import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@codeville/core': r('./packages/core/src/index.ts'),
      '@codeville/atlas-ui': r('./packages/atlas-ui/src/index.ts'),
    },
  },
  test: {
    globals: true,
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx', 'apps/**/*.test.ts'],
  },
})
