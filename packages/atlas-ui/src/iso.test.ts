import { describe, expect, it } from 'vitest'
import type { AtlasNode } from '@codeville/core'
import { bezier, depthKey, halfWidth, hitNode, pickColor, pickIndex, pointInConvexQuad, project, shade, slabFaces, sortByDepth } from './iso.js'

const node = (over: Partial<AtlasNode> = {}): AtlasNode => ({
  id: 'x', label: 'x', path: 'x', kind: 'file', area: 'lib', role: 'service logic',
  contributes: [], lines: 10, bytes: 10, x: 0, y: 0, h: 1, excerpt: [], in: 0, out: 0, ...over,
})

describe('project', () => {
  it('puts the origin at the origin', () => {
    expect(project(0, 0, 0)).toEqual({ sx: 0, sy: 0 })
  })

  it('sends +x right-and-down and +y left-and-down', () => {
    expect(project(1, 0, 0).sx).toBeGreaterThan(0)
    expect(project(1, 0, 0).sy).toBeGreaterThan(0)
    expect(project(0, 1, 0).sx).toBeLessThan(0)
    expect(project(0, 1, 0).sy).toBeGreaterThan(0)
  })

  it('sends +z straight up with no horizontal shift', () => {
    const flat = project(2, 3, 0)
    const tall = project(2, 3, 1)
    expect(tall.sx).toBe(flat.sx)
    expect(tall.sy).toBeLessThan(flat.sy)
  })

  it('keeps equal x and y on the vertical centre line', () => {
    expect(project(4, 4, 0).sx).toBeCloseTo(0, 10)
  })
})

describe('depth sorting', () => {
  it('draws far blocks before near ones', () => {
    const near = node({ id: 'near', x: 5, y: 5 })
    const far = node({ id: 'far', x: -5, y: -5 })
    expect(sortByDepth([near, far]).map((n) => n.id)).toEqual(['far', 'near'])
    expect(depthKey(far)).toBeLessThan(depthKey(near))
  })
})

describe('slabFaces', () => {
  it('gives a convex top quad and two side faces', () => {
    const faces = slabFaces(node({ x: 0, y: 0, h: 1 }))
    expect(faces.top).toHaveLength(4)
    expect(faces.left).toHaveLength(4)
    expect(faces.right).toHaveLength(4)
    // Top corners run back, right, front, left: y descends then ascends.
    const [back, right, front, left] = faces.top as [never, never, never, never]
    expect((back as { sy: number }).sy).toBeLessThan((front as { sy: number }).sy)
    expect((right as { sx: number }).sx).toBeGreaterThan((left as { sx: number }).sx)
  })

  it('anchors labels above the base by the block height', () => {
    expect(slabFaces(node({ h: 2 })).anchor.sy).toBeLessThan(slabFaces(node({ h: 0 })).anchor.sy)
  })
})

describe('halfWidth', () => {
  it('makes groups widest and packages smallest', () => {
    const dir = halfWidth({ kind: 'dir', items: 20 })
    expect(dir).toBeGreaterThan(halfWidth({ kind: 'file' }))
    expect(halfWidth({ kind: 'file' })).toBeGreaterThan(halfWidth({ kind: 'external' }))
    expect(halfWidth({ kind: 'dir', items: 9999 })).toBeLessThanOrEqual(0.95)
  })
})

describe('shade', () => {
  it('darkens without leaving the byte range', () => {
    expect(shade('#000000', 0.5)).toBe('rgb(0,0,0)')
    expect(shade('#ffffff', 0.5)).toBe('rgb(128,128,128)')
    expect(shade('#ffffff', 5)).toBe('rgb(255,255,255)')
  })
})

function centroid(pts: { sx: number; sy: number }[]): { sx: number; sy: number } {
  const n = pts.length || 1
  return {
    sx: pts.reduce((s, p) => s + p.sx, 0) / n,
    sy: pts.reduce((s, p) => s + p.sy, 0) / n,
  }
}

describe('analytic hit testing', () => {
  it('hits a point clearly inside the top quad of a node', () => {
    const n = node({ id: 'a', x: 0, y: 0, h: 1 })
    const p = centroid(slabFaces(n).top)
    expect(pointInConvexQuad(p, slabFaces(n).top)).toBe(true)
    expect(hitNode([n], p)?.id).toBe('a')
  })

  it('on a shared edge of overlapping quads, hits the front-most node', () => {
    const far = node({ id: 'far', x: 1, y: 1, h: 1 })
    const near = node({ id: 'near', x: 1, y: 1, h: 1 })
    const ordered = sortByDepth([near, far])
    const top = slabFaces(far).top
    const onEdge = {
      sx: (top[0]!.sx + top[1]!.sx) / 2,
      sy: (top[0]!.sy + top[1]!.sy) / 2,
    }
    expect(pointInConvexQuad(onEdge, top)).toBe(true)
    expect(hitNode(ordered, onEdge)?.id).toBe(ordered[ordered.length - 1]!.id)
  })

  it('misses a point far from every quad', () => {
    const n = node({ id: 'a', x: 0, y: 0, h: 1 })
    expect(hitNode([n], { sx: 10_000, sy: 10_000 })).toBeNull()
  })
})

describe('pick buffer encoding', () => {
  it('round-trips every index we could draw', () => {
    for (const i of [0, 1, 26, 255, 256, 65535, 100000]) {
      const [r, g, b] = (/rgb\((\d+),(\d+),(\d+)\)/.exec(pickColor(i)) ?? []).slice(1).map(Number) as number[]
      expect(pickIndex(r!, g!, b!)).toBe(i)
    }
  })

  it('never encodes an index as transparent-black, which means "nothing"', () => {
    expect(pickColor(0)).not.toBe('rgb(0,0,0)')
  })
})

describe('bezier', () => {
  it('starts at p0, ends at p1, and bows toward the control point', () => {
    const p0 = { sx: 0, sy: 0 }
    const c = { sx: 5, sy: -10 }
    const p1 = { sx: 10, sy: 0 }
    expect(bezier(p0, c, p1, 0)).toEqual(p0)
    expect(bezier(p0, c, p1, 1)).toEqual(p1)
    expect(bezier(p0, c, p1, 0.5).sy).toBeLessThan(0)
  })
})
