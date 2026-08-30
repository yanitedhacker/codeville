import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import type { RuntimeTraceBundle } from '@codeville/core'
import { buildRuntimeView } from './view-model.js'

type AnyElement = ReactElement<Record<string, any>>

const harness = vi.hoisted(() => {
  const fakeCanvas = { clientWidth: 800, clientHeight: 240, width: 0, height: 0, style: {}, getContext: () => ({}) }
  const cleanups: Array<() => void> = []
  let refOrdinal = 0
  const state = {
    fakeCanvas,
    instances: [] as Array<Record<string, ReturnType<typeof vi.fn>>>,
    resizeObservers: [] as Array<{ callback: ResizeObserverCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>,
  }
  return {
    state,
    reset() { refOrdinal = 0; cleanups.length = 0; state.instances.length = 0; state.resizeObservers.length = 0 },
    begin() { refOrdinal = 0 },
    cleanup() { for (const cleanup of cleanups.splice(0)) cleanup() },
    useRef<T>(initial: T) {
      const current = refOrdinal++ === 0 ? fakeCanvas : initial
      return { current } as { current: T }
    },
    useEffect(effect: () => void | (() => void)) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup) },
  }
})

vi.mock('react', () => ({ useRef: harness.useRef, useEffect: harness.useEffect }))
vi.mock('./TimelineRenderer.js', () => ({
  TimelineRenderer: class FakeTimelineRenderer {
    resize = vi.fn()
    setView = vi.fn()
    panBy = vi.fn()
    zoomBy = vi.fn()
    resetView = vi.fn()
    spanAt = vi.fn(() => 'child')
    dispose = vi.fn()
    constructor() { harness.state.instances.push(this as unknown as Record<string, ReturnType<typeof vi.fn>>) }
  },
}))

class FakeResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    harness.state.resizeObservers.push(this)
  }
}

vi.stubGlobal('ResizeObserver', FakeResizeObserver)

const TRACE_ID = '11111111111111111111111111111111'
const bundle: RuntimeTraceBundle = {
  version: 1, format: 'otlp-json',
  traces: [{ traceId: TRACE_ID, startTimeUnixNano: '1000', endTimeUnixNano: '5000', spanIds: ['root', 'child', 'orphan'],
    rootSpanIds: ['root'], orphanSpanIds: ['orphan'], cycleBreakSpanIds: [], hotPathSpanIds: ['root', 'child'], errorPaths: [['root', 'child']] }],
  spans: [
    span('root', 'GET /users', '1000', '2000', 2, 'root', undefined, true),
    span('child', 'SQL <users>', '1500', '500', 1, 'child', 'root', false),
    span('orphan', 'queue', '3000', '1000', 0, 'orphan', 'missing'),
  ],
  report: { documents: 1, resourceScopeGroups: 1, traces: 1, inputSpans: 3, spans: 3, duplicateSpans: 0, sampledSpans: 3, unsampledSpans: 0,
    redactedAttributes: 0, droppedAttributesCount: '0', droppedEventsCount: '0', droppedLinksCount: '0', unknownFieldCount: 0, unknownFields: [] },
}

function span(spanId: string, name: string, start: string, duration: string, code: number, relation: RuntimeTraceBundle['spans'][number]['relation'], parentSpanId?: string, matched = false): RuntimeTraceBundle['spans'][number] {
  return {
    traceId: TRACE_ID, spanId, ...(parentSpanId === undefined ? {} : { parentSpanId }), flags: 0, sampled: true, name, kind: 1,
    startTimeUnixNano: start, endTimeUnixNano: (BigInt(start) + BigInt(duration)).toString(), durationNano: duration,
    attributes: matched ? [{ key: 'code.file.path', value: { type: 'string', value: 'src/api.ts' } }] : parentSpanId === 'root' ? [] : [{ key: 'code.filepath', value: { type: 'string', value: 'missing.ts' } }],
    droppedAttributesCount: '0', events: [], droppedEventsCount: '0', links: [], droppedLinksCount: '0', status: { code },
    resource: { attributes: [{ key: 'service.name', value: { type: 'string', value: spanId === 'child' ? 'db' : 'api' } }], droppedAttributesCount: '0' },
    scope: { attributes: [], droppedAttributesCount: '0' }, relation,
    ...(matched ? { source: { nodeId: 'file:src/api.ts', path: 'src/api.ts', recordedPath: 'src/api.ts', kind: 'exact-file' as const } } : {}),
  }
}

let Timeline: typeof import('./Timeline.js').Timeline

beforeAll(async () => { Timeline = (await import('./Timeline.js')).Timeline })
beforeEach(() => harness.reset())

