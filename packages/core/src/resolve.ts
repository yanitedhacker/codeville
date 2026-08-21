import type { FileRecord } from './types.js'
import { parseJsonc } from './jsonc.js'

export interface Resolver {
  /** Returns a repo-relative file path, or null when the specifier is external. */
  resolve(spec: string, fromDir: string): string | null
  /** Package name for an unresolved specifier, or null if it should be dropped. */
  externalName(spec: string): string | null
}

const TRY_EXT = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte', '.astro', '.py', '.go', '.rs']
const TRY_INDEX = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.mjs', '/__init__.py', '/mod.rs']

export interface ResolverOptions {
  /** tsconfig compilerOptions.paths, already flattened. `@/*` -> `./*` */
  aliases?: Record<string, string[]>
  /** tsconfig baseUrl, repo-relative. */
  baseUrl?: string
}

export function createResolver(files: FileRecord[], opts: ResolverOptions = {}): Resolver {
  const index = new Set(files.map((f) => f.path))
  const aliases = Object.entries(opts.aliases ?? {})
  const base = (opts.baseUrl ?? '').replace(/^\.\/?|\/$/g, '')

  const probe = (candidate: string): string | null => {
    const p = normalizePath(candidate)
    if (!p) return null
    for (const ext of TRY_EXT) if (index.has(p + ext)) return p + ext
    for (const idx of TRY_INDEX) if (index.has(p + idx)) return p + idx
    return null
  }

  return {
    resolve(spec, fromDir) {
      if (spec.startsWith('.')) return probe(join(fromDir, spec))

      for (const [pattern, targets] of aliases) {
        const star = pattern.indexOf('*')
        if (star < 0) {
          if (spec !== pattern) continue
          for (const t of targets) {
            const hit = probe(join(base, t))
            if (hit) return hit
          }
          continue
        }
        const head = pattern.slice(0, star)
        const tail = pattern.slice(star + 1)
        if (!spec.startsWith(head) || !spec.endsWith(tail)) continue
        const rest = spec.slice(head.length, spec.length - tail.length)
        for (const t of targets) {
          const hit = probe(join(base, t.replace('*', rest)))
          if (hit) return hit
        }
      }

      // Python intra-package: "app.logger" -> "app/logger.py"
      if (spec.includes('.') && !spec.includes('/')) {
        const hit = probe(spec.replace(/\./g, '/'))
        if (hit) return hit
      }
      // Bare specifier that happens to name a real repo path (Go module subpaths, absolute imports).
      return probe(spec)
    },

    externalName(spec) {
      if (spec.startsWith('.') || spec.startsWith('/')) return null
      if (aliases.some(([p]) => spec.startsWith(p.replace('*', '')))) return null
      const clean = spec.replace(/^node:/, '')
      if (!clean) return null
      const parts = clean.split('/')
      const name = clean.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? clean)
      // Python/Rust dotted or crate roots collapse to the first segment.
      return name.split('.')[0] || null
    },
  }
}

function join(dir: string, rel: string): string {
  const stack = dir ? dir.split('/') : []
  for (const part of rel.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

function normalizePath(p: string): string {
  return p.replace(/\/+/g, '/').replace(/^\/|\/$/g, '')
}

/** Pull `paths` + `baseUrl` out of a tsconfig, comments and all. */
export function readTsconfigAliases(text: string): ResolverOptions {
  const json = parseJsonc<{ compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } }>(text)
  const co = json?.compilerOptions
  if (!co) return {}
  return { aliases: co.paths ?? {}, baseUrl: co.baseUrl ?? '.' }
}
