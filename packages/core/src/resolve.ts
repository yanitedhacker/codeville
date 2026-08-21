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

/** TypeScript ESM writes `.js` in the specifier while the file on disk is `.ts`. */
const JS_TO_TS: Record<string, readonly string[]> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
}

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

  const probe = (candidate: string | null): string | null => {
    if (!candidate) return null
    const p = normalizePath(candidate)
    if (!p) return null
    for (const ext of TRY_EXT) if (index.has(p + ext)) return p + ext
    for (const idx of TRY_INDEX) if (index.has(p + idx)) return p + idx
    const slash = p.lastIndexOf('/')
    const base = slash < 0 ? p : p.slice(slash + 1)
    const dot = base.lastIndexOf('.')
    if (dot <= 0) return null
    const ext = base.slice(dot)
    const alts = JS_TO_TS[ext]
    if (!alts) return null
    const stem = p.slice(0, p.length - ext.length)
    for (const alt of alts) if (index.has(stem + alt)) return stem + alt
    return null
  }

  return {
    resolve(spec, fromDir) {
      if (spec.startsWith('.')) {
        const rel = spec.includes('/') ? spec : pythonRelative(spec)
        return probe(joinRepoPath(fromDir, rel))
      }

      for (const [pattern, targets] of aliases) {
        if (!matchesAlias(spec, pattern)) continue
        const star = pattern.indexOf('*')
        if (star < 0) {
          for (const t of targets) {
            const hit = probe(joinRepoPath(base, t))
            if (hit) return hit
          }
          continue
        }
        const head = pattern.slice(0, star)
        const tail = pattern.slice(star + 1)
        const rest = spec.slice(head.length, spec.length - tail.length)
        for (const t of targets) {
          const hit = probe(joinRepoPath(base, t.replace('*', rest)))
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
      if (aliases.some(([p]) => matchesAlias(spec, p))) return null
      const clean = spec.replace(/^node:/, '')
      if (!clean) return null
      const parts = clean.split('/')
      const name = clean.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? clean)
      // Python/Rust dotted or crate roots collapse to the first segment.
      return name.split('.')[0] || null
    },
  }
}

/** Shared by resolve() and externalName() so a prefix alias cannot drop real packages. */
export function matchesAlias(spec: string, pattern: string): boolean {
  const star = pattern.indexOf('*')
  if (star < 0) return spec === pattern
  const head = pattern.slice(0, star)
  const tail = pattern.slice(star + 1)
  // A lone "*" has empty head and tail and would match every specifier. That is a
  // path remapping, not a package prefix — treating it as a hit drops every npm package.
  if (!head && !tail) return false
  return spec.startsWith(head) && spec.endsWith(tail)
}

function pythonRelative(spec: string): string {
  let n = 0
  while (spec[n] === '.') n++
  const rest = spec.slice(n).replace(/\./g, '/')
  const ups = Math.max(0, n - 1)
  return `${'../'.repeat(ups)}${rest}`
}

/** Repo-relative join. Null if `..` would leave the virtual root. */
export function joinRepoPath(dir: string, rel: string): string | null {
  const stack = dir ? dir.split('/') : []
  for (const part of rel.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (stack.length === 0) return null
      stack.pop()
    } else stack.push(part)
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