function walk(value: ReactNode, seen: AnyElement[] = []): AnyElement[] {
  if (value == null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return seen
  if (Array.isArray(value)) { for (const child of value) walk(child, seen); return seen }
  if (typeof value !== 'object' || !('type' in value)) return seen
  const element = value as AnyElement
  seen.push(element)
  walk(element.props.children, seen)
  return seen
}

function text(value: ReactNode): string {
  if (value == null || typeof value === 'boolean') return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(text).join('')
  return typeof value === 'object' && 'props' in value ? text((value as AnyElement).props.children) : ''
}

function render(selectedSpanId: string | null, onSelectSpan = vi.fn()) {
  harness.begin()
  const view = buildRuntimeView(bundle, TRACE_ID, { service: null, status: 'all', minDurationNano: '0', errorsOnly: false })
  return { value: Timeline({ view, trace: bundle.traces[0]!, selectedSpanId, onSelectSpan }), view, onSelectSpan }
}

describe('Timeline', () => {
  it('renders the canvas and a complete keyboard-accessible text alternative', () => {
    const { value } = render(null)
    const elements = walk(value)
    const canvas = elements.find((element) => element.type === 'canvas')
    const content = text(value)

    expect(canvas?.props.role).toBe('img')
    expect(canvas?.props.tabIndex).toBe(0)
    expect(canvas?.props['aria-label']).toBe(`Observed span timeline for trace ${TRACE_ID}`)
    expect(canvas?.props['aria-describedby']).toBe('cv-runtime-timeline-help')
    expect(content).toContain('api / GET /users / +0 ns / 2,000 ns / error / recorded root / exact source: src/api.ts')
    expect(content).toContain('db / SQL <users> / +500 ns / 500 ns / ok / recorded parent root / no recorded source')
    expect(content).toContain('api / queue / +2,000 ns / 1,000 ns / unset / recorded parent missing (orphan) / unmatched recorded source')
    const rows = elements.filter((element) => element.type === 'button' && typeof element.props['aria-label'] === 'string' && element.props['aria-label'].startsWith('Select recorded span'))
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.props.type === 'button')).toBe(true)
  })

  it('creates, resizes, updates, and disposes one renderer with explicit selection', () => {
    const { value, view } = render(null)
    const renderer = harness.state.instances[0]!
    expect(renderer.resize).toHaveBeenCalledWith(800, 240)
    expect(renderer.setView).toHaveBeenCalledWith(view, null)
    expect(harness.state.resizeObservers[0]?.observe).toHaveBeenCalledWith(harness.state.fakeCanvas)

    harness.state.fakeCanvas.clientWidth = 640
    harness.state.fakeCanvas.clientHeight = 180
    harness.state.resizeObservers[0]?.callback([], harness.state.resizeObservers[0] as unknown as ResizeObserver)
    expect(renderer.resize).toHaveBeenLastCalledWith(640, 180)

    expect(walk(value).some((element) => element.type === 'canvas')).toBe(true)
    harness.cleanup()
    expect(renderer.dispose).toHaveBeenCalledOnce()
    expect(harness.state.resizeObservers[0]?.disconnect).toHaveBeenCalledOnce()
  })

  it('keeps text, canvas hit selection, pan, zoom, and reset controls synchronized', () => {
    const onSelectSpan = vi.fn()
    const { value } = render('root', onSelectSpan)
    const elements = walk(value)
    const canvas = elements.find((element) => element.type === 'canvas')!
    const renderer = harness.state.instances[0]!
    const capture = vi.fn()

    canvas.props.onPointerDown({ pointerId: 4, clientX: 10, clientY: 20, currentTarget: { setPointerCapture: capture } })
    canvas.props.onPointerMove({ clientX: 30, clientY: 20, nativeEvent: { offsetX: 30, offsetY: 20 } })
    canvas.props.onPointerUp({ clientX: 30, clientY: 20, nativeEvent: { offsetX: 30, offsetY: 20 } })
    expect(capture).toHaveBeenCalledWith(4)
    expect(renderer.panBy).toHaveBeenCalledWith(20)

    canvas.props.onClick({ nativeEvent: { offsetX: 30, offsetY: 20 } })
    expect(renderer.spanAt).toHaveBeenCalledWith(30, 20)
    expect(onSelectSpan).toHaveBeenCalledWith('child')

    const preventDefault = vi.fn()
    canvas.props.onWheel({ deltaY: -1, preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(renderer.zoomBy).toHaveBeenCalledWith(1.25)

    const reset = elements.find((element) => element.type === 'button' && element.props.children === 'Reset timeline view')
    reset?.props.onClick()
    expect(reset?.props.type).toBe('button')
    expect(renderer.resetView).toHaveBeenCalledOnce()

    const row = elements.find((element) => element.props['aria-label'] === 'Select recorded span child')
    row?.props.onClick()
    expect(onSelectSpan).toHaveBeenLastCalledWith('child')
  })
})
