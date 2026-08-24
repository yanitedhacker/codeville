import { describe, expect, it } from 'vitest'
import type { Atlas, AtlasArea, AtlasLink, AtlasNode } from '@codeville/core'
import { buildTour } from './tour.js'

const areas: AtlasArea[] = [
  { id: 'apps', label: 'Applications', color: '#a00', count: 3 },
  { id: 'packages', label: 'Packages', color: '#0a0', count: 4 },
  { id: 'root', label: 'Root', color: '#00a', count: 2 },
]

const makeNode = (id: string, area: string, kind: AtlasNode['kind'] = 'file', inCount = 0, outCount = 0): AtlasNode => ({
  id,
  label: id,
  path: `${area}/${id}`,
  kind,
  area,
  role: 'module',
  contributes: [],
  lines: 1,
  bytes: 1,
  excerpt: [],
  in: inCount,
  out: outCount,
  x: 0,
  y: 0,
  h: 1,
})

const makeLink = (from: string, to: string, type: AtlasLink['type'] = 'import'): AtlasLink => ({ from, to, type, samples: [] })

const nodes: AtlasNode[] = [
  makeNode('app-a', 'apps', 'file', 3, 2),
  makeNode('app-b', 'apps', 'file', 2, 1),
  makeNode('app-c', 'apps', 'file', 1, 2),
  makeNode('pkg-a', 'packages', 'file', 4, 3),
  makeNode('pkg-b', 'packages', 'file', 2, 2),
  makeNode('pkg-c', 'packages', 'file', 2, 1),
  makeNode('pkg-d', 'packages', 'file', 1, 1),
  makeNode('root-a', 'root', 'file', 0, 1),
  makeNode('root-b', 'root', 'file', 1, 0),
  makeNode('ext-a', 'external', 'external', 2, 0),
  makeNode('ext-b', 'external', 'external', 1, 0),
]

const links: AtlasLink[] = [
  makeLink('app-a', 'app-b'),
  makeLink('app-b', 'app-c'),
  makeLink('app-a', 'pkg-a'),
  makeLink('pkg-a', 'pkg-b'),
  makeLink('pkg-b', 'pkg-c'),
  makeLink('pkg-c', 'pkg-d'),
  makeLink('app-c', 'app-c'),
  makeLink('app-c', 'ext-a', 'external'),
  makeLink('pkg-a', 'ext-b', 'external'),
  makeLink('app-a', 'app-b', 'containment'),
  makeLink('app-a', 'missing'),
]

const atlas = (overrides: Partial<Atlas> = {}): Atlas => ({
  repo: { name: 'fixture', generatedAt: '', note: '' },
  stats: { nodes: nodes.length, sourceFiles: nodes.length, lines: 11, links: links.length, packages: 3 },
  areas,
  nodes,
  links,
  coverage: {
    exactFiles: 0, heuristicFiles: 0, unsupportedFiles: 0, failedFiles: 0,
    importFacts: 0, internalFacts: 0, externalFacts: 0, systemFacts: 0,
    unresolvedFacts: 0, ignoredFacts: 0, rolledUpFiles: 0, hiddenExternals: 0,
  },
  ...overrides,
})

describe('guided tour derivation', () => {
  it('preserves non-empty area order and includes only internal non-containment links', () => {
    const chapters = buildTour(atlas())
    expect(chapters.slice(0, 3).map(({ id, title }) => [id, title])).toEqual([
      ['area:apps', 'Applications'], ['area:packages', 'Packages'], ['area:root', 'Root'],
    ])
    expect(chapters[0]!.nodeIds).toEqual(['app-a', 'app-b', 'app-c'])
    expect(chapters[0]!.linkKeys).toEqual(['import\0app-a\0app-b', 'import\0app-b\0app-c', 'import\0app-c\0app-c'])
  })

  it('includes valid internal non-containment self-links in an area chapter', () => {
    const area = buildTour(atlas()).find((chapter) => chapter.id === 'area:apps')!
    expect(area.linkKeys).toContain('import\0app-c\0app-c')
  })

  it('skips empty declared areas', () => {
    const result = buildTour(atlas({ areas: [...areas, { id: 'empty', label: 'Empty', color: '#aaa', count: 0 }] }))
    expect(result.filter((chapter) => chapter.kind === 'area').map((chapter) => chapter.id)).toEqual(['area:apps', 'area:packages', 'area:root'])
  })

  it('ranks at most eight local hubs and includes valid incident links with opposite endpoints', () => {
    const hubs = buildTour(atlas()).find((chapter) => chapter.kind === 'hubs')!
    expect(hubs.nodeIds).toEqual(['app-a', 'app-b', 'app-c', 'ext-a', 'ext-b', 'pkg-a', 'pkg-b', 'pkg-c', 'pkg-d', 'root-a'])
    expect(hubs.nodeIds).toContain('root-a')
    expect(hubs.nodeIds).not.toContain('root-b')
    expect(hubs.linkKeys).not.toContain('import\0app-a\0missing')
    expect(hubs.linkKeys).toContain('external\0app-c\0ext-a')
    expect(hubs.nodeIds).toContain('ext-a')
  })

  it('derives the external boundary only when valid external topology exists', () => {
    const boundary = buildTour(atlas()).find((chapter) => chapter.kind === 'boundary')!
    expect(boundary.nodeIds).toEqual(['app-c', 'ext-a', 'ext-b', 'pkg-a'])
    expect(boundary.linkKeys).toEqual(['external\0app-c\0ext-a', 'external\0pkg-a\0ext-b'])
    const none = buildTour(atlas({ nodes: nodes.filter((node) => node.kind !== 'external'), links: [] }))
    expect(none.some((chapter) => chapter.kind === 'boundary')).toBe(false)
  })

  it('leaves the whole visible system last with all valid links including containment', () => {
    const all = buildTour(atlas()).at(-1)!
    expect(all.kind).toBe('all')
    expect(all.nodeIds).toEqual(nodes.map(({ id }) => id).sort())
    expect(all.linkKeys).toContain('containment\0app-a\0app-b')
    expect(all.linkKeys).not.toContain('import\0app-a\0missing')
  })

  it('deduplicates only adjacent identical projections and preserves final all', () => {
    const duplicate = buildTour(atlas({
      areas: [{ ...areas[0]!, count: 1 }],
      nodes: [nodes[0]!],
      links: [],
    }))
    expect(duplicate.map((chapter) => chapter.kind)).toEqual(['area', 'all'])
    expect(duplicate.at(-1)?.kind).toBe('all')
    expect(duplicate.at(-1)?.nodeIds).toEqual(['app-a'])
  })

  it('returns one empty all chapter for an empty Atlas', () => {
    const empty = buildTour(atlas({ areas: [], nodes: [], links: [] }))
    expect(empty).toHaveLength(1)
    expect(empty[0]).toMatchObject({ kind: 'all', id: 'all', nodeIds: [], linkKeys: [] })
  })

  it('is invariant under reversed nodes and links while respecting explicit area order', () => {
    const reversed = buildTour(atlas({ nodes: [...nodes].reverse(), links: [...links].reverse() }))
    expect(reversed).toEqual(buildTour(atlas()))
    const reordered = buildTour(atlas({ areas: [...areas].reverse() }))
    expect(reordered.slice(0, 3).map((chapter) => chapter.id)).toEqual(['area:root', 'area:packages', 'area:apps'])
    expect(reordered.slice(3)).toEqual(buildTour(atlas()).slice(3))
  })
})
