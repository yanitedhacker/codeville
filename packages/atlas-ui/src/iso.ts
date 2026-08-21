import type { AtlasNode } from '@codeville/core'

/** 30 degrees: the projection angle measured off the reference frames. */
export const ISO_COS = Math.cos(Math.PI / 6)
export const ISO_SIN = Math.sin(Math.PI / 6)

/** Screen pixels per layout unit at zoom 1. */
export const UNIT = 30

export interface Point {
  sx: number
  sy: number
}

export function project(x: number, y: number, z: number): Point {
  return {
    sx: (x - y) * ISO_COS * UNIT,
    sy: ((x + y) * ISO_SIN - z) * UNIT,
  }
}

/** Painter's algorithm: smaller (x + y) sits further back, so it is drawn first. */
export function depthKey(node: { x: number; y: number }): number {
  return node.x + node.y
}

export function sortByDepth<T extends { x: number; y: number }>(nodes: T[]): T[] {
  return [...nodes].sort((a, b) => depthKey(a) - depthKey(b))
}

/** Footprint half-width. Group slabs read wider, packages read small and flat. */
export function halfWidth(node: Pick<AtlasNode, 'kind' | 'items'>): number {
  if (node.kind === 'external') return 0.34
  if (node.kind === 'dir') return Math.min(0.58 + (node.items ?? 1) * 0.006, 0.95)
  return 0.44
}

export interface SlabFaces {
  top: Point[]
  left: Point[]
  right: Point[]
  /** Projected centre of the top face — where labels and links attach. */
  anchor: Point
}

export function slabFaces(node: Pick<AtlasNode, 'x' | 'y' | 'h' | 'kind' | 'items'>): SlabFaces {
  const s = halfWidth(node)
  const { x, y, h } = node

  // Corner order runs back -> right -> front -> left, so the top face is convex on screen.
  const back = project(x - s, y - s, h)
  const right = project(x + s, y - s, h)
  const front = project(x + s, y + s, h)
  const left = project(x - s, y + s, h)

  const frontBase = project(x + s, y + s, 0)
  const leftBase = project(x - s, y + s, 0)
  const rightBase = project(x + s, y - s, 0)

  return {
    top: [back, right, front, left],
    left: [left, front, frontBase, leftBase],
    right: [right, front, frontBase, rightBase],
    anchor: project(x, y, h),
  }
}

/**
 * Import arcs lift out of the plane so overlapping edges stay tellable apart;
 * lift grows with span, as in the reference frames.
 */
export function arc(a: AtlasNode, b: AtlasNode): { p0: Point; p1: Point; c: Point } {
  const p0 = project(a.x, a.y, a.h)
  const p1 = project(b.x, b.y, b.h)
  const span = Math.hypot(a.x - b.x, a.y - b.y)
  const lift = Math.max(a.h, b.h) + 0.35 + span * 0.16
  return { p0, p1, c: project((a.x + b.x) / 2, (a.y + b.y) / 2, lift) }
}

export function bezier(p0: Point, c: Point, p1: Point, t: number): Point {
  const u = 1 - t
  const a = u * u
  const b = 2 * u * t
  const d = t * t
  return {
    sx: a * p0.sx + b * c.sx + d * p1.sx,
    sy: a * p0.sy + b * c.sy + d * p1.sy,
  }
}

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = clamp255(((n >> 16) & 255) * amount)
  const g = clamp255(((n >> 8) & 255) * amount)
  const b = clamp255((n & 255) * amount)
  return `rgb(${r},${g},${b})`
}

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))

/** Index <-> colour for the offscreen pick buffer. Index 0 is reserved for "nothing". */
export function pickColor(index: number): string {
  const v = index + 1
  return `rgb(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255})`
}

export function pickIndex(r: number, g: number, b: number): number {
  return ((r << 16) | (g << 8) | b) - 1
}
