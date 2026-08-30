import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import type { Atlas, RuntimeTraceBundle } from '@codeville/core'

type AnyElement = ReactElement<Record<string, any>>

const harness = vi.hoisted(() => {
  const slots: Array<{ value?: any; deps?: unknown[]; cleanup?: (() => void) | void }> = []
  let cursor = 0
  const pending: number[] = []
  const state = { timelineProps: null as Record<string, any> | null }
  function sameDeps(left?: unknown[], right?: unknown[]) {
    return left !== undefined && right !== undefined && left.length === right.length && right.every((value, index) => Object.is(value, left[index]))
  }
  return {
    state,
    begin() { cursor = 0; pending.length = 0 },
    commit() {
      while (pending.length > 0) {
        const index = pending.shift()!
        const slot = slots[index]!
        if (slot.cleanup) slot.cleanup()
        slot.cleanup = slot.value!()
      }
    },
    reset() { slots.length = 0; cursor = 0; pending.length = 0; state.timelineProps = null },
    useState<T>(initial: T | (() => T)) {
      const index = cursor++
      let slot = slots[index]
      if (!slot) { slot = { value: typeof initial === 'function' ? (initial as () => T)() : initial }; slots[index] = slot }
      return [slot.value as T, (next: T | ((current: T) => T)) => {
        slot!.value = typeof next === 'function' ? (next as (current: T) => T)(slot!.value as T) : next
      }] as const
    },
    useMemo<T>(factory: () => T, deps: unknown[]) {
      const index = cursor++
      let slot = slots[index]
      if (!slot || !sameDeps(slot.deps, deps)) { slot = { value: factory(), deps: [...deps] }; slots[index] = slot }
      return slot.value as T
    },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const index = cursor++
      const previous = slots[index]
      if (!previous || !sameDeps(previous.deps, deps)) {
        slots[index] = { value: effect, deps: [...deps], cleanup: previous?.cleanup }
        pending.push(index)
      }
    },
    useCallback<T extends (...args: any[]) => any>(callback: T, deps: unknown[]) {
      return this.useMemo(() => callback, deps)
    },
  }
})

vi.mock('react', () => ({
  useState: harness.useState,
  useMemo: harness.useMemo,
  useEffect: harness.useEffect,
  useCallback: <T extends (...args: any[]) => any>(callback: T, deps: unknown[]) => harness.useMemo(() => callback, deps),
}))

vi.mock('./Timeline.js', () => ({ Timeline: (props: Record<string, any>) => {
  harness.state.timelineProps = props
  return { type: 'div', props: { children: `Timeline selection: ${props.selectedSpanId ?? 'none'}` } }
} }))

const atlas: Atlas = {
  repo: { name: 'fixture', generatedAt: '', note: '' },
  stats: { nodes: 1, sourceFiles: 1, lines: 1, links: 0, packages: 0 },
  areas: [{ id: 'src', label: 'Source', color: '#aaa', count: 1 }],
  nodes: [{ id: 'file:src/api.ts', label: 'api.ts', path: 'src/api.ts', kind: 'file', area: 'src', role: 'module', contributes: [], lines: 1, bytes: 1, excerpt: [], in: 0, out: 0, x: 0, y: 0, h: 1 }],
  links: [],
  coverage: { exactFiles: 1, heuristicFiles: 0, unsupportedFiles: 0, failedFiles: 0, importFacts: 0, internalFacts: 0,
    externalFacts: 0, systemFacts: 0, unresolvedFacts: 0, ignoredFacts: 0, rolledUpFiles: 0, hiddenExternals: 0 },
}

const TRACE_ONE = '11111111111111111111111111111111'
const TRACE_TWO = '22222222222222222222222222222222'

function runtimeSpan(traceId: string, spanId: string, name: string, service: string, status: number, start: string, duration: string, relation: RuntimeTraceBundle['spans'][number]['relation'], parentSpanId?: string): RuntimeTraceBundle['spans'][number] {
  return {
    traceId, spanId, ...(parentSpanId === undefined ? {} : { parentSpanId }), flags: 1, sampled: spanId !== 'orphan', name, kind: 1,
    startTimeUnixNano: start, endTimeUnixNano: (BigInt(start) + BigInt(duration)).toString(), durationNano: duration,
    attributes: spanId === 'root' ? [{ key: 'code.file.path', value: { type: 'string', value: 'src/api.ts' } }] : [],
    droppedAttributesCount: '0', events: [], droppedEventsCount: '0', links: [], droppedLinksCount: '0', status: { code: status },
    resource: { attributes: [{ key: 'service.name', value: { type: 'string', value: service } }], droppedAttributesCount: '0' },
    scope: { attributes: [], droppedAttributesCount: '0' }, relation,
    ...(spanId === 'root' ? { source: { nodeId: 'file:src/api.ts', path: 'src/api.ts', recordedPath: 'src/api.ts', kind: 'exact-file' as const } } : {}),
  }
}

