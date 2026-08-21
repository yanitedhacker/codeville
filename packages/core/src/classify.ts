import type { FileRecord } from './types.js'

export interface Role {
  label: string
  contributes: string
}

/** Ordered — first match wins, so put the specific patterns above the broad ones. */
const RULES: { test: RegExp; role: string; contributes?: string }[] = [
  // Next.js App Router
  { test: /^app\/.*\/route\.(ts|js)$/, role: 'api endpoint', contributes: 'http surface' },
  { test: /^app\/.*page\.(tsx|jsx|ts|js)$/, role: 'screen / route', contributes: 'screen' },
  { test: /^app\/.*layout\.(tsx|jsx)$/, role: 'layout shell', contributes: 'shell' },
  { test: /^app\/.*(error|not-found|loading)\.(tsx|jsx)$/, role: 'route boundary', contributes: 'fallback ui' },
  { test: /^(src\/)?middleware\.(ts|js)$/, role: 'request gate', contributes: 'edge gate' },
  { test: /^(src\/)?instrumentation\.(ts|js)$/, role: 'boot hook', contributes: 'process init' },
  { test: /^(src\/)?pages\/api\//, role: 'api endpoint', contributes: 'http surface' },
  { test: /^(src\/)?pages\//, role: 'screen / route', contributes: 'screen' },

  // Python / Go / Rust entries
  { test: /^(app|server|main|__main__|manage|wsgi|asgi)\.py$/, role: 'entry point', contributes: 'process entry' },
  { test: /(^|\/)(routes|handlers|views|endpoints)\//, role: 'route surface', contributes: 'http surface' },
  { test: /(^|\/)(main|cmd)\.(go|rs)$/, role: 'entry point', contributes: 'process entry' },

  // Tests — above layer folders so src/lib/db.test.ts is verification, not service logic.
  { test: /^(tests?|spec|__tests__|e2e)\//, role: 'test', contributes: 'verification' },
  { test: /\.(test|spec)\.[tj]sx?$/, role: 'test', contributes: 'verification' },

  // Layers
  { test: /^(src\/)?hooks?\//, role: 'react hook', contributes: 'client state' },
  { test: /^(src\/)?components?\//, role: 'ui component', contributes: 'interface' },
  { test: /^(src\/)?(lib|services?|core|domain|server)\//, role: 'service logic', contributes: 'business logic' },
  { test: /^(src\/)?(utils?|helpers?|shared|common)\//, role: 'utility', contributes: 'support' },
  { test: /^(src\/)?(models?|schemas?|entities|types?)\//, role: 'data model', contributes: 'shape' },
  { test: /^(src\/)?(api|controllers?)\//, role: 'api endpoint', contributes: 'http surface' },
  { test: /^(src\/)?(store|state|redux|context)\//, role: 'app state', contributes: 'client state' },
  { test: /^(src\/)?(workers?|jobs?|tasks?|queues?)\//, role: 'background job', contributes: 'async work' },

  // Non-code-ish
  { test: /\.sql$/, role: 'schema migration', contributes: 'database' },
  { test: /^(scripts?|bin|tools|ops)\//, role: 'ops script', contributes: 'tooling' },
  { test: /^(docs?|documentation)\//, role: 'document', contributes: 'reference' },
  { test: /^(migrations?|db|database)\//, role: 'schema migration', contributes: 'database' },
  { test: /\.(config|conf)\.[tjm]s$/, role: 'build config', contributes: 'toolchain' },
  { test: /^(next|vite|tailwind|postcss|webpack|rollup|vitest|playwright|jest)\.config\./, role: 'build config', contributes: 'toolchain' },
  { test: /\.(sh|bash|zsh)$/, role: 'shell script', contributes: 'tooling' },
  { test: /\.(graphql|gql|proto)$/, role: 'interface schema', contributes: 'contract' },
]

const CONTENT_HINTS: { test: RegExp; role: string; contributes: string }[] = [
  { test: /^\s*['"]use client['"]/m, role: 'client component', contributes: 'interface' },
  { test: /\bimport\s+['"]server-only['"]/, role: 'server module', contributes: 'business logic' },
]

export function classify(file: FileRecord, head?: string): Role {
  if (head) {
    for (const h of CONTENT_HINTS) {
      // Content hints only sharpen an already-generic verdict; they never beat a path rule.
      if (h.test.test(head) && !RULES.some((r) => r.test.test(file.path) && r.role !== 'ui component')) {
        return { label: h.role, contributes: h.contributes }
      }
    }
  }
  for (const rule of RULES) {
    if (rule.test.test(file.path)) return { label: rule.role, contributes: rule.contributes ?? rule.role }
  }
  return { label: 'source module', contributes: 'logic' }
}

/** A directory inherits the most common role among its children — `app` reads as "route surface". */
export function modalRole(roles: string[]): Role {
  if (roles.length === 0) return { label: 'group', contributes: 'structure' }
  const counts = new Map<string, number>()
  for (const r of roles) counts.set(r, (counts.get(r) ?? 0) + 1)
  let best = roles[0] as string
  let bestN = 0
  for (const [role, n] of counts) if (n > bestN || (n === bestN && role < best)) { best = role; bestN = n }
  const label = best === 'screen / route' || best === 'api endpoint' ? 'route surface' : best
  return { label, contributes: label }
}
