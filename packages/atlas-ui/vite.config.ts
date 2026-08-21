import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/** Emits the single-file export payload into the web app's public dir. */
export default defineConfig({
  plugins: [react()],
  // The export bundle swaps React for Preact: same components, ~550KB smaller file.
  resolve: {
    alias: {
      '@codeville/core/explain/heuristic': r('../core/src/explain/heuristic.ts'),
      '@codeville/core': r('../core/src/index.ts'),
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react-dom/client': 'preact/compat/client',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  build: {
    outDir: r('../../apps/web/public/standalone'),
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: r('./src/standalone.tsx'),
      formats: ['iife'],
      name: 'CodevilleAtlas',
      fileName: () => 'codeville.js',
    },
    rollupOptions: { output: { assetFileNames: 'codeville.[ext]' } },
  },
})
