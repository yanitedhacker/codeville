import type { Atlas, BuildOptions, VirtualFile } from './types.js'
import { parseJsonc } from './jsonc.js'
import { scan, type ScanOptions } from './scan.js'
import { createResolver, joinRepoPath, MAX_MANIFESTS, readCargoCrates, readGoModules, readTsconfigAliases, readWorkspacePackages, type ResolverOptions } from './resolve.js'
import { buildGraph } from './graph.js'
import { layout } from './layout.js'

/** Manifests ingest dropped before scan, when known. Counts stay per kind. */
export interface OmittedManifests {
  npm?: number
  cargo?: number
}

export interface BuildAtlasOptions extends BuildOptions, ScanOptions {
  omitted?: OmittedManifests
}

export function buildAtlas(files: VirtualFile[], opts: BuildAtlasOptions = {}): Atlas {
  // tsconfig and package.json are read before scan drops them as non-source.
  const tsconfig = pickTsconfig(files)
  const pkg = files.find((f) => /(^|\/)package\.json$/.test(f.path) && depth(f.path) <= 1)

  const records = scan(files, { exclude: opts.exclude })
  const index = new Set(records.map((r) => r.path))
  const workspaces = readWorkspacePackages(files, index)
  const cargo = readCargoCrates(files, index)
  const resolver = createResolver(records, {
    ...(tsconfig ? aliasesFromConfig(tsconfig, files) : {}),
    workspaces,
    goModules: readGoModules(files),
    cargoCrates: cargo.crates,
    cargoDeps: cargo.deps,
  })
  const graph = buildGraph(records, resolver, opts)
  const positioned = layout(graph.nodes, graph.links, graph.areas, seedFrom(records.map((r) => r.path)))

  const name = opts.repoName ?? readPackageName(pkg?.text) ?? 'repository'
  const shownPkgs = graph.nodes.filter((n) => n.kind === 'external').length
  const omitted = resolveOmitted(files, opts)

  return {
    repo: {
      name,
      ...(opts.ref ? { ref: opts.ref } : {}),
      generatedAt: (opts.now ?? (() => new Date().toISOString()))(),
      note: buildNote(name, graph.denseAreas, shownPkgs, graph.packages, omitted),
    },
    stats: {
      nodes: positioned.length,
      sourceFiles: graph.sourceFiles,
      lines: graph.lines,
      links: graph.links.filter((l) => l.type !== 'containment').length,
      packages: graph.packages,
    },
    areas: graph.areas,
    nodes: positioned,
    links: graph.links,
    coverage: graph.coverage,
  }
}

function countByBasename(files: VirtualFile[], basename: string): number {
  return files.filter((f) => f.path === basename || f.path.endsWith('/' + basename)).length
}

function resolveOmitted(files: VirtualFile[], opts: BuildAtlasOptions): { npm: number; cargo: number } {
  const npm = opts.omitted?.npm ?? Math.max(0, countByBasename(files, 'package.json') - MAX_MANIFESTS)
  const cargo = opts.omitted?.cargo ?? Math.max(0, countByBasename(files, 'Cargo.toml') - MAX_MANIFESTS)
  return { npm, cargo }
}

function omittedPhrase(n: number, singular: string, plural: string): string | null {
  if (n <= 0) return null
  return `${n} ${n === 1 ? singular : plural}`
}

function buildNote(
  name: string,
  rolledAreas: string[],
  shownPkgs = 0,
  totalPkgs = 0,
  omitted: { npm: number; cargo: number } = { npm: 0, cargo: 0 },
): string {
  const rolled = rolledAreas.length
    ? ` ${humanList(rolledAreas)} ${rolledAreas.length === 1 ? 'is' : 'are'} rolled into single blocks.`
    : ''
  const pkgs =
    totalPkgs > shownPkgs && shownPkgs >= 0
      ? ` ${shownPkgs} of ${totalPkgs} packages shown.`
      : ''
  const bits = [
    omittedPhrase(omitted.npm, 'workspace package', 'workspace packages'),
    omittedPhrase(omitted.cargo, 'cargo crate', 'cargo crates'),
  ].filter((s): s is string => s !== null)
  const omittedNote = bits.length ? ` ${bits.join(' and ')} omitted.` : ''
  return (
    `This is a focused source slice of ${name}, not the whole checkout. ` +
    `node_modules, build outputs, lockfiles, .env files, and nested worktrees are excluded.` +
    rolled +
    pkgs +
    omittedNote +
    ` Dots are import packets.`
  )
}

function humanList(items: string[]): string {
  const shown = items.slice(0, 4)
  const rest = items.length - shown.length
  const tail = rest > 0 ? [`${rest} more`] : []
  const all = [...shown, ...tail]
  if (all.length === 1) return all[0] as string
  return `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`
}

function readPackageName(text?: string): string | null {
  if (!text) return null
  try {
    const name = (JSON.parse(text) as { name?: string }).name
    return typeof name === 'string' && name ? name : null
  } catch {
    return null
  }
}

const depth = (path: string): number => path.split('/').length - 1

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** Prefer tsconfig.json, then jsconfig.json, then any other tsconfig*.json — never input order. */
function pickTsconfig(files: VirtualFile[]): VirtualFile | undefined {
  const candidates = files.filter((f) => depth(f.path) <= 1)
  const named = (name: string): VirtualFile | undefined =>
    candidates
      .filter((f) => basename(f.path) === name)
      .sort((a, b) => (a.path < b.path ? -1 : 1))[0]
  return (
    named('tsconfig.json') ??
    named('jsconfig.json') ??
    candidates
      .filter((f) => /(^|\/)tsconfig(\.\w+)?\.json$/.test(f.path))
      .sort((a, b) => (a.path < b.path ? -1 : 1))[0]
  )
}

function aliasesFromConfig(chosen: VirtualFile, files: VirtualFile[]): ResolverOptions {
  const child = readTsconfigAliases(chosen.text)
  const parsed = parseJsonc<{ extends?: unknown }>(chosen.text)
  const spec = typeof parsed?.extends === 'string' ? parsed.extends : null
  if (!spec) return child
  const parentPath = resolveExtends(chosen.path, spec)
  if (!parentPath) return child
  const parent = files.find((f) => f.path === parentPath || f.path === `${parentPath}.json`)
  if (!parent) return child
  const base = readTsconfigAliases(parent.text)
  return {
    aliases: { ...(base.aliases ?? {}), ...(child.aliases ?? {}) },
    baseUrl: child.baseUrl ?? base.baseUrl,
  }
}

function resolveExtends(fromPath: string, spec: string): string | null {
  const dir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : ''
  return joinRepoPath(dir, spec)
}

/** Content-derived seed: the same file set always lays out identically. */
function seedFrom(paths: string[]): number {
  let h = 0x811c9dc5
  for (const p of paths) {
    for (let i = 0; i < p.length; i++) {
      h ^= p.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
  }
  return h >>> 0
}
