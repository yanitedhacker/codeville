import type { Atlas, BuildOptions, VirtualFile } from './types.js'
import { scan, type ScanOptions } from './scan.js'
import { createResolver, readTsconfigAliases } from './resolve.js'
import { buildGraph } from './graph.js'
import { layout } from './layout.js'

export interface BuildAtlasOptions extends BuildOptions, ScanOptions {}

export function buildAtlas(files: VirtualFile[], opts: BuildAtlasOptions = {}): Atlas {
  // tsconfig and package.json are read before scan drops them as non-source.
  const tsconfig = files.find((f) => /(^|\/)tsconfig(\.\w+)?\.json$/.test(f.path) && depth(f.path) <= 1)
  const pkg = files.find((f) => /(^|\/)package\.json$/.test(f.path) && depth(f.path) <= 1)

  const records = scan(files, { exclude: opts.exclude })
  const resolver = createResolver(records, tsconfig ? readTsconfigAliases(tsconfig.text) : {})
  const graph = buildGraph(records, resolver, opts)
  const positioned = layout(graph.nodes, graph.links, graph.areas, seedFrom(records.map((r) => r.path)))

  const name = opts.repoName ?? readPackageName(pkg?.text) ?? 'repository'

  return {
    repo: {
      name,
      ...(opts.ref ? { ref: opts.ref } : {}),
      generatedAt: (opts.now ?? (() => new Date().toISOString()))(),
      note: buildNote(name, graph.denseAreas),
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
  }
}

function buildNote(name: string, rolledAreas: string[]): string {
  const rolled = rolledAreas.length
    ? ` ${humanList(rolledAreas)} ${rolledAreas.length === 1 ? 'is' : 'are'} rolled into single blocks.`
    : ''
  return (
    `This is a focused source slice of ${name}, not the whole checkout. ` +
    `node_modules, build outputs, lockfiles, .env files, and nested worktrees are excluded.` +
    rolled +
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
