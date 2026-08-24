import { describe, expect, it, vi } from 'vitest'
import type { Atlas, AtlasLink, AtlasNode } from '@codeville/core'
import { AtlasRenderer, linkIsFocused, nodeIsFocused, focusChanged, type ViewState } from './renderer.js'

const link = (from: string, to: string, type: AtlasLink['type'] = 'import'): AtlasLink => ({
  from,
  to,
  type,
  samples: [],
})

const focus = (nodeIds: string[], linkKeys: string[]): ViewState['focus'] => ({ nodeIds, linkKeys })

const node = (id: string, x: number): AtlasNode => ({
  id,
  label: id,
  path: `${id}.ts`,
  kind: 'file',
  area: 'src',
  role: 'module',
  contributes: [],
  lines: 1,
  bytes: 1,
  excerpt: [],
  in: 0,
  out: 0,
  x,
  y: 0,
  h: 1,
})

const resizeAtlas: Atlas = {
  repo: { name: 'resize', generatedAt: '', note: '' },
  stats: { nodes: 2, sourceFiles: 2, lines: 2, links: 1, packages: 0 },
  areas: [{ id: 'src', label: 'Source', color: '#aaa', count: 2 }],
  nodes: [node('left', 0), node('right', 20)],
  links: [{ from: 'left', to: 'right', type: 'import', samples: [] }],
  coverage: {
    exactFiles: 0, heuristicFiles: 0, unsupportedFiles: 0, failedFiles: 0,
    importFacts: 0, internalFacts: 0, externalFacts: 0, systemFacts: 0,
    unresolvedFacts: 0, ignoredFacts: 0, rolledUpFiles: 0, hiddenExternals: 0,
  },
}

function fakeCanvas(): HTMLCanvasElement {
  return {
    style: {},
    width: 0,
    height: 0,
    getContext: () => ({}),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLCanvasElement
}

describe('renderer focus projection helpers', () => {
  it('treats null focus as focused for every node and link', () => {
    expect(nodeIsFocused('missing', null)).toBe(true)
    expect(linkIsFocused(link('missing', 'also-missing'), null)).toBe(true)
  })

  it('matches only listed node IDs and canonical link keys', () => {
    const active = focus(['a'], ['import\0a\0b'])
    expect(nodeIsFocused('a', active)).toBe(true)
    expect(nodeIsFocused('b', active)).toBe(false)
    expect(linkIsFocused(link('a', 'b'), active)).toBe(true)
    expect(linkIsFocused(link('b', 'a'), active)).toBe(false)
    expect(nodeIsFocused('missing', active)).toBe(false)
    expect(linkIsFocused(link('missing', 'also-missing'), active)).toBe(false)
  })

  it('ignores ordering when detecting equivalent focus', () => {
    expect(focusChanged(focus(['a', 'b'], ['import\0a\0b', 'external\0b\0c']), focus(['b', 'a'], ['external\0b\0c', 'import\0a\0b']))).toBe(false)
    expect(focusChanged(focus(['a'], ['import\0a\0b']), focus(['a', 'b'], ['import\0a\0b']))).toBe(true)
    expect(focusChanged(null, null)).toBe(false)
    expect(focusChanged(null, focus([], []))).toBe(true)
  })

  it('refits active focus after resize while preserving the new whole-atlas home', () => {
    vi.stubGlobal('document', { createElement: () => fakeCanvas() })
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    vi.stubGlobal('requestAnimationFrame', () => 1)
    const renderer = new AtlasRenderer(fakeCanvas(), resizeAtlas, {
      onHover: () => {},
      onSelect: () => {},
      onToggleSelect: () => {},
      onSelectLink: () => {},
    })
    ;(renderer as unknown as { draw: ReturnType<typeof vi.fn> }).draw = vi.fn()
    renderer.setView({ focus: focus(['left'], []) })

    renderer.resize(320, 220)
    const firstHome = { ...(renderer as any).home }
    expect({ x: (renderer as any).camX, y: (renderer as any).camY, zoom: (renderer as any).zoom }).not.toEqual(firstHome)

    renderer.resize(640, 420)
    const secondHome = { ...(renderer as any).home }
    expect(secondHome).not.toEqual(firstHome)
    expect({ x: (renderer as any).camX, y: (renderer as any).camY, zoom: (renderer as any).zoom }).not.toEqual(secondHome)
    renderer.resetView()
    expect({ x: (renderer as any).camX, y: (renderer as any).camY, zoom: (renderer as any).zoom }).toEqual(secondHome)

    renderer.setView({ focus: focus(['missing'], []) })
    expect(() => renderer.resize(500, 300)).not.toThrow()
    expect({ x: (renderer as any).camX, y: (renderer as any).camY, zoom: (renderer as any).zoom }).toEqual((renderer as any).home)

    renderer.setView({ focus: null })
    renderer.resize(500, 300)
    expect({ x: (renderer as any).camX, y: (renderer as any).camY, zoom: (renderer as any).zoom }).toEqual((renderer as any).home)
  })
})
