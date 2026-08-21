import { describe, expect, it } from 'vitest'
import { layout, mulberry32 } from './layout.js'
import type { AtlasArea, AtlasNode } from './types.js'

type Placed = Omit<AtlasNode, 'x' | 'y' | 'h'>

const node = (id: string, area: string, lines = 100): Placed => ({
  id, label: id, path: `${area}/${id}`, kind: 'file', area,
  role: 'service logic', contributes: [], lines, bytes: lines * 30, excerpt: [], in: 0, out: 0,
})

const AREAS: AtlasArea[] = [
  { id: 'app', label: 'app', color: '#2A4A38', count: 20 },
  { id: 'lib', label: 'lib', color: '#40684D', count: 12 },
  { id: 'dependencies', label: 'dependencies', color: '#56825F', count: 6 },
]

const NODES: Placed[] = [
  ...Array.from({ length: 20 }, (_, i) => node(`a${i}`, 'app', 50 + i * 40)),
  ...Array.from({ length: 12 }, (_, i) => node(`l${i}`, 'lib')),
  ...Array.from({ length: 6 }, (_, i) => ({ ...node(`p${i}`, 'dependencies', 0), kind: 'external' as const })),
]

describe('layout', () => {
  it('is deterministic: same input, byte-identical coordinates', () => {
    const a = layout(NODES, [], AREAS, 1234)
    const b = layout(NODES, [], AREAS, 1234)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('does not mutate the caller-supplied nodes', () => {
    const before = JSON.stringify(NODES)
    layout(NODES, [], AREAS, 1234)
    expect(JSON.stringify(NODES)).toBe(before)
  })

  it('produces a different field for a different seed', () => {
    const a = layout(NODES, [], AREAS, 1)
    const b = layout(NODES, [], AREAS, 2)
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })

  it('places every node at a finite, centred position', () => {
    const placed = layout(NODES, [], AREAS, 7)
    expect(placed).toHaveLength(NODES.length)
    for (const n of placed) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.h)).toBe(true)
    }
    const cx = placed.reduce((s, n) => s + n.x, 0) / placed.length
    const cy = placed.reduce((s, n) => s + n.y, 0) / placed.length
    expect(Math.abs(cx)).toBeLessThan(6)
    expect(Math.abs(cy)).toBeLessThan(6)
  })

  it('keeps blocks from stacking on top of each other', () => {
    const placed = layout(NODES, [], AREAS, 7)
    let tooClose = 0
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        if (Math.hypot(placed[i]!.x - placed[j]!.x, placed[i]!.y - placed[j]!.y) < 0.7) tooClose++
      }
    }
    expect(tooClose).toBe(0)
  })

  it('scales height by log of size, so a 5,000-line file is not a skyscraper', () => {
    // layout() sorts members by id for determinism, so look them up rather than destructure.
    const placed = layout(
      [node('small', 'lib', 10), node('big', 'lib', 5218)],
      [],
      [{ id: 'lib', label: 'lib', color: '#000', count: 2 }],
      1,
    )
    const small = placed.find((n) => n.id === 'small')!
    const big = placed.find((n) => n.id === 'big')!
    expect(big.h).toBeGreaterThan(small.h)
    expect(big.h / small.h).toBeLessThan(4)
    expect(big.h).toBeLessThanOrEqual(1.4)
  })

  it('pushes packages outside the local areas', () => {
    const placed = layout(NODES, [], AREAS, 7)
    const radius = (n: AtlasNode): number => Math.hypot(n.x, n.y)
    const local = placed.filter((n) => n.kind !== 'external')
    const external = placed.filter((n) => n.kind === 'external')
    const meanLocal = local.reduce((s, n) => s + radius(n), 0) / local.length
    const meanExternal = external.reduce((s, n) => s + radius(n), 0) / external.length
    expect(meanExternal).toBeGreaterThan(meanLocal)
  })

  it('survives an empty graph', () => {
    expect(layout([], [], [], 1)).toEqual([])
  })
})

describe('mulberry32', () => {
  it('is a stable stream for a given seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const draw = (f: () => number): number[] => Array.from({ length: 5 }, f)
    expect(draw(a)).toEqual(draw(b))
  })

  it('stays inside [0, 1)', () => {
    const r = mulberry32(9)
    for (let i = 0; i < 500; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})
