import * as resolveExports from 'resolve.exports'
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

const EXPORT_OPTS = { browser: false, conditions: ['import'] } as const

export const MAX_MANIFESTS = 200

/** Workspace package name -> the directory holding its package.json, repo-relative. */
export interface WorkspacePackage {
  dir: string
  entry: string
  manifest: Record<string, unknown>
}

export interface ResolverOptions {
  /** tsconfig compilerOptions.paths, already flattened. `@/*` -> `./*` */
  aliases?: Record<string, string[]>
  /** tsconfig baseUrl, repo-relative. */
  baseUrl?: string
  workspaces?: Record<string, WorkspacePackage>
}

export function createResolver(files: FileRecord[], opts: ResolverOptions = {}): Resolver {
  const index = new Set(files.map((f) => f.path))
  const aliases = Object.entries(opts.aliases ?? {})
  const base = (opts.baseUrl ?? '').replace(/^\.\/?|\/$/g, '')
  const workspaces = opts.workspaces ?? {}

  const probe = (candidate: string | null): string | null => probeFile(index, candidate)

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

      const exact = workspaces[spec]
      if (exact) return exact.entry

      const head = packageHead(spec)
      const ws = head ? workspaces[head] : undefined
      if (ws && spec !== head) {
        const rest = spec.slice(head.length + 1)
        const mapped = resolveExportsTarget(ws.manifest, './' + rest)
        if (mapped) {
          for (const m of mapped) {
            const hit = probe(joinRepoPath(ws.dir, m))
            if (hit) return hit
          }
        }
        const hit = probe(joinRepoPath(ws.dir, 'src/' + rest)) ?? probe(joinRepoPath(ws.dir, rest))
        if (hit) return hit
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
      const name = packageHead(clean)
      if (!name) return null
      if (workspaces[name]) return null
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

function packageHead(spec: string): string {
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? '')
}

function probeFile(index: Set<string>, candidate: string | null): string | null {
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

function resolveExportsTarget(manifest: Record<string, unknown>, entry: string): string[] | null {
  try {
    const hits = resolveExports.exports(manifest, entry, EXPORT_OPTS)
    return hits?.length ? [...hits] : null
  } catch {
    return null
  }
}

function resolveManifestEntry(pkg: Record<string, unknown>, dir: string, index: Set<string>): string | null {
  const fromExports = resolveExportsTarget(pkg, '.')
  if (fromExports) {
    for (const m of fromExports) {
      const hit = probeFile(index, joinRepoPath(dir, m))
      if (hit) return hit
    }
  }
  try {
    const legacy = resolveExports.legacy(pkg)
    if (typeof legacy === 'string') {
      const hit = probeFile(index, joinRepoPath(dir, legacy))
      if (hit) return hit
    }
  } catch {
    /* not resolvable via module/main */
  }
  return probeFile(index, joinRepoPath(dir, 'src')) ?? probeFile(index, dir)
}

/** Build a name -> entry map from package.json files. Unresolvable manifests are skipped. */
export function readWorkspacePackages(
  manifests: { path: string; text: string }[],
  index: Set<string>,
): Record<string, WorkspacePackage> {
  const chosen = manifests
    .filter((f) => /(^|\/)package\.json$/.test(f.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, MAX_MANIFESTS)

  const out: Record<string, WorkspacePackage> = {}
  for (const f of chosen) {
    let pkg: Record<string, unknown>
    try {
      pkg = JSON.parse(f.text) as Record<string, unknown>
    } catch {
      continue
    }
    const name = pkg.name
    if (typeof name !== 'string' || !name || out[name]) continue
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
    const entry = resolveManifestEntry(pkg, dir, index)
    if (!entry) continue
    out[name] = { dir, entry, manifest: pkg }
  }
  return out
}

/** Pull `paths` + `baseUrl` out of a tsconfig, comments and all. */
export function readTsconfigAliases(text: string): ResolverOptions {
  const json = parseJsonc<{ compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } }>(text)
  const co = json?.compilerOptions
  if (!co) return {}
  return { aliases: co.paths ?? {}, baseUrl: co.baseUrl ?? '.' }
}
