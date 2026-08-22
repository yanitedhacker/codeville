import { mulberry32 } from './layout.js'
import type { AtlasLink, AtlasNode } from './types.js'

const ITERATIONS = 180
const MAX_STEP = 0.22
const REPULSION = 0.18
const IMPORT_SPRING = 0.045
const CONTAINMENT_SPRING = 0.012
const IMPORT_LENGTH = 2.2
const CONTAINMENT_LENGTH = 3.6
const EPS = 1e-6

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Deterministic dependency force layout. Same nodes, links, and seed always
 * produce byte-identical coordinates. No Graphology, no community detection.
 */
export function layoutDependency(nodes: AtlasNode[], links: AtlasLink[], seed: number): AtlasNode[] {
  const rand = mulberry32(seed)
  const placed = nodes.map((node) => ({ ...node })).sort(byId)

  for (const node of placed) {
    if (node.kind === 'external') continue
    node.x = 0.35 * node.x + (rand() * 0.3 - 0.15)
    node.y = 0.35 * node.y + (rand() * 0.3 - 0.15)
  }

  placeExternals(placed)

  const locals = placed.filter((node) => node.kind !== 'external')
  const byNodeId = new Map(placed.map((node) => [node.id, node]))
  const springs = links.filter((link) => byNodeId.has(link.from) && byNodeId.has(link.to) && link.from !== link.to)

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const cool = 1 - iter / ITERATIONS
    const limit = MAX_STEP * cool
    const dx = new Map<string, number>()
    const dy = new Map<string, number>()
    for (const node of locals) {
      dx.set(node.id, 0)
      dy.set(node.id, 0)
    }

    for (let i = 0; i < locals.length; i++) {
      const a = locals[i]!
      for (let j = i + 1; j < locals.length; j++) {
        const b = locals[j]!
        let rx = b.x - a.x
        let ry = b.y - a.y
        let d2 = rx * rx + ry * ry
        if (d2 < EPS) {
          rx = (rand() - 0.5) * 0.01
          ry = (rand() - 0.5) * 0.01
          d2 = rx * rx + ry * ry
        }
        d2 += EPS
        const d = Math.sqrt(d2)
        const force = REPULSION / d2
        const fx = (rx / d) * force
        const fy = (ry / d) * force
        dx.set(a.id, dx.get(a.id)! - fx)
        dy.set(a.id, dy.get(a.id)! - fy)
        dx.set(b.id, dx.get(b.id)! + fx)
        dy.set(b.id, dy.get(b.id)! + fy)
      }
    }

    for (const link of springs) {
      const a = byNodeId.get(link.from)!
      const b = byNodeId.get(link.to)!
      const spring = link.type === 'containment' ? CONTAINMENT_SPRING : IMPORT_SPRING
      const length = link.type === 'containment' ? CONTAINMENT_LENGTH : IMPORT_LENGTH
      let rx = b.x - a.x
      let ry = b.y - a.y
      let d2 = rx * rx + ry * ry
      if (d2 < EPS) {
        rx = (rand() - 0.5) * 0.01
        ry = (rand() - 0.5) * 0.01
        d2 = rx * rx + ry * ry
      }
      const d = Math.sqrt(d2 + EPS)
      const force = spring * (d - length)
      const fx = (rx / d) * force
      const fy = (ry / d) * force
      if (a.kind !== 'external') {
        dx.set(a.id, dx.get(a.id)! + fx)
        dy.set(a.id, dy.get(a.id)! + fy)
      }
      if (b.kind !== 'external') {
        dx.set(b.id, dx.get(b.id)! - fx)
        dy.set(b.id, dy.get(b.id)! - fy)
      }
    }

    for (const node of locals) {
      node.x += clamp(dx.get(node.id)! * cool, -limit, limit)
      node.y += clamp(dy.get(node.id)! * cool, -limit, limit)
    }

    placeExternals(placed)
  }

  return finalize(placed)
}

function placeExternals(nodes: AtlasNode[]): void {
  const externals = nodes.filter((node) => node.kind === 'external')
  if (externals.length === 0) return
  let maxR = 0
  for (const node of nodes) {
    if (node.kind === 'external') continue
    const r = Math.hypot(node.x, node.y)
    if (r > maxR) maxR = r
  }
  const ring = maxR + IMPORT_LENGTH
  externals.forEach((node, k) => {
    const theta = (k / externals.length) * 2 * Math.PI
    node.x = Math.cos(theta) * ring
    node.y = Math.sin(theta) * ring
  })
}

/**
 * Center locals, park externals outside that radius, then recenter local plus
 * external (bbox → origin) and round. Distances from the local centroid are
 * unchanged by the final translation.
 */
function finalize(nodes: AtlasNode[]): AtlasNode[] {
  if (nodes.length === 0) return nodes
  recenterLocals(nodes)
  placeExternals(nodes)
  shiftByBbox(nodes)
  for (const n of nodes) {
    n.x = Math.round(n.x * 1000) / 1000
    n.y = Math.round(n.y * 1000) / 1000
  }
  return nodes
}

function recenterLocals(nodes: AtlasNode[]): void {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  let sawLocal = false
  for (const n of nodes) {
    if (n.kind === 'external') continue
    sawLocal = true
    if (n.x < minX) minX = n.x
    if (n.x > maxX) maxX = n.x
    if (n.y < minY) minY = n.y
    if (n.y > maxY) maxY = n.y
  }
  if (!sawLocal) return
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  for (const n of nodes) {
    if (n.kind === 'external') continue
    n.x -= cx
    n.y -= cy
  }
}

function shiftByBbox(nodes: AtlasNode[]): void {
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
    n.x -= cx
    n.y -= cy
  }
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}
