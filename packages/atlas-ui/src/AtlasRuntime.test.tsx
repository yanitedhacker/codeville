import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Atlas as AtlasData, AtlasNode, RuntimeTraceBundle } from '@codeville/core'
import type { AtlasFocus } from './focus.js'
import type { AtlasProps } from './Atlas.js'

const harness = vi.hoisted(() => {
  const slots: Array<{ value?: any; deps?: unknown[]; cleanup?: (() => void) | void }> = []
  let cursor = 0
  let refOrdinal = 0
  const pending: number[] = []
  const state = {
    headerProps: null as Record<string, any> | null,
    runtimeLensProps: null as Record<string, any> | null,
    inspectProps: null as Record<string, any> | null,
    systemMapProps: null as Record<string, any> | null,
    canvasProps: null as Record<string, any> | null,
    renderers: [] as Array<{
      callbacks: Record<string, (...args: any[]) => void>
      setView: ReturnType<typeof vi.fn>
      focusNodes: ReturnType<typeof vi.fn>
      focusNode: ReturnType<typeof vi.fn>
      setLayout: ReturnType<typeof vi.fn>
      resize: ReturnType<typeof vi.fn>
      dispose: ReturnType<typeof vi.fn>
      resetView: ReturnType<typeof vi.fn>
      panBy: ReturnType<typeof vi.fn>
      zoomBy: ReturnType<typeof vi.fn>
      traceOneStep: ReturnType<typeof vi.fn>
    }>,
  }

  function beginRender() {
    cursor = 0
    refOrdinal = 0
    pending.length = 0
    state.headerProps = null
    state.runtimeLensProps = null
    state.inspectProps = null
    state.systemMapProps = null
    state.canvasProps = null
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
    state.headerProps = null
    state.runtimeLensProps = null
    state.inspectProps = null
    state.systemMapProps = null
    state.canvasProps = null
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
  const render = (type: unknown, props: Record<string, any>) => {
    if (type === 'canvas' || props?.className === 'cv-canvas') harness.state.canvasProps = props
    return typeof type === 'function' ? type(props) : { type, props }
  }
  return { Fragment: Symbol.for('react.fragment'), jsx: render, jsxs: render }
})

vi.mock('./panels/Header.js', () => ({ Header: (props: Record<string, any>) => {
  harness.state.headerProps = props
  return null
} }))
vi.mock('./panels/GuidedTour.js', () => ({ GuidedTour: () => null }))
vi.mock('./panels/SystemMap.js', () => ({ SystemMap: (props: Record<string, any>) => {
  harness.state.systemMapProps = props
  return null
} }))
vi.mock('./panels/Inspect.js', () => ({ Inspect: (props: Record<string, any>) => {
  harness.state.inspectProps = props
  return null
} }))
vi.mock('./runtime/RuntimeLens.js', () => ({ RuntimeLens: (props: Record<string, any>) => {
  harness.state.runtimeLensProps = props
  return null
} }))
vi.mock('./theme.css', () => ({}))
vi.mock('./renderer.js', () => ({
  AtlasRenderer: class FakeAtlasRenderer {
    callbacks: Record<string, (...args: any[]) => void>
    setView = vi.fn()
    focusNodes = vi.fn()
    focusNode = vi.fn()
    setLayout = vi.fn()
    resize = vi.fn()
    dispose = vi.fn()
    resetView = vi.fn()
    panBy = vi.fn()
    zoomBy = vi.fn()
    traceOneStep = vi.fn()

    constructor(_canvas: unknown, _atlas: unknown, callbacks: Record<string, (...args: any[]) => void>) {
      this.callbacks = callbacks
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

const node = (id: string, path: string): AtlasNode => ({
  id,
  label: path,
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

const atlas: AtlasData = {
  repo: { name: 'fixture', generatedAt: '', note: '' },
  stats: { nodes: 2, sourceFiles: 2, lines: 2, links: 1, packages: 0 },
  areas: [{ id: 'src', label: 'Source', color: '#aaa', count: 2 }],
  nodes: [node('file:src/api.ts', 'src/api.ts'), node('file:other/api.ts', 'other/api.ts')],
  links: [{ from: 'file:src/api.ts', to: 'file:other/api.ts', type: 'import', samples: [] }],
  coverage: {
    exactFiles: 0, heuristicFiles: 0, unsupportedFiles: 0, failedFiles: 0,
    importFacts: 0, internalFacts: 0, externalFacts: 0, systemFacts: 0,
    unresolvedFacts: 0, ignoredFacts: 0, rolledUpFiles: 0, hiddenExternals: 0,
  },
}

const runtime = {
  version: 1,
  format: 'otlp-json',
  traces: [],
  spans: [],
  report: {
    documents: 1,
    resourceScopeGroups: 0,
    traces: 0,
    inputSpans: 0,
    spans: 0,
    duplicateSpans: 0,
    sampledSpans: 0,
    unsampledSpans: 0,
    redactedAttributes: 0,
    droppedAttributesCount: '0',
    droppedEventsCount: '0',
    droppedLinksCount: '0',
    unknownFieldCount: 0,
    unknownFields: [],
  },
} satisfies RuntimeTraceBundle

const footerActions = 'Export controls'

let Atlas: (props: AtlasProps) => unknown
let ActualHeader: typeof import('./panels/Header.js').Header

beforeAll(async () => {
  Atlas = (await import('./Atlas.js')).Atlas
  ActualHeader = (await vi.importActual<typeof import('./panels/Header.js')>('./panels/Header.js')).Header
})

beforeEach(() => {
  harness.reset()
})

function renderAtlas(props: AtlasProps) {
  harness.beginRender()
  realize(Atlas(props))
  harness.commitEffects()
}

function realize(value: any): void {
  if (value == null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) realize(child)
    return
  }
  if (value.type === 'canvas') harness.state.canvasProps = value.props
  if (typeof value.type === 'function') {
    realize(value.type(value.props))
    return
  }
  realize(value.props?.children)
}

function acceptAtlasProps(_props: AtlasProps): void {}

function nativeButtons(value: any): Array<Record<string, any>> {
  if (value == null || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(nativeButtons)
  const own = value.type === 'button' ? [value] : []
  return own.concat(nativeButtons(value.props?.children))
}

describe('Atlas runtime mode integration', () => {
  it('keeps static behavior unchanged when runtime is absent', () => {
    renderAtlas({ atlas })

    expect(harness.state.runtimeLensProps).toBeNull()
    expect(harness.state.headerProps?.onShowRuntime).toBeUndefined()
    expect(harness.state.canvasProps?.['aria-label']).toContain('Interactive codebase map')
    expect(harness.state.renderers).toHaveLength(1)
  })

  it('adds one native Runtime Lens button only when runtime switching is available', () => {
    const baseProps = {
      atlas,
      layoutMode: 'city' as const,
      flowing: false,
      onLayout: vi.fn(),
      onToggleFlow: vi.fn(),
      onTrace: vi.fn(),
      onReset: vi.fn(),
    }
    const staticLabels = nativeButtons(ActualHeader(baseProps)).map((button) => button.props.children)
    expect(staticLabels).toEqual(['City', 'Dependencies', 'Resume the flow', 'Trace one step', 'Reset view'])

    const onShowRuntime = vi.fn()
    const runtimeButtons = nativeButtons(ActualHeader({ ...baseProps, onShowRuntime }))
    const modeButtons = runtimeButtons.filter((button) => button.props.children === 'Runtime Lens')
    expect(modeButtons).toHaveLength(1)
    modeButtons[0]!.props.onClick()
    expect(onShowRuntime).toHaveBeenCalledOnce()
  })

  it('requires runtime clearing at the public prop boundary', () => {
    acceptAtlasProps({ atlas })
    acceptAtlasProps({ atlas, runtime, initialMode: 'runtime', onClearRuntime: () => {} })

    // @ts-expect-error A runtime bundle must have an owner clear callback.
    acceptAtlasProps({ atlas, runtime })
    // @ts-expect-error A static-only Atlas cannot start in runtime mode.
    acceptAtlasProps({ atlas, initialMode: 'runtime' })
  })

  it('opens directly in runtime mode without creating the static renderer', () => {
    const onClearRuntime = vi.fn()
    renderAtlas({ atlas, runtime, initialMode: 'runtime', onClearRuntime, footerExtra: footerActions })

    expect(harness.state.renderers).toHaveLength(0)
    expect(harness.state.headerProps).toBeNull()
    expect(harness.state.runtimeLensProps).toEqual(expect.objectContaining({
      atlas,
      runtime,
      onClearRuntime,
      footerActions,
    }))
  })

  it('disposes static mode once and creates a fresh renderer when static mode returns', () => {
    const onClearRuntime = vi.fn()
    const props: AtlasProps = { atlas, runtime, initialMode: 'static', onClearRuntime }
    renderAtlas(props)
    const original = harness.state.renderers[0]!

    harness.state.headerProps!.onShowRuntime()
    renderAtlas(props)
    expect(original.dispose).toHaveBeenCalledTimes(1)
    expect(harness.state.runtimeLensProps).not.toBeNull()

    harness.state.runtimeLensProps!.onShowStatic()
    expect(onClearRuntime).not.toHaveBeenCalled()
    renderAtlas(props)

    expect(harness.state.renderers).toHaveLength(2)
    expect(harness.state.renderers[1]).not.toBe(original)
    expect(original.dispose).toHaveBeenCalledTimes(1)
  })

  it('replays current layout, view, focus, and selection on the fresh static renderer', () => {
    const props: AtlasProps = { atlas, runtime, initialMode: 'static', onClearRuntime: vi.fn() }
    const focus: AtlasFocus = {
      id: 'focus:api',
      title: 'API focus',
      note: 'One exact source file.',
      nodeIds: ['file:src/api.ts'],
      linkKeys: [],
    }
    renderAtlas(props)
    harness.state.headerProps!.onLayout('dependency')
    harness.state.inspectProps!.onFocus(focus)
    harness.state.systemMapProps!.onArea('src')
    harness.state.systemMapProps!.onFilter('api')
    harness.state.systemMapProps!.onSelect('file:src/api.ts')
    renderAtlas(props)

    harness.state.headerProps!.onShowRuntime()
    renderAtlas(props)
    harness.state.runtimeLensProps!.onShowStatic()
    renderAtlas(props)

    const fresh = harness.state.renderers[1]!
    expect(fresh.setLayout).toHaveBeenCalledWith('dependency')
    expect(fresh.setView).toHaveBeenCalledWith(expect.objectContaining({
      selected: ['file:src/api.ts'],
      selectedLink: null,
      activeArea: 'src',
      filter: 'api',
      focus: { nodeIds: ['file:src/api.ts'], linkKeys: [] },
    }))
    expect(fresh.focusNodes).toHaveBeenCalledWith(['file:src/api.ts'])
  })

  it('hands off only the exact source node after the fresh static renderer exists', () => {
    const props: AtlasProps = { atlas, runtime, initialMode: 'static', onClearRuntime: vi.fn() }
    renderAtlas(props)
    const oldRenderer = harness.state.renderers[0]!
    oldRenderer.callbacks.onHover!('file:other/api.ts', { x: 4, y: 5 })

    harness.state.headerProps!.onShowRuntime()
    renderAtlas(props)
    harness.state.runtimeLensProps!.onOpenSource('file:src/api.ts')
    renderAtlas(props)

    const fresh = harness.state.renderers[1]!
    expect(fresh.focusNode).toHaveBeenCalledTimes(1)
    expect(fresh.focusNode).toHaveBeenCalledWith('file:src/api.ts')
    expect(oldRenderer.focusNode).not.toHaveBeenCalledWith('file:src/api.ts')
    expect(harness.state.inspectProps!.target).toMatchObject({
      type: 'node',
      node: { id: 'file:src/api.ts' },
    })
    expect(harness.state.canvasProps?.['aria-label']).toContain('Interactive codebase map')
  })

  it('clamps runtime mode to static after runtime data becomes absent', () => {
    const onClearRuntime = vi.fn()
    renderAtlas({ atlas, runtime, initialMode: 'runtime', onClearRuntime })
    harness.state.runtimeLensProps!.onClearRuntime()
    expect(onClearRuntime).toHaveBeenCalledOnce()

    renderAtlas({ atlas })
    expect(harness.state.renderers).toHaveLength(0)
    renderAtlas({ atlas })

    expect(harness.state.runtimeLensProps).toBeNull()
    expect(harness.state.headerProps?.onShowRuntime).toBeUndefined()
    expect(harness.state.canvasProps?.['aria-label']).toContain('Interactive codebase map')
    expect(harness.state.renderers).toHaveLength(1)
  })
})
