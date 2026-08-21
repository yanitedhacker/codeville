import type { AtlasArea, AtlasLink, AtlasNode, BuildOptions, FileRecord } from './types.js'
import type { Resolver } from './resolve.js'
import { classify, modalRole } from './classify.js'

export const DEFAULT_ROLLUP_DEPTH = 3
/** Fraction of an area that must be reference material before it folds to one slab. */
export const DENSE_SHARE = 0.7
export const DEFAULT_MAX_NODES = 220
export const MAX_EXTERNALS = 40

/** Areas whose contents are reference material, not the running system. */
const DENSE_ROLES = new Set(['test', 'document', 'schema migration', 'ops script'])

export interface GraphResult {
  nodes: Omit<AtlasNode, 'x' | 'y' | 'h'>[]
  links: AtlasLink[]
  areas: AtlasArea[]
  /** Areas that were collapsed to a single slab, for the sidebar note. */
  denseAreas: string[]
  sourceFiles: number
  lines: number
  packages: number
}

/** One green family, varied by value — the reference never leaves it. */
const AREA_COLORS = [
  '#2A4A38', '#40684D', '#56825F', '#33553F', '#4A7357',
  '#618E6C', '#2F5B41', '#476E52', '#5C7F4E', '#3A6047',
]

export function buildGraph(files: FileRecord[], resolver: Resolver, opts: BuildOptions = {}): GraphResult {
  const rollupDepth = opts.rollupDepth ?? DEFAULT_ROLLUP_DEPTH
  const requested = opts.maxNodes ?? DEFAULT_MAX_NODES
  const maxNodes = Number.isFinite(requested) && requested >= 1 ? requested : DEFAULT_MAX_NODES

  const roles = new Map<string, ReturnType<typeof classify>>()
  for (const f of files) roles.set(f.path, classify(f, f.excerpt.join('\n')))

  const byArea = new Map<string, FileRecord[]>()
  for (const f of files) {
    const list = byArea.get(f.area)
    if (list) list.push(f)
    else byArea.set(f.area, [f])
  }

  // An area collapses only if it is overwhelmingly reference material. A simple
  // modal role folds a whole library the moment it colocates its tests with its
  // source, which is how hono/src vanished into one block.
  const denseShare = (list: FileRecord[]): number =>
    list.filter((f) => DENSE_ROLES.has(roles.get(f.path)?.label ?? '')).length / Math.max(list.length, 1)

  const dense = new Set(opts.denseAreas ?? [])
  for (const [area, list] of byArea) {
    if (denseShare(list) >= DENSE_SHARE) dense.add(area)
  }

  const externalHits = new Map<string, { count: number; samples: string[] }>()
  for (const f of files) {
    for (const imp of f.imports) {
      if (resolver.resolve(imp.spec, f.dir, f.path)) continue
      const pkg = resolver.externalName(imp.spec, f.path)
      if (!pkg) continue
      const hit = externalHits.get(pkg) ?? { count: 0, samples: [] }
      hit.count++
      if (hit.samples.length < 6 && !hit.samples.includes(imp.statement)) hit.samples.push(imp.statement)
      externalHits.set(pkg, hit)
    }
  }
  const reservedExternals = Math.min(externalHits.size, MAX_EXTERNALS)

  // assign every file to a visible node
  let depth = rollupDepth
  let groupOf = assignGroups(files, dense, depth)
  const fits = (g: Map<string, string>): boolean =>
    countVisible(files, g) + byArea.size + reservedExternals <= maxNodes

  // Node budget. Group deeper first — folding `src` to a single block to save
  // room, while a benchmarks folder stays expanded, destroys the thing you came
  // to look at. Only once grouping is exhausted do whole areas get sacrificed.
  while (!fits(groupOf) && depth > 1) {
    depth--
    groupOf = assignGroups(files, dense, depth)
  }
  while (!fits(groupOf)) {
    const next = nextToCollapse(files, byArea, groupOf, dense, denseShare)
    if (!next) break
    dense.add(next)
    groupOf = assignGroups(files, dense, depth)
  }

  // materialise nodes
  const nodes = new Map<string, Omit<AtlasNode, 'x' | 'y' | 'h'>>()
  const dirMembers = new Map<string, FileRecord[]>()

  for (const f of files) {
    const group = groupOf.get(f.path)
    if (group) {
      const list = dirMembers.get(group)
      if (list) list.push(f)
      else dirMembers.set(group, [f])
      continue
    }
    const role = roles.get(f.path)!
    nodes.set(f.path, {
      id: f.path,
      label: f.name,
      path: f.path,
      kind: 'file',
      area: f.area,
      role: role.label,
      contributes: [role.contributes],
      lines: f.lines,
      bytes: f.bytes,
      excerpt: f.excerpt,
      in: 0,
      out: 0,
      ...(f.symbols?.length ? { symbols: f.symbols } : {}),
    })
  }

  for (const [dirPath, members] of dirMembers) {
    nodes.set(dirId(dirPath), dirNode(dirPath, members, roles))
  }

  // Every area gets a slab, as in the reference: `app` sits among its own files.
  for (const [area, members] of byArea) {
    const id = dirId(area)
    if (nodes.has(id)) continue
    nodes.set(id, dirNode(area, members, roles))
  }

  // edges
  const visibleOf = (path: string): string => {
    const group = groupOf.get(path)
    return group ? dirId(group) : path
  }

  const edges = new Map<string, AtlasLink>()
  const addEdge = (from: string, to: string, type: AtlasLink['type'], sample?: string) => {
    if (from === to) return
    const key = `${type} ${from} ${to}`
    let edge = edges.get(key)
    if (!edge) {
      edge = { from, to, type, samples: [] }
      edges.set(key, edge)
    }
    if (sample && edge.samples.length < 6 && !edge.samples.includes(sample)) edge.samples.push(sample)
  }

  for (const f of files) {
    const from = visibleOf(f.path)
    for (const imp of f.imports) {
      const target = resolver.resolve(imp.spec, f.dir, f.path)
      if (target && nodes.has(visibleOf(target))) {
        addEdge(from, visibleOf(target), 'import', imp.statement)
      }
    }
  }

  const localCount = nodes.size
  const externalCap = Math.min(MAX_EXTERNALS, externalHits.size, Math.max(0, maxNodes - localCount))
  const topExternals = [...externalHits.entries()]
    .sort((a, b) => b[1].count - a[1].count || (a[0] < b[0] ? -1 : 1))
    .slice(0, externalCap)

  for (const [pkg] of topExternals) {
    nodes.set(extId(pkg), {
      id: extId(pkg),
      label: pkg,
      path: pkg,
      kind: 'external',
      area: 'dependencies',
      role: 'external dependency',
      contributes: ['third-party code'],
      lines: 0,
      bytes: 0,
      excerpt: [`Package: ${pkg}`],
      in: 0,
      out: 0,
    })
  }
  const externalSet = new Set(topExternals.map(([p]) => p))

  for (const f of files) {
    const from = visibleOf(f.path)
    for (const imp of f.imports) {
      if (resolver.resolve(imp.spec, f.dir, f.path)) continue
      const pkg = resolver.externalName(imp.spec, f.path)
      if (pkg && externalSet.has(pkg)) addEdge(from, extId(pkg), 'external', imp.statement)
    }
  }

  // Containment: an area slab holds whatever sits directly beneath it.
  for (const node of nodes.values()) {
    if (node.kind === 'external') continue
    const parent = parentId(node, nodes)
    if (parent) addEdge(parent, node.id, 'containment')
  }

  const links = [...edges.values()]

  // A dir slab reports its visible children, not its raw file count: `app` reads
  // as "7 visible children" even though 99 files live under it.
  const childCount = new Map<string, number>()
  for (const link of links) {
    if (link.type !== 'containment') continue
    childCount.set(link.from, (childCount.get(link.from) ?? 0) + 1)
  }
  for (const node of nodes.values()) {
    if (node.kind !== 'dir') continue
    const kids = childCount.get(node.id) ?? 0
    if (kids > 0) node.items = kids
  }

  for (const link of links) {
    if (link.type === 'containment') continue
    const a = nodes.get(link.from)
    const b = nodes.get(link.to)
    if (a) a.out++
    if (b) b.in++
  }

  const areaCounts = new Map<string, number>()
  for (const node of nodes.values()) areaCounts.set(node.area, (areaCounts.get(node.area) ?? 0) + 1)

  const areas: AtlasArea[] = [...areaCounts.entries()]
    .sort((a, b) => (a[0] === 'dependencies' ? 1 : b[0] === 'dependencies' ? -1 : a[0] < b[0] ? -1 : 1))
    .map(([id, count], i) => ({ id, label: id, color: AREA_COLORS[i % AREA_COLORS.length] as string, count }))

  return {
    nodes: [...nodes.values()],
    links,
    areas,
    denseAreas: [...dense].filter((a) => byArea.has(a)).sort(),
    sourceFiles: files.length,
    lines: files.reduce((n, f) => n + f.lines, 0),
    packages: externalHits.size,
  }
}

