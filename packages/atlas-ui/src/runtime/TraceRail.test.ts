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
      spanIds: ['root', 'child', 'orphan', 'cycle'], rootSpanIds: ['root'], orphanSpanIds: ['orphan'],
      cycleBreakSpanIds: ['cycle'], hotPathSpanIds: ['root', 'child'], errorPaths: [['root', 'child']],
      ...overrides,
    }],
    spans: [
      span('root', 'request', 'root'), span('child', 'database', 'child', 'root', 2),
      span('orphan', 'queue', 'orphan', 'missing'), span('cycle', 'retry', 'cycle-broken', 'child'),
    ],
    report: { documents: 1, resourceScopeGroups: 1, traces: 1, inputSpans: 4, spans: 4, duplicateSpans: 0,
      sampledSpans: 4, unsampledSpans: 0, redactedAttributes: 0, droppedAttributesCount: '0',
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
    const rendered = TraceRail({ view, selectedSpanId: null, onSelectSpan: vi.fn() })
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
    const elements = walk(TraceRail({ view, selectedSpanId: null, onSelectSpan }))

    button(elements, 'Select database span child in call tree')?.props.onClick()
    button(elements, 'Select database span child in hot path')?.props.onClick()
    button(elements, 'Select database span child in error path 1')?.props.onClick()

    expect(onSelectSpan.mock.calls.map((call) => call[0])).toEqual(['child', 'child', 'child'])
  })

  it('shows safe empty path states without hiding orphan and cycle-broken groups', () => {
    const input = bundle({ rootSpanIds: [], hotPathSpanIds: [], errorPaths: [] })
    input.spans[1] = { ...input.spans[1]!, status: { code: 0 } }
    const view = buildRuntimeView(input, TRACE_ID, { service: null, status: 'all', minDurationNano: '0', errorsOnly: false })
    const content = text(TraceRail({ view, selectedSpanId: null, onSelectSpan: vi.fn() }))

    expect(content).toContain('No recorded root spans are available.')
    expect(content).toContain('No hot path is available because this trace has no true recorded root.')
    expect(content).toContain('No recorded error paths.')
    expect(content).toContain('queue (orphan)')
    expect(content).toContain('retry (cycle)')
  })

  it('provides labeled native controls for hot-path and error-path actions', () => {
    const view = buildRuntimeView(bundle(), TRACE_ID, { service: null, status: 'all', minDurationNano: '0', errorsOnly: false })
    const elements = walk(TraceRail({ view, selectedSpanId: 'child', onSelectSpan: vi.fn() }))

    expect(button(elements, 'Show hot path')?.props.type).toBe('button')
    expect(button(elements, 'Show error paths')?.props.type).toBe('button')
    expect(button(elements, 'Select database span child in call tree')?.props['aria-pressed']).toBe(true)
  })
})
