import type { AtlasArea, AtlasLink, AtlasNode } from './types.js'

type Placed = Omit<AtlasNode, 'x' | 'y' | 'h'>

const GOLDEN_ANGLE = 2.399963229728653
const MIN_DIST = 1.55
const RELAX_ITERS = 120

/**
 * Deterministic by construction: seeded PRNG, fixed iteration count, stable sort keys.
 * Same repo in, byte-identical coordinates out. Locked by layout.test.ts.
 */
export function layout(nodes: Placed[], links: AtlasLink[], areas: AtlasArea[], seed = 0x5eed): AtlasNode[] {
  const rand = mulberry32(seed)
  const local = areas.filter((a) => a.id !== 'dependencies')

  const members = new Map<string, Placed[]>()
  for (const n of nodes) {
    const list = members.get(n.area)
    if (list) list.push(n)
    else members.set(n.area, [n])
  }
  for (const list of members.values()) list.sort(byId)

  // Area discs sized to hold their members at roughly MIN_DIST spacing.
  const radiusOf = new Map<string, number>()
  for (const area of local) radiusOf.set(area.id, 0.8 + 0.95 * Math.sqrt(members.get(area.id)?.length ?? 1))

  const ordered = [...local].sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1))
  const girth = ordered.reduce((n, a) => n + 2 * (radiusOf.get(a.id) ?? 1), 0)
  const ring = Math.max((girth * 0.92) / (2 * Math.PI), 5)

  const centers = new Map<string, [number, number]>()
  let cursor = 0
  for (const area of ordered) {
    const r = radiusOf.get(area.id) ?? 1
    const span = (2 * r / girth) * 2 * Math.PI
    const theta = cursor + span / 2
    cursor += span
    centers.set(area.id, [Math.cos(theta) * ring, Math.sin(theta) * ring])
  }

  const out: AtlasNode[] = []

  for (const area of local) {
    const list = members.get(area.id) ?? []
    const [cx, cy] = centers.get(area.id) ?? [0, 0]
    const r = radiusOf.get(area.id) ?? 1
    list.forEach((node, k) => {
      // Phyllotaxis fills a disc at even density: the clustered look in the reference.
      const rho = r * Math.sqrt((k + 0.5) / Math.max(list.length, 1))
      const theta = k * GOLDEN_ANGLE
      out.push({
        ...node,
        x: cx + Math.cos(theta) * rho + (rand() - 0.5) * 0.9,
        y: cy + Math.sin(theta) * rho + (rand() - 0.5) * 0.9,
        h: heightOf(node),
      })
    })
  }

  // Externals ring the whole system, busiest first, so the heaviest deps read as anchors.
  const externals = (members.get('dependencies') ?? []).slice().sort((a, b) => b.in - a.in || byId(a, b))
  const outerRing = ring + Math.max(...[...radiusOf.values(), 4]) * 0.6 + 3
  externals.forEach((node, k) => {
    const theta = (k / Math.max(externals.length, 1)) * 2 * Math.PI + 0.31
    out.push({
      ...node,
      x: Math.cos(theta) * outerRing,
      y: Math.sin(theta) * outerRing,
      h: heightOf(node),
    })
  })

  relax(out, centers, rand)
  return recenter(out)
}

/**
 * Log height, deliberately shallow: these read as blocks on a plan, not towers.
 * lib/data.ts at 5,218 lines lands ~3x a 10-line file, not 500x.
 */
function heightOf(node: Placed): number {
  if (node.kind === 'external') return 0.12
  const h = 0.1 + Math.log10(1 + node.lines) * 0.3
  return Math.round(Math.min(h, 1.4) * 1000) / 1000
}

function relax(nodes: AtlasNode[], centers: Map<string, [number, number]>, rand: () => number): void {
  const n = nodes.length
  for (let iter = 0; iter < RELAX_ITERS; iter++) {
    const cool = 1 - iter / RELAX_ITERS
    for (let i = 0; i < n; i++) {
      const a = nodes[i]!
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]!
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d2 = dx * dx + dy * dy
        if (d2 >= MIN_DIST * MIN_DIST) continue
        if (d2 < 1e-6) {
          dx = (rand() - 0.5) * 0.01
          dy = (rand() - 0.5) * 0.01
          d2 = dx * dx + dy * dy
        }
        const d = Math.sqrt(d2)
        const push = ((MIN_DIST - d) / d) * 0.34 * cool
        a.x -= dx * push
        a.y -= dy * push
        b.x += dx * push
        b.y += dy * push
      }
      // Weak tether keeps areas from bleeding into each other under repulsion.
      const c = centers.get(a.area)
      if (c) {
        a.x += (c[0] - a.x) * 0.012 * cool
        a.y += (c[1] - a.y) * 0.012 * cool
      }
    }
  }
}

function recenter(nodes: AtlasNode[]): AtlasNode[] {
  if (nodes.length === 0) return nodes
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const n of nodes) {
    if (n.x < minX) minX = n.x
    if (n.x > maxX) maxX = n.x
    if (n.y < minY) minY = n.y
    if (n.y > maxY) maxY = n.y
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  for (const n of nodes) {
    n.x = Math.round((n.x - cx) * 1000) / 1000
    n.y = Math.round((n.y - cy) * 1000) / 1000
  }
  return nodes
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