function assignGroups(files: FileRecord[], dense: Set<string>, rollupDepth: number): Map<string, string> {
  const groupOf = new Map<string, string>()
  for (const f of files) {
    const segs = f.path.split('/')
    const dirDepth = segs.length - 1
    if (dense.has(f.area)) {
      if (dirDepth > 0) groupOf.set(f.path, f.area)
      continue
    }
    if (dirDepth > rollupDepth) groupOf.set(f.path, segs.slice(0, rollupDepth).join('/'))
  }
  return groupOf
}

function countVisible(files: FileRecord[], groupOf: Map<string, string>): number {
  const groups = new Set<string>()
  let loose = 0
  for (const f of files) {
    const g = groupOf.get(f.path)
    if (g) groups.add(g)
    else loose++
  }
  return loose + groups.size
}

/**
 * Pick the area to fold next. Reference-heavy areas go first however small, so a
 * node budget never eats the source tree while a benchmark folder stays expanded.
 */
function nextToCollapse(
  files: FileRecord[],
  byArea: Map<string, FileRecord[]>,
  groupOf: Map<string, string>,
  dense: Set<string>,
  denseShare: (list: FileRecord[]) => number,
): string | null {
  const counts = new Map<string, number>()
  for (const f of files) {
    if (dense.has(f.area) || groupOf.get(f.path)) continue
    counts.set(f.area, (counts.get(f.area) ?? 0) + 1)
  }

  // Rank by reference-share first, size second. A weighted sum would let a 40%
  // test share outrank a much larger folder of pure benchmarks.
  const ranked = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .sort(([aArea, aN], [bArea, bN]) => {
      const share = denseShare(byArea.get(bArea) ?? []) - denseShare(byArea.get(aArea) ?? [])
      if (Math.abs(share) > 1e-9) return share
      return bN - aN || (aArea < bArea ? -1 : 1)
    })
  return ranked[0]?.[0] ?? null
}