function runtimeBundle(): RuntimeTraceBundle {
  return {
    version: 1, format: 'otlp-json',
    traces: [
      { traceId: TRACE_ONE, startTimeUnixNano: '1000', endTimeUnixNano: '5000', spanIds: ['root', 'child', 'orphan', 'cycle'],
        rootSpanIds: ['root'], orphanSpanIds: ['orphan'], cycleBreakSpanIds: ['cycle'], hotPathSpanIds: ['root', 'child'], errorPaths: [['root', 'child']] },
      { traceId: TRACE_TWO, startTimeUnixNano: '9000', endTimeUnixNano: '9100', spanIds: ['second'], rootSpanIds: ['second'], orphanSpanIds: [], cycleBreakSpanIds: [], hotPathSpanIds: ['second'], errorPaths: [] },
    ],
    spans: [
      runtimeSpan(TRACE_ONE, 'root', 'GET /users', 'api', 0, '1000', '2000', 'root'),
      runtimeSpan(TRACE_ONE, 'child', 'database', 'db', 2, '1500', '500', 'child', 'root'),
      runtimeSpan(TRACE_ONE, 'orphan', 'queue', 'worker', 0, '3000', '1000', 'orphan', 'missing'),
      runtimeSpan(TRACE_ONE, 'cycle', 'retry', 'worker', 0, '4000', '100', 'cycle-broken', 'child'),
      runtimeSpan(TRACE_TWO, 'second', 'health', 'api', 1, '9000', '100', 'root'),
    ],
    report: {
      documents: 2, resourceScopeGroups: 2, traces: 2, inputSpans: 7, spans: 5, duplicateSpans: 2,
      sampledSpans: 4, unsampledSpans: 1, redactedAttributes: 3,
      droppedAttributesCount: '4', droppedEventsCount: '5', droppedLinksCount: '6',
      unknownFieldCount: 7, unknownFields: [{ path: 'resourceSpans[0].mystery', count: 7 }], unmatchedSourceSpans: 8,
      compatibilityWarnings: [
        { code: 'deprecated-runtime-source-attribute', attribute: 'code.filepath' },
        { code: 'deprecated-runtime-source-attribute', attribute: 'code.function' },
        { code: 'deprecated-runtime-source-attribute', attribute: 'code.lineno' },
      ],
    },
  }
}

let RuntimeLens: typeof import('./RuntimeLens.js').RuntimeLens

beforeAll(async () => { RuntimeLens = (await import('./RuntimeLens.js')).RuntimeLens })
beforeEach(() => harness.reset())

