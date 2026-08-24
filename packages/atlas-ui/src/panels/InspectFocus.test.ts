import { describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import type { Atlas, AtlasNode } from '@codeville/core'
import { Inspect } from './Inspect.js'
import type { AtlasFocus } from '../focus.js'

type AnyElement = ReactElement<Record<string, any>>

const node = (id: string, path = `${id}.ts`): AtlasNode => ({
  id,
  label: id,
  path,
  kind: 'file',
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

const atlas: Atlas = {
  repo: { name: 'fixture', generatedAt: '', note: '' },
  stats: { nodes: 3, sourceFiles: 3, lines: 3, links: 2, packages: 0 },
  areas: [{ id: 'src', label: 'Source', color: '#aaa', count: 3 }],
  nodes: [node('a'), node('b'), node('c')],
  links: [
    { from: 'a', to: 'b', type: 'import', samples: [] },
    { from: 'c', to: 'a', type: 'import', samples: [] },
  ],
  coverage: {
    exactFiles: 0, heuristicFiles: 0, unsupportedFiles: 0, failedFiles: 0,
    importFacts: 0, internalFacts: 0, externalFacts: 0, systemFacts: 0,
    unresolvedFacts: 0, ignoredFacts: 0, rolledUpFiles: 0, hiddenExternals: 0,
  },
}

function walk(nodeValue: ReactNode, seen: AnyElement[] = []): AnyElement[] {
  if (nodeValue == null || typeof nodeValue === 'boolean' || typeof nodeValue === 'string' || typeof nodeValue === 'number') return seen
  if (Array.isArray(nodeValue)) {
    for (const child of nodeValue) walk(child, seen)
    return seen
  }
  if (typeof nodeValue !== 'object' || !('type' in nodeValue)) return seen
  const element = nodeValue as AnyElement
  seen.push(element)
  if (typeof element.type === 'function') walk((element.type as (props: Record<string, any>) => ReactNode)(element.props), seen)
  else walk(element.props?.children, seen)
  return seen
}

function button(elements: AnyElement[], label: string): AnyElement | undefined {
  return elements.find((element) => element.type === 'button' && element.props.children === label)
}

function renderInspect(target: Parameters<typeof Inspect>[0]['target'], overrides: Partial<Parameters<typeof Inspect>[0]> = {}) {
  return walk(Inspect({
    atlas,
    target,
    tab: 'built',
    onTab: vi.fn(),
    onSelect: vi.fn(),
    focus: null,
    focusMessage: null,
    onFocus: vi.fn(),
    onFocusMessage: vi.fn(),
    onClearFocus: vi.fn(),
    ...overrides,
  }))
}

const focus = (id: string, title = 'Dependencies from a.ts'): AtlasFocus => ({
  id,
  title,
  note: '2 nodes in the visible slice.',
  nodeIds: ['a', 'b'],
  linkKeys: ['import\0a\0b'],
})

describe('Inspect dependency focus controls', () => {
  it('offers dependency and dependent cones for a built node', () => {
    const onFocus = vi.fn()
    const elements = renderInspect({ type: 'node', node: atlas.nodes[0]! }, { onFocus })
    const dependencies = button(elements, 'Focus dependencies')
    const dependents = button(elements, 'Focus dependents')
    expect(dependencies).toBeDefined()
    expect(dependents).toBeDefined()
    dependencies?.props.onClick()
    dependents?.props.onClick()
    expect(onFocus).toHaveBeenCalledTimes(2)
    expect(onFocus.mock.calls[0]![0]!.nodeIds).toEqual(['a', 'b'])
    expect(onFocus.mock.calls[1]![0]!.nodeIds).toEqual(['a', 'c'])
  })

  it('offers a directed path for exactly two selected nodes in selection order', () => {
    const onFocus = vi.fn()
    const elements = renderInspect({ type: 'set', nodes: [atlas.nodes[0]!, atlas.nodes[1]!] }, { onFocus })
    const path = button(elements, 'Find directed path')
    expect(path).toBeDefined()
    path?.props.onClick()
    expect(onFocus.mock.calls[0]![0]!).toMatchObject({ nodeIds: ['a', 'b'], linkKeys: ['import\0a\0b'] })
  })

  it('reports a missing path without focusing and clears a successful focus message first', () => {
    const onFocus = vi.fn()
    const onFocusMessage = vi.fn()
    const elements = renderInspect({ type: 'set', nodes: [atlas.nodes[1]!, atlas.nodes[2]!] }, { onFocus, onFocusMessage })
    button(elements, 'Find directed path')?.props.onClick()
    expect(onFocus).not.toHaveBeenCalled()
    expect(onFocusMessage).toHaveBeenCalledWith('No directed dependency path in the visible slice.')

    const successMessage = vi.fn()
    const successFocus = vi.fn()
    const successElements = renderInspect({ type: 'set', nodes: [atlas.nodes[0]!, atlas.nodes[1]!] }, { onFocus: successFocus, onFocusMessage: successMessage })
    button(successElements, 'Find directed path')?.props.onClick()
    expect(successMessage).toHaveBeenCalledWith(null)
    expect(successFocus).toHaveBeenCalledOnce()
  })

  it('renders active focus summary and clears it', () => {
    const onClearFocus = vi.fn()
    const elements = renderInspect({ type: 'node', node: atlas.nodes[0]! }, { focus: focus('cone:dependencies:a'), onClearFocus })
    expect(elements.some((element) => element.props.children === 'Dependencies from a.ts')).toBe(true)
    expect(elements.some((element) => element.props.children === '2 nodes in the visible slice.')).toBe(true)
    button(elements, 'Clear focus')?.props.onClick()
    expect(onClearFocus).toHaveBeenCalledOnce()
  })
})