function dirNode(
  path: string,
  members: FileRecord[],
  roles: Map<string, ReturnType<typeof classify>>,
): Omit<AtlasNode, 'x' | 'y' | 'h'> {
  const role = modalRole(members.map((f) => roles.get(f.path)?.label ?? ''))
  const lines = members.reduce((n, f) => n + f.lines, 0)
  return {
    id: dirId(path),
    label: path.split('/').pop() ?? path,
    path,
    kind: 'dir',
    area: path.split('/')[0] ?? path,
    role: role.label,
    contributes: [role.contributes],
    lines,
    bytes: members.reduce((n, f) => n + f.bytes, 0),
    excerpt: [`Area: ${path}`, `${members.length} files / ${lines} lines`],
    in: 0,
    out: 0,
    items: members.length,
  }
}

/** Nearest visible ancestor slab, walking up one path segment at a time. */
function parentId(node: { path: string }, nodes: Map<string, unknown>): string | null {
  const segs = node.path.split('/')
  for (let i = segs.length - 1; i >= 1; i--) {
    const id = dirId(segs.slice(0, i).join('/'))
    if (id !== dirId(node.path) && nodes.has(id)) return id
  }
  return null
}

export const dirId = (path: string): string => `dir:${path}`
export const extId = (name: string): string => `ext:${name}`
