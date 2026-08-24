import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Atlas, AtlasNode } from '@codeville/core'
import type { AtlasFocus } from './focus.js'

const harness = vi.hoisted(() => {
  const slots: Array<{ value?: any; deps?: unknown[]; cleanup?: (() => void) | void }> = []
  let cursor = 0
  let refOrdinal = 0
  const pending: number[] = []
  const state = {
    inspectProps: null as Record<string, any> | null,
    renderers: [] as Array<{ setView: ReturnType<typeof vi.fn>; focusNodes: ReturnType<typeof vi.fn>; setLayout: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>,
  }

  function beginRender() {
    cursor = 0
    refOrdinal = 0
    pending.length = 0
  }

  function commitEffects() {
    while (pending.length > 0) {
      const index = pending.shift()!
      const slot = slots[index]!
      if (slot.cleanup) slot.cleanup()
      slot.cleanup = slot.value!()
    }
  }

  function sameDeps(left: unknown[] | undefined, right: unknown[] | undefined) {
    return left != null && right != null && left.length === right.length && right.every((value, index) => Object.is(value, left[index]))
  }

  function useState<T>(initial: T | (() => T)) {
    const index = cursor++
    let slot = slots[index]
    if (!slot) {
      slot = { value: typeof initial === 'function' ? (initial as () => T)() : initial }
      slots[index] = slot
    }
    return [slot.value as T, (next: T | ((current: T) => T)) => {
      slot!.value = typeof next === 'function' ? (next as (current: T) => T)(slot!.value as T) : next
    }] as const
  }

  function useRef<T>(initial: T) {
    const index = cursor++
    let slot = slots[index]
    if (!slot) {
      const value = refOrdinal === 0
        ? { clientWidth: 640, clientHeight: 420 }
        : refOrdinal === 1
          ? { getContext: () => ({}) }
          : { current: initial }
      slot = { value: refOrdinal < 2 ? { current: value } : value }
      slots[index] = slot
    }
    refOrdinal++
    return slot.value as { current: T }
  }

  function useMemo<T>(factory: () => T, deps: unknown[]) {
    const index = cursor++
    let slot = slots[index]
    if (!slot || !sameDeps(slot.deps, deps)) {
      slot = { value: factory(), deps: [...deps] }
      slots[index] = slot
    }
    return slot.value as T
  }

  function useEffect(effect: () => void | (() => void), deps: unknown[]) {
    const index = cursor++
    const slot = slots[index]
    if (!slot || !sameDeps(slot.deps, deps)) {
      slots[index] = { value: effect, deps: [...deps], cleanup: slot?.cleanup }
      pending.push(index)
    }
  }

  function useCallback<T extends (...args: any[]) => any>(factory: T, deps: unknown[]) {
    return useMemo(() => factory, deps)
  }

  function reset() {
    cursor = 0
    refOrdinal = 0
    pending.length = 0
    slots.length = 0
    state.inspectProps = null
    state.renderers.length = 0
  }

  return { beginRender, commitEffects, useState, useRef, useMemo, useEffect, useCallback, reset, state }
})

vi.mock('react', () => ({
  useState: harness.useState,
  useRef: harness.useRef,
  useMemo: harness.useMemo,
  useEffect: harness.useEffect,
  useCallback: harness.useCallback,
}))

vi.mock('react/jsx-runtime', () => {
  const render = (type: unknown, props: Record<string, any>) => typeof type === 'function' ? type(props) : { type, props }
  return { Fragment: Symbol.for('react.fragment'), jsx: render, jsxs: render }
})

vi.mock('./panels/Header.js', () => ({ Header: () => null }))
vi.mock('./panels/GuidedTour.js', () => ({ GuidedTour: () => null }))
vi.mock('./panels/SystemMap.js', () => ({ SystemMap: () => null }))
vi.mock('./panels/Inspect.js', () => ({ Inspect: (props: Record<string, any>) => {
  harness.state.inspectProps = props
  return null
} }))
vi.mock('./theme.css', () => ({}))
vi.mock('./renderer.js', () => ({
  AtlasRenderer: class FakeAtlasRenderer {
    setView = vi.fn()
    focusNodes = vi.fn()
    setLayout = vi.fn()
    resize = vi.fn()
    dispose = vi.fn()

    constructor() {
      harness.state.renderers.push(this)
    }
  },
  subLabel: () => 'lines',
}))

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', FakeResizeObserver)

const node = (id: string): AtlasNode => ({
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
  x: 0,
  y: 0,
  h: 1,
})

const makeAtlas = (nodes: AtlasNode[]): Atlas => ({
  repo: { name: 'fixture', generatedAt: '', note: '' },
  stats: { nodes: nodes.length, sourceFiles: nodes.length, lines: nodes.length, links: 1, packages: 0 },
  areas: [{ id: 'src', label: 'Source', color: '#aaa', count: nodes.length }],
  nodes,
  links: [{ from: 'root', to: 'child', type: 'import', samples: [] }],
  coverage: {
    exactFiles: 0, heuristicFiles: 0, unsupportedFiles: 0, failedFiles: 0,
    importFacts: 0, internalFacts: 0, externalFacts: 0, systemFacts: 0,
    unresolvedFacts: 0, ignoredFacts: 0, rolledUpFiles: 0, hiddenExternals: 0,
  },
})

let Atlas: (props: { atlas: Atlas }) => unknown

beforeAll(async () => {
  Atlas = (await import('./Atlas.js')).Atlas
})

beforeEach(() => {
  harness.reset()
})

function render(atlas: Atlas) {
  harness.beginRender()
  realize(Atlas({ atlas }))
  harness.commitEffects()
}

function realize(value: any): void {
  if (value == null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) realize(child)
    return
  }
  if (typeof value.type === 'function') {
    realize(value.type(value.props))
    return
  }
  realize(value.props?.children)
}

describe('Atlas renderer focus synchronization', () => {
  it('replays unchanged surviving manual focus once on an Atlas replacement', () => {
    const firstAtlas = makeAtlas([node('root'), node('child')])
    const replacementAtlas = makeAtlas([node('root'), node('child')])
    const focus: AtlasFocus = {
      id: 'path:root:child',
      title: 'root.ts → child.ts',
      note: '2 nodes in the visible slice.',
      nodeIds: ['root', 'child'],
      linkKeys: ['import\0root\0child'],
    }

    render(firstAtlas)
    harness.state.inspectProps!.onFocus(focus)
    render(firstAtlas)
    const firstRenderer = harness.state.renderers[0]!
    firstRenderer.setView.mockClear()
    firstRenderer.focusNodes.mockClear()

    render(replacementAtlas)
    const replacementRenderer = harness.state.renderers[1]!
    expect(replacementRenderer.setView).toHaveBeenCalledTimes(1)
    expect(replacementRenderer.setView).toHaveBeenCalledWith(expect.objectContaining({
      focus: { nodeIds: ['child', 'root'], linkKeys: ['import\0root\0child'] },
    }))
    expect(replacementRenderer.focusNodes).toHaveBeenCalledTimes(1)
    expect(replacementRenderer.focusNodes).toHaveBeenCalledWith(['child', 'root'])
  })
})
