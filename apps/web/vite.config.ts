import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/**
 * Mounts api/github.ts as dev middleware. The same module is the default export
 * a Vercel function expects, so it deploys without a second implementation.
 */
function githubRoute(): Plugin {
  return {
    name: 'codeville-github-route',
    configureServer(server) {
      server.middlewares.use('/api/github', (req, res, next) => {
        server
          .ssrLoadModule('/api/github.ts')
          .then((mod) => (mod.default as (rq: unknown, rs: unknown) => Promise<void>)(req, res))
          .catch(next)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), githubRoute()],
  resolve: {
    alias: {
      '@codeville/core/explain/heuristic': r('../../packages/core/src/explain/heuristic.ts'),
      '@codeville/core': r('../../packages/core/src/index.ts'),
      '@codeville/atlas-ui': r('../../packages/atlas-ui/src/index.ts'),
    },
  },
  server: { port: 5273 },
  build: { outDir: 'dist', sourcemap: false },
})
