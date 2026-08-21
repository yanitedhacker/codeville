import * as resolveExports from 'resolve.exports'
import type { FileRecord } from './types.js'
import { parseJsonc } from './jsonc.js'

export interface Resolver {
  /** Returns a repo-relative file path, or null when the specifier is external. */
  resolve(spec: string, fromDir: string, fromFile?: string): string | null
  /** Package name for an unresolved specifier, or null if it should be dropped. */
  externalName(spec: string, fromFile?: string): string | null
}

const RUST_STD = new Set(['std', 'core', 'alloc', 'proc_macro', 'test'])

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

/** Cargo package, keyed later by the underscored crate name. */
export interface CargoCrate {
  dir: string
  root: string
  entry: string
}

export interface ResolverOptions {
  /** tsconfig compilerOptions.paths, already flattened. `@/*` -> `./*` */
  aliases?: Record<string, string[]>
  /** tsconfig baseUrl, repo-relative. */
  baseUrl?: string
  workspaces?: Record<string, WorkspacePackage>
  /** go.mod `module` prefixes, longest first. */
  goModules?: { prefix: string; dir: string }[]
  /** Workspace crate name (underscored) -> crate root. */
  cargoCrates?: Record<string, CargoCrate>
  /** Underscored names from [dependencies] and [dev-dependencies]. */
  cargoDeps?: ReadonlySet<string>
}