function walk(value: ReactNode, seen: AnyElement[] = []): AnyElement[] {
  if (value == null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return seen
  if (Array.isArray(value)) { for (const child of value) walk(child, seen); return seen }
  if (typeof value !== 'object' || !('type' in value)) return seen
  const element = value as AnyElement
  seen.push(element)
  if (typeof element.type === 'function') walk((element.type as (props: Record<string, any>) => ReactNode)(element.props), seen)
  else walk(element.props.children, seen)
  return seen
}

function text(value: ReactNode): string {
  if (value == null || typeof value === 'boolean') return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(text).join('')
  if (typeof value === 'object' && 'type' in value) {
    const element = value as AnyElement
    return typeof element.type === 'function' ? text((element.type as (props: Record<string, any>) => ReactNode)(element.props)) : text(element.props.children)
  }
  return ''
}

function render(runtime: RuntimeTraceBundle = runtimeBundle(), overrides: Partial<Parameters<typeof RuntimeLens>[0]> = {}) {
  const props: Parameters<typeof RuntimeLens>[0] = {
    atlas, runtime, onShowStatic: vi.fn(), onOpenSource: vi.fn(), onClearRuntime: vi.fn(), ...overrides,
  }
  harness.begin()
  const value = RuntimeLens(props)
  harness.commit()
  return { value, elements: walk(value), props }
}

function button(elements: AnyElement[], label: string): AnyElement | undefined {
  return elements.find((element) => element.type === 'button' && (text(element.props.children) === label || element.props['aria-label'] === label))
}

describe('RuntimeLens', () => {
  it('renders the exact truth labels, summary counts, and every non-zero completeness warning', () => {
    const { value } = render()
    const content = text(value)
    expect(content).toContain('Observed in imported trace data; this view may be incomplete.')
    expect(content).toContain('Hot path is the greatest sum of recorded span durations; it is not causal proof.')
    expect(content).toContain(`Trace ID: ${TRACE_ONE}`)
    expect(content).toContain('Recorded spans: 4')
    expect(content).toContain('Recorded time: 4,000 ns')
    expect(content).toContain('Services: 3')
    expect(content).toContain('Recorded errors: 1')
    expect(content).toContain('Sampling: 4 sampled spans; 1 unsampled span.')
    expect(content).toContain('OTLP dropped attributes: 4')
    expect(content).toContain('OTLP dropped events: 5')
    expect(content).toContain('OTLP dropped links: 6')
    expect(content).toContain('Unknown fields: 7')
    expect(content).toContain('Exact duplicate spans removed: 2')
    expect(content).toContain('Deprecated source attributes: code.filepath, code.function, code.lineno')
    expect(content).toContain('Recorded orphan spans: 1')
    expect(content).toContain('Cycle breaks: 1')
    expect(content).toContain('Redacted attributes: 3')
    expect(content).toContain('Unmatched recorded sources: 8')
  })

  it('shows a safe empty-bundle state with static and clear actions', () => {
    const empty = runtimeBundle()
    empty.traces = []
    empty.spans = []
    empty.report = { ...empty.report, traces: 0, spans: 0, inputSpans: 0, sampledSpans: 0, unsampledSpans: 0,
      duplicateSpans: 0, redactedAttributes: 0, droppedAttributesCount: '0', droppedEventsCount: '0', droppedLinksCount: '0', unknownFieldCount: 0,
      unknownFields: [], unmatchedSourceSpans: 0, compatibilityWarnings: [] }
    const clear = vi.fn()
    const showStatic = vi.fn()
    const { value, elements } = render(empty, { onClearRuntime: clear, onShowStatic: showStatic })
    expect(text(value)).toContain('No imported runtime traces are available.')
    button(elements, 'Show static atlas')?.props.onClick()
    button(elements, 'Clear runtime data')?.props.onClick()
    expect(showStatic).toHaveBeenCalledOnce()
    expect(clear).toHaveBeenCalledOnce()
  })

  it('synchronizes an explicit span selection across rail, timeline, and details', () => {
    const first = render()
    expect(harness.state.timelineProps?.selectedSpanId).toBeNull()
    button(first.elements, 'Select database span child in call tree')?.props.onClick()

    const selected = render()
    expect(harness.state.timelineProps?.selectedSpanId).toBe('child')
    expect(text(selected.value)).toContain('Span ID: child')
    expect(text(selected.value)).toContain('Selected span child: database.')

    harness.state.timelineProps?.onSelectSpan('root')
    const canvasSelected = render()
    expect(harness.state.timelineProps?.selectedSpanId).toBe('root')
    expect(text(canvasSelected.value)).toContain('Span ID: root')
  })

  it('clamps a filtered selection to null without changing trace evidence', () => {
    const first = render()
    button(first.elements, 'Select database span child in call tree')?.props.onClick()
    render()
    const filters = render()
    const service = filters.elements.find((element) => element.type === 'select' && element.props.id === 'cv-runtime-service-filter')
    service?.props.onChange({ currentTarget: { value: 'api' } })
    render()
    const clamped = render()
    expect(harness.state.timelineProps?.selectedSpanId).toBeNull()
    expect(text(clamped.value)).toContain('No recorded span is selected.')
    expect(runtimeBundle().traces[0]!.spanIds).toEqual(['root', 'child', 'orphan', 'cycle'])
  })

  it('provides native labeled navigation, filters, clear, and footer actions with polite status', () => {
    const clear = vi.fn()
    const { elements, value } = render(runtimeBundle(), { onClearRuntime: clear, footerActions: { type: 'button', props: { type: 'button', children: 'Export evidence' } } as ReactElement })
    for (const label of ['Show static atlas', 'Clear runtime data', 'Previous trace', 'Next trace', 'Show hot path', 'Show error paths']) {
      expect(button(elements, label)?.props.type).toBe('button')
    }
    expect(elements.find((element) => element.type === 'select' && element.props.id === 'cv-runtime-service-filter')).toBeDefined()
    expect(elements.find((element) => element.type === 'select' && element.props.id === 'cv-runtime-status-filter')).toBeDefined()
    expect(elements.find((element) => element.type === 'input' && element.props.id === 'cv-runtime-duration-filter' && element.props.type === 'number')).toBeDefined()
    expect(elements.find((element) => element.type === 'input' && element.props.id === 'cv-runtime-errors-filter' && element.props.type === 'checkbox')).toBeDefined()
    expect(elements.some((element) => element.props.role === 'status' && element.props['aria-live'] === 'polite')).toBe(true)
    expect(text(value)).toContain('Export evidence')
    button(elements, 'Clear runtime data')?.props.onClick()
    expect(clear).toHaveBeenCalledOnce()
  })

  it('moves between traces with labeled buttons and resets selection explicitly', () => {
    const first = render()
    expect(button(first.elements, 'Previous trace')?.props.disabled).toBe(true)
    button(first.elements, 'Next trace')?.props.onClick()
    const second = render()
    expect(text(second.value)).toContain(`Trace ID: ${TRACE_TWO}`)
    expect(harness.state.timelineProps?.selectedSpanId).toBeNull()
    expect(button(second.elements, 'Next trace')?.props.disabled).toBe(true)
    button(second.elements, 'Previous trace')?.props.onClick()
    expect(text(render().value)).toContain(`Trace ID: ${TRACE_ONE}`)
  })

  it('announces a changed completeness state through the polite status node', () => {
    const initial = runtimeBundle()
    render(initial)
    const changed = { ...initial, report: { ...initial.report, redactedAttributes: 9 } }
    render(changed)
    const announced = render(changed)
    const live = announced.elements.find((element) => element.props.role === 'status')
    expect(text(live?.props.children)).toContain('Runtime completeness changed: 9 redacted attributes.')
  })
})
