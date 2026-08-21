import { describe, expect, it } from 'vitest'
import { buildAtlas, extractImports } from '@codeville/core'

const specs = (text: string): string[] => extractImports('src/lib.rs', text).map((i) => i.spec)

describe('rust imports', () => {
  it('keeps the whole path rather than truncating at ::', () => {
    expect(specs('use crate::graph::Node;\nuse std::collections::HashMap;\n')).toEqual([
      'crate::graph::Node',
      'std::collections::HashMap',
    ])
  })
})

describe('rust crate resolution', () => {
  it('resolves the four fixture edges and only std as an external', () => {
    const atlas = buildAtlas(
      [
        { path: 'src/lib.rs', text: 'mod graph;\npub mod layout;\nuse crate::graph::Node;\n' },
        { path: 'src/graph.rs', text: 'use crate::types::Node;\nuse std::collections::HashMap;\n' },
        { path: 'src/types.rs', text: 'pub struct Node;\n' },
        { path: 'src/layout.rs', text: 'use super::graph;\n' },
      ],
      { maxNodes: 500, now: () => '2026-08-22T00:00:00.000Z' },
    )
    const got = new Set(atlas.links.filter((l) => l.type === 'import').map((l) => l.from + ' -> ' + l.to))
    expect(got.has('src/lib.rs -> src/graph.rs')).toBe(true)
    expect(got.has('src/lib.rs -> src/layout.rs')).toBe(true)
    expect(got.has('src/graph.rs -> src/types.rs')).toBe(true)
    expect(got.has('src/layout.rs -> src/graph.rs')).toBe(true)
    expect(atlas.nodes.filter((n) => n.kind === 'external').map((n) => n.label).sort()).toEqual(['std'])
    expect(atlas.nodes.some((n) => n.kind === 'external' && n.label === 'crate')).toBe(false)
  })

  it('searches beside a mod.rs and under a file-stem directory', () => {
    const beside = buildAtlas(
      [
        { path: 'src/lib.rs', text: 'mod util;\n' },
        { path: 'src/util/mod.rs', text: 'mod config;\n' },
        { path: 'src/util/config.rs', text: 'pub struct C;\n' },
      ],
      { maxNodes: 500, now: () => '2026-08-22T00:00:00.000Z', rollupDepth: 8 },
    )
    const under = buildAtlas(
      [
        { path: 'src/lib.rs', text: 'mod util;\n' },
        { path: 'src/util.rs', text: 'mod config;\n' },
        { path: 'src/util/config.rs', text: 'pub struct C;\n' },
      ],
      { maxNodes: 500, now: () => '2026-08-22T00:00:00.000Z', rollupDepth: 8 },
    )
    expect(beside.links.some((l) => l.from === 'src/util/mod.rs' && l.to === 'src/util/config.rs')).toBe(true)
    expect(under.links.some((l) => l.from === 'src/util.rs' && l.to === 'src/util/config.rs')).toBe(true)
  })
})