export function createResolver(files: FileRecord[], opts: ResolverOptions = {}): Resolver {
  const index = new Set(files.map((f) => f.path))
  const aliases = Object.entries(opts.aliases ?? {})
  const base = (opts.baseUrl ?? '').replace(/^\.\/?|\/$/g, '')
  const workspaces = opts.workspaces ?? {}
  const goModules = opts.goModules ?? []
  const cargoCrates = opts.cargoCrates ?? {}
  const cargoDeps = opts.cargoDeps
  const goByDir = goFilesByDir(files)

  const probe = (candidate: string | null): string | null => probeFile(index, candidate)

  return {
    resolve(spec, fromDir, fromFile) {
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

      const rust = resolveRust(spec, fromFile, index, cargoCrates)
      if (rust) return rust

      // Python intra-package: "app.logger" -> "app/logger.py". Trailing names
      // from `from app.db import get_conn` walk back to the module file.
      if (spec.includes('.') && !spec.includes('/')) {
        const parts = spec.split('.')
        for (let n = parts.length; n >= 1; n--) {
          const hit = probe(parts.slice(0, n).join('/'))
          if (hit) return hit
        }
      }

      const go = matchGoModule(spec, goModules)
      if (go) {
        const rest = spec.slice(go.prefix.length).replace(/^\//, '')
        const dir = rest ? joinRepoPath(go.dir, rest) : go.dir
        const hit = dir !== null ? pickGoFile(dir, index, goByDir) : null
        if (hit) return hit
      }

      // Bare specifier that happens to name a real repo path (Go module subpaths, absolute imports).
      return probe(spec)
    },

    externalName(spec, fromFile) {
      if (spec.startsWith('.') || spec.startsWith('/')) return null
      if (aliases.some(([p]) => matchesAlias(spec, p))) return null
      const clean = spec.replace(/^node:/, '')
      if (!clean) return null
      const name = externalLabel(clean)
      if (!name) return null
      if (workspaces[packageHead(clean)] || workspaces[name]) return null
      const rustName = name.replace(/-/g, '_')
      if (cargoCrates[rustName]) return null
      if (
        fromFile?.endsWith('.rs') &&
        /^[A-Za-z_]\w*$/.test(clean) &&
        !RUST_STD.has(rustName) &&
        !cargoDeps?.has(rustName)
      ) {
        return null
      }
      return name
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

function externalLabel(spec: string): string | null {
  if (spec.includes('::')) {
    const first = spec.split('::')[0] ?? ''
    if (first === 'crate' || first === 'self' || first === 'super') return null
    return first || null
  }
  if (!spec.includes('/')) {
    if (spec === 'crate' || spec === 'self' || spec === 'super') return null
    return spec.split('.')[0] || null
  }
  const parts = spec.split('/')
  const first = parts[0] ?? ''
  if (first.includes('.')) return parts.slice(0, 3).join('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : first
}

function goFilesByDir(files: FileRecord[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const f of files) {
    if (f.ext !== 'go') continue
    const list = map.get(f.dir)
    if (list) list.push(f.path)
    else map.set(f.dir, [f.path])
  }
  for (const list of map.values()) list.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return map
}

function matchGoModule(spec: string, modules: { prefix: string; dir: string }[]): { prefix: string; dir: string } | null {
  for (const m of modules) {
    if (spec === m.prefix || spec.startsWith(m.prefix + '/')) return m
  }
  return null
}

function pickGoFile(dir: string, index: Set<string>, goByDir: Map<string, string[]>): string | null {
  const name = dir.includes('/') ? dir.slice(dir.lastIndexOf('/') + 1) : dir
  if (name) {
    const named = `${dir}/${name}.go`
    if (index.has(named)) return named
  }
  const list = goByDir.get(dir) ?? []
  const prod = list.filter((p) => !p.endsWith('_test.go'))
  return (prod.length ? prod : list)[0] ?? null
}

function fileDir(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? '' : path.slice(0, slash)
}

function fileName(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? path : path.slice(slash + 1)
}

function isImplicitCrateDir(dir: string): boolean {
  if (!dir) return false
  if (dir === 'src/bin' || dir.endsWith('/src/bin')) return true
  const base = fileName(dir)
  return base === 'tests' || base === 'benches' || base === 'examples'
}

function isModRsStyle(fromFile: string): boolean {
  const file = fileName(fromFile)
  return file === 'lib.rs' || file === 'main.rs' || file === 'mod.rs' || isImplicitCrateDir(fileDir(fromFile))
}

function crateRootDir(index: Set<string>, fromFile: string | undefined): string | null {
  if (fromFile) {
    const dir = fileDir(fromFile)
    if (isImplicitCrateDir(dir)) return dir
  }
  let dir = fromFile ? fileDir(fromFile) : ''
  for (;;) {
    if (index.has(dir ? `${dir}/lib.rs` : 'lib.rs') || index.has(dir ? `${dir}/main.rs` : 'main.rs')) return dir
    if (!dir) break
    dir = fileDir(dir)
  }
  for (const p of ['src/lib.rs', 'src/main.rs', 'lib.rs', 'main.rs']) {
    if (index.has(p)) return fileDir(p)
  }
  return null
}

function rustSelfDir(fromFile: string): string | null {
  if (!fromFile) return null
  const dir = fileDir(fromFile)
  if (isModRsStyle(fromFile)) return dir
  const stem = fileName(fromFile).replace(/\.rs$/, '')
  return dir ? `${dir}/${stem}` : stem
}

function rustPath(root: string | null, segs: string[], index: Set<string>): string | null {
  if (root === null || segs.length === 0) return null
  const last = segs.length > 1 ? segs.length - 1 : segs.length
  for (let n = last; n >= 1; n--) {
    const rel = segs.slice(0, n).join('/')
    const base = root ? `${root}/${rel}` : rel
    if (index.has(base + '.rs')) return base + '.rs'
    if (index.has(base + '/mod.rs')) return base + '/mod.rs'
  }
  return null
}

function rustModFile(fromFile: string, name: string, index: Set<string>): string | null {
  // #[path = "..."] attributes are out of scope.
  const search = rustSelfDir(fromFile)
  if (search === null) return null
  const rs = search ? `${search}/${name}.rs` : `${name}.rs`
  const mod = search ? `${search}/${name}/mod.rs` : `${name}/mod.rs`
  if (index.has(rs)) return rs
  if (index.has(mod)) return mod
  return null
}

function resolveRust(
  spec: string,
  fromFile: string | undefined,
  index: Set<string>,
  cargoCrates: Record<string, CargoCrate>,
): string | null {
  if (spec.includes('::')) {
    const segs = spec.split('::').filter(Boolean)
    const head = segs[0]
    const rest = segs.slice(1)
    if (head === 'crate') return rustPath(crateRootDir(index, fromFile), rest, index)
    if (head === 'self') return fromFile ? rustPath(rustSelfDir(fromFile), rest, index) : null
    if (head === 'super') {
      if (!fromFile) return null
      const self = rustSelfDir(fromFile)
      if (self === null || self === '') return rustPath('', rest, index)
      return rustPath(fileDir(self), rest, index)
    }
    const ws = head ? cargoCrates[head] : undefined
    if (ws) return rest.length ? rustPath(ws.root, rest, index) ?? ws.entry : ws.entry
    if (fromFile && head) {
      const local = rustPath(rustSelfDir(fromFile), segs, index)
      if (local) return local
    }
    return null
  }
  const ws = cargoCrates[spec]
  return ws ? ws.entry : null
}

/** First `module` line of each go.mod, longest prefix first so nested modules win. */
export function readGoModules(files: { path: string; text: string }[]): { prefix: string; dir: string }[] {
  const out: { prefix: string; dir: string }[] = []
  for (const f of files) {
    if (!/(^|\/)go\.mod$/.test(f.path)) continue
    const m = /^module\s+(\S+)/m.exec(f.text)
    if (!m?.[1]) continue
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
    out.push({ prefix: m[1], dir })
  }
  out.sort((a, b) => b.prefix.length - a.prefix.length || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0))
  return out
}

function rustIdent(name: string): string {
  return name.replace(/-/g, '_')
}

function tomlQuoted(line: string): string | null {
  const m = /=\s*"([^"]*)"/.exec(line) ?? /=\s*'([^']*)'/.exec(line)
  return m?.[1] ?? null
}

function parseCargoToml(text: string): { name?: string; libPath?: string; deps: string[] } {
  let section = ''
  let name: string | undefined
  let libPath: string | undefined
  const deps: string[] = []
  for (const line of text.split('\n')) {
    const header = /^\s*\[([^\]]+)\]/.exec(line)
    if (header) {
      section = header[1]!.trim()
      continue
    }
    const kv = /^\s*([A-Za-z0-9_-]+)\s*=/.exec(line)
    if (!kv?.[1]) continue
    const key = kv[1]
    if (section === 'package' && key === 'name') {
      const v = tomlQuoted(line)
      if (v) name = rustIdent(v)
    } else if (section === 'lib' && key === 'path') {
      const v = tomlQuoted(line)
      if (v) libPath = v
    } else if (section === 'dependencies' || section === 'dev-dependencies') {
      deps.push(rustIdent(key))
    }
  }
  return { name, libPath, deps }
}

function cargoEntry(dir: string, libPath: string | undefined, index: Set<string>): { root: string; entry: string } | null {
  const candidates = [
    libPath ? joinRepoPath(dir, libPath) : null,
    joinRepoPath(dir, 'src/lib.rs'),
    joinRepoPath(dir, 'src/main.rs'),
    joinRepoPath(dir, 'lib.rs'),
    joinRepoPath(dir, 'main.rs'),
  ]
  for (const p of candidates) {
    if (p && index.has(p)) return { root: fileDir(p), entry: p }
  }
  return null
}

/** Workspace Cargo.toml packages, plus the union of their declared dependencies. */
export function readCargoCrates(
  files: { path: string; text: string }[],
  index: Set<string>,
): { crates: Record<string, CargoCrate>; deps: Set<string> } {
  const chosen = files
    .filter((f) => /(^|\/)Cargo\.toml$/.test(f.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, MAX_MANIFESTS)

  const crates: Record<string, CargoCrate> = {}
  const deps = new Set<string>()
  for (const f of chosen) {
    const parsed = parseCargoToml(f.text)
    for (const d of parsed.deps) deps.add(d)
    if (!parsed.name || crates[parsed.name]) continue
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
    const located = cargoEntry(dir, parsed.libPath, index)
    if (!located) continue
    crates[parsed.name] = { dir, ...located }
  }
  return { crates, deps }
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
