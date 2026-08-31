import { describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import type { RuntimeTraceBundle } from '@codeville/core'
import { TraceRail } from './TraceRail.js'
import { buildRuntimeView } from './view-model.js'

type AnyElement = ReactElement<Record<string, any>>

const TRACE_ID = '11111111111111111111111111111111'

function span(spanId: string, name: string, relation: RuntimeTraceBundle['spans'][number]['relation'], parentSpanId?: string, status = 0): RuntimeTraceBundle['spans'][number] {
  return {
    traceId: TRACE_ID, spanId, ...(parentSpanId === undefined ? {} : { parentSpanId }), flags: 0, sampled: true,
    name, kind: 1, startTimeUnixNano: '0', endTimeUnixNano: '10', durationNano: '10',
    attributes: [], droppedAttributesCount: '0', events: [], droppedEventsCount: '0', links: [], droppedLinksCount: '0',
    status: { code: status }, resource: { attributes: [], droppedAttributesCount: '0' },
    scope: { attributes: [], droppedAttributesCount: '0' }, relation,
  }
}

function bundle(overrides: Partial<RuntimeTraceBundle['traces'][number]> = {}): RuntimeTraceBundle {
  return {
    version: 1, format: 'otlp-json',
    traces: [{
      traceId: TRACE_ID, startTimeUnixNano: '0', endTimeUnixNano: '10',
      spanIds: ['root', 'child', 'orphan', 'orphan-child', 'cycle', 'cycle-child'], rootSpanIds: ['root'], orphanSpanIds: ['orphan'],
      cycleBreakSpanIds: ['cycle'], hotPathSpanIds: ['root', 'child'], errorPaths: [['root', 'child']],
      ...overrides,
    }],
    spans: [
      span('root', 'request', 'root'), span('child', 'database', 'child', 'root', 2),
      span('orphan', 'queue', 'orphan', 'missing'), span('orphan-child', 'orphan child', 'child', 'orphan'),
      span('cycle', 'retry', 'cycle-broken', 'child'), span('cycle-child', 'cycle child', 'child', 'cycle'),
    ],
    report: { documents: 1, resourceScopeGroups: 1, traces: 1, inputSpans: 6, spans: 6, duplicateSpans: 0,
      sampledSpans: 6, unsampledSpans: 0, redactedAttributes: 0, droppedAttributesCount: '0',
      droppedEventsCount: '0', droppedLinksCount: '0', unknownFieldCount: 0, unknownFields: [] },
  }
}

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

function button(elements: AnyElement[], label: string): AnyElement | undefined {
  return elements.find((element) => element.type === 'button' && element.props['aria-label'] === label)
}

describe('TraceRail', () => {
  it('keeps recorded roots, orphans, cycle breaks, hot path, and error ancestry separate', () => {
    const view = buildRuntimeView(bundle(), TRACE_ID, { service: null, status: 'all', minDurationNano: '0', errorsOnly: false })
    const rendered = TraceRail({ view, selection: null, onSelectSpan: vi.fn() })
    const content = text(rendered)

    expect(content).toContain('Recorded call tree')
    expect(content).toContain('Recorded orphan spans')
    expect(content).toContain('Cycle-broken spans')
    expect(content).toContain('Hot path')
    expect(content).toContain('Recorded error ancestry')
    expect(content).toContain('request (root)')
    expect(content).toContain('queue (orphan)')
    expect(content).toContain('retry (cycle)')
    expect(content).toContain('Hot path is the greatest sum of recorded span durations; it is not causal proof.')
  })

  it('selects the same exact span from tree, hot-path, and error-path controls', () => {
    const onSelectSpan = vi.fn()
    const view = buildRuntimeView(bundle(), TRACE_ID, { service: null, status: 'all', minDurationNano: '0', errorsOnly: false })
    const elements = walk(TraceRail({ view, selection: null, onSelectSpan }))

    button(elements, 'Select database span child in call tree')?.props.onClick()
    button(elements, 'Select database span child in hot path')?.props.onClick()
    button(elements, 'Select database span child in error path 1')?.props.onClick()

    expect(onSelectSpan.mock.calls.map((call) => call[0])).toEqual([
      { traceId: TRACE_ID, spanId: 'child' },
      { traceId: TRACE_ID, spanId: 'child' },
      { traceId: TRACE_ID, spanId: 'child' },
    ])
  })

  it('shows safe empty path states without hiding orphan and cycle-broken groups', () => {
    const input = bundle({ rootSpanIds: [], hotPathSpanIds: [], errorPaths: [] })
    input.spans[1] = { ...input.spans[1]!, status: { code: 0 } }
    const view = buildRuntimeView(input, TRACE_ID, { service: null, status: 'all', minDurationNano: '0', errorsOnly: false })
    const content = text(TraceRail({ view, selection: null, onSelectSpan: vi.fn() }))

    expect(content).toContain('No recorded root spans are available.')
    expect(content).toContain('No hot path is available because this trace has no true recorded root.')
    expect(content).toContain('No recorded error paths.')
    expect(content).toContain('queue (orphan)')
    expect(content).toContain('retry (cycle)')
  })

  it('provides labeled native controls for hot-path and error-path actions', () => {
    const view = buildRuntimeView(bundle(), TRACE_ID, { service: null, status: 'all', minDurationNano: '0', errorsOnly: false })
    const elements = walk(TraceRail({ view, selection: { traceId: TRACE_ID, spanId: 'child' }, onSelectSpan: vi.fn() }))

    expect(button(elements, 'Show hot path')?.props.type).toBe('button')
    expect(button(elements, 'Show error paths')?.props.type).toBe('button')
    expect(button(elements, 'Select database span child in call tree')?.props['aria-pressed']).toBe(true)
  })

  it('scopes selected state to the exact trace and span identity', () => {
    const view = buildRuntimeView(bundle(), TRACE_ID, { service: null, status: 'all', minDurationNano: '0', errorsOnly: false })
    const selected = walk(TraceRail({ view, selection: { traceId: TRACE_ID, spanId: 'child' }, onSelectSpan: vi.fn() }))
    const otherTrace = walk(TraceRail({ view, selection: { traceId: '22222222222222222222222222222222', spanId: 'child' }, onSelectSpan: vi.fn() }))
    expect(button(selected, 'Select database span child in call tree')?.props['aria-pressed']).toBe(true)
    expect(button(otherTrace, 'Select database span child in call tree')?.props['aria-pressed']).toBe(false)
  })

  it('renders recursive normal children below orphan and cycle-broken roots', () => {
    const view = buildRuntimeView(bundle(), TRACE_ID, { service: null, status: 'all', minDurationNano: '0', errorsOnly: false })
    const elements = walk(TraceRail({ view, selection: null, onSelectSpan: vi.fn() }))
    expect(button(elements, 'Select orphan child span orphan-child in orphan group')).toBeDefined()
    expect(button(elements, 'Select cycle child span cycle-child in cycle-broken group')).toBeDefined()
  })

  it('projects enabled tree, hot-path, and error-path actions through active filters', () => {
    const onSelectSpan = vi.fn()
    const view = buildRuntimeView(bundle(), TRACE_ID, { service: null, status: 'error', minDurationNano: '0', errorsOnly: false })
    const elements = walk(TraceRail({ view, selection: null, onSelectSpan }))

    expect(button(elements, 'Select request span root in call tree')).toBeUndefined()
    expect(button(elements, 'Select database span child in call tree')).toBeDefined()
    button(elements, 'Show hot path')?.props.onClick()
    button(elements, 'Show error paths')?.props.onClick()
    expect(onSelectSpan.mock.calls.map((call) => call[0])).toEqual([
      { traceId: TRACE_ID, spanId: 'child' },
      { traceId: TRACE_ID, spanId: 'child' },
    ])
  })

  it('uses the exact non-causal error-path evidence sentence', () => {
    const view = buildRuntimeView(bundle(), TRACE_ID, { service: null, status: 'all', minDurationNano: '0', errorsOnly: false })
    expect(text(TraceRail({ view, selection: null, onSelectSpan: vi.fn() }))).toContain(
      'Error path is a recorded error span and its known parent ancestry. It is not a root-cause claim.',
    )
  })

  it('uses a shallow accessible tree with explicit depth', () => {
    const view = buildRuntimeView(bundle(), TRACE_ID, { service: null, status: 'all', minDurationNano: '0', errorsOnly: false })
    const elements = walk(TraceRail({ view, selection: null, onSelectSpan: vi.fn() }))
    const tree = elements.find((element) => element.type === 'ol' && element.props['aria-label'] === 'Recorded call tree')
    const items = tree === undefined
      ? []
      : walk(tree.props.children).filter((element) => element.props.role === 'treeitem')

    expect(tree?.props.role).toBe('tree')
    expect(items.map((item) => item.props['aria-level'])).toEqual([1, 2])
    expect(items.every((item) => walk(item.props.children).every((child) => child.type !== 'ol'))).toBe(true)
  })

  it.each(['deep', 'wide'] as const)('renders an accepted 20,000-span %s tree without recursion', (shape) => {
    const count = 20_000
    const spans = Array.from({ length: count }, (_, index) => {
      const spanId = `span-${index}`
      const parentSpanId = index === 0
        ? undefined
        : shape === 'deep' ? `span-${index - 1}` : 'span-0'
      return span(spanId, spanId, index === 0 ? 'root' : 'child', parentSpanId)
    })
    const input: RuntimeTraceBundle = {
      version: 1,
      format: 'otlp-json',
      traces: [{
        traceId: TRACE_ID,
        startTimeUnixNano: '0',
        endTimeUnixNano: '10',
        spanIds: spans.map((item) => item.spanId),
        rootSpanIds: ['span-0'],
        orphanSpanIds: [],
        cycleBreakSpanIds: [],
        hotPathSpanIds: [],
        errorPaths: [],
      }],
      spans,
      report: {
        documents: 1, resourceScopeGroups: 1, traces: 1, inputSpans: count, spans: count, duplicateSpans: 0,
        sampledSpans: count, unsampledSpans: 0, redactedAttributes: 0, droppedAttributesCount: '0',
        droppedEventsCount: '0', droppedLinksCount: '0', unknownFieldCount: 0, unknownFields: [],
      },
    }
    const view = buildRuntimeView(input, TRACE_ID, { service: null, status: 'all', minDurationNano: '0', errorsOnly: false })

    expect(() => TraceRail({ view, selection: null, onSelectSpan: vi.fn() })).not.toThrow()
    expect(view.callTreeRows).toHaveLength(count)
  })
})
