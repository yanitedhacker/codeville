import { describe, expect, it } from 'vitest'
import type { Atlas, AtlasLink, AtlasNode } from '@codeville/core'
import {
  atlasLinkKey,
  dependencyCone,
  focusProjectionKey,
  shortestDependencyPath,
} from './focus.js'

const node = (id: string, kind: AtlasNode['kind'] = 'file'): AtlasNode => ({
  id,
  label: id,
  path: id,
  kind,
  area: 'src',
  role: 'module',
  contributes: [],
  lines: 1,
  bytes: 1,
  excerpt: [],
  in: 0,
  out: 0,
  x: 0,
  y: 0,
  h: 1,
})

const link = (from: string, to: string, type: AtlasLink['type'] = 'import'): AtlasLink => ({
  from,
  to,
  type,
  samples: [],
})

const makeAtlas = (reverse = false): Atlas => {
  const nodes = [node('a'), node('b'), node('c'), node('d'), node('pkg', 'external')]
  const links = [
    link('a', 'b'),
    link('a', 'c'),
    link('b', 'd'),
    link('c', 'd'),
    link('d', 'a'),
    link('d', 'pkg', 'external'),
    link('a', 'b', 'containment'),
    link('d', 'missing'),
  ]
  return {
    repo: { name: 'fixture', generatedAt: '', note: '' },
    stats: { nodes: nodes.length, sourceFiles: nodes.length, lines: 5, links: links.length, packages: 1 },
    areas: [],
    nodes: reverse ? [...nodes].reverse() : nodes,
    links: reverse ? [...links].reverse() : links,
    coverage: {
      exactFiles: 0,
      heuristicFiles: 0,
      unsupportedFiles: 0,
      failedFiles: 0,
      importFacts: 0,
      internalFacts: 0,
      externalFacts: 0,
      systemFacts: 0,
      unresolvedFacts: 0,
      ignoredFacts: 0,
      rolledUpFiles: 0,
      hiddenExternals: 0,
    },
  }
}

describe('dependency focus primitives', () => {
  const atlas = makeAtlas()

  it('uses a stable type/from/to link key', () => {
    expect(atlasLinkKey(link('a', 'b'))).toBe('import\0a\0b')
  })

  it('derives a sorted, cycle-safe dependency cone and excludes invalid topology', () => {
    const focus = dependencyCone(atlas, 'a', 'dependencies')
    expect(focus.nodeIds).toEqual(['a', 'b', 'c', 'd', 'pkg'])
    expect(focus.linkKeys).toEqual([
      'external\0d\0pkg',
      'import\0a\0b',
      'import\0a\0c',
      'import\0b\0d',
      'import\0c\0d',
      'import\0d\0a',
    ])
    expect(focus.title).toBe('Dependencies from a')
    expect(focus.note).toBe('5 nodes in the visible slice.')
  })

  it('follows incoming edges for dependents', () => {
    const focus = dependencyCone(atlas, 'd', 'dependents')
    expect(focus.nodeIds).toEqual(['a', 'b', 'c', 'd'])
    expect(focus.linkKeys).toEqual([
      'import\0a\0b',
      'import\0a\0c',
      'import\0b\0d',
      'import\0c\0d',
      'import\0d\0a',
    ])
    expect(focus.title).toBe('Dependents of d')
  })

  it('returns an empty focus for a missing root', () => {
    const focus = dependencyCone(atlas, 'missing', 'dependencies')
    expect(focus.nodeIds).toEqual([])
    expect(focus.linkKeys).toEqual([])
    expect(focus.note).toBe('0 nodes in the visible slice.')
  })

  it('chooses the lexicographically first shortest directed path', () => {
    const focus = shortestDependencyPath(atlas, 'a', 'd')
    expect(focus?.nodeIds).toEqual(['a', 'b', 'd'])
    expect(focus?.linkKeys).toEqual(['import\0a\0b', 'import\0b\0d'])
    expect(focus?.title).toBe('a → d')
    expect(focus?.note).toBe('3 nodes in the visible slice.')
  })

  it('returns null for invalid or unreachable paths', () => {
    expect(shortestDependencyPath(atlas, 'a', 'a')).toBeNull()
    expect(shortestDependencyPath(atlas, 'a', 'missing')).toBeNull()
    expect(shortestDependencyPath(atlas, 'pkg', 'a')).toBeNull()
    expect(shortestDependencyPath({ ...atlas, links: [link('a', 'b', 'containment')] }, 'a', 'b')).toBeNull()
  })

  it('is invariant to input ordering and does not mutate caller arrays', () => {
    const nodes = [...atlas.nodes]
    const links = [...atlas.links]
    const forward = dependencyCone(atlas, 'a', 'dependencies')
    const reversed = dependencyCone(makeAtlas(true), 'a', 'dependencies')
    expect(focusProjectionKey(forward)).toBe(focusProjectionKey(reversed))
    expect(focusProjectionKey({ nodeIds: ['b', 'a'], linkKeys: ['z', 'a'] })).toBe('a\0b\0a\0z')
    expect(focusProjectionKey(null)).toBe('')
    expect(atlas.nodes).toEqual(nodes)
    expect(atlas.links).toEqual(links)
  })
})
