import { describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import type { RuntimeTraceBundle } from '@codeville/core'
import { RuntimeInspector, type RuntimeInspectorTab } from './RuntimeInspector.js'

type AnyElement = ReactElement<Record<string, any>>
const TRACE_ID = '11111111111111111111111111111111'

const matchedSpan: RuntimeTraceBundle['spans'][number] = {
  traceId: TRACE_ID, spanId: 'aaaaaaaaaaaaaaaa', parentSpanId: 'bbbbbbbbbbbbbbbb', traceState: 'vendor=value', flags: 257,
  sampled: true, name: '<script>database</script>', kind: 3, startTimeUnixNano: '100', endTimeUnixNano: '220', durationNano: '120',
  attributes: [{ key: 'db.system', value: { type: 'string', value: '<postgres>' } }, { key: 'retry', value: { type: 'int', value: '2' } }],
  droppedAttributesCount: '4',
  events: [{ timeUnixNano: '150', name: '<timeout>', attributes: [{ key: 'attempt', value: { type: 'int', value: '2' } }], droppedAttributesCount: '1' }],
  droppedEventsCount: '5',
  links: [{ traceId: '22222222222222222222222222222222', spanId: 'cccccccccccccccc', traceState: 'link=value', flags: 1,
    attributes: [{ key: 'link.kind', value: { type: 'string', value: 'follows' } }], droppedAttributesCount: '2' }],
  droppedLinksCount: '6', status: { code: 2, message: '<failed>' },
  resource: { schemaUrl: 'https://schema.example/resource', attributes: [{ key: 'service.name', value: { type: 'string', value: 'api' } }], droppedAttributesCount: '7' },
  scope: { schemaUrl: 'https://schema.example/scope', name: 'instrumentation', version: '1.2.3',
    attributes: [{ key: 'scope.key', value: { type: 'bool', value: true } }], droppedAttributesCount: '8' },
  relation: 'child', source: { nodeId: 'file:src/api.ts', path: 'src/api.ts', recordedPath: '/repo/src/api.ts', functionName: 'handler', lineNumber: '42', kind: 'exact-file' },
}

const bundle: RuntimeTraceBundle = {
  version: 1, format: 'otlp-json',
  traces: [{ traceId: TRACE_ID, startTimeUnixNano: '100', endTimeUnixNano: '220', spanIds: [matchedSpan.spanId], rootSpanIds: [], orphanSpanIds: [], cycleBreakSpanIds: [], hotPathSpanIds: [], errorPaths: [] }],
  spans: [matchedSpan],
  report: { documents: 1, resourceScopeGroups: 1, traces: 1, inputSpans: 1, spans: 1, duplicateSpans: 0, sampledSpans: 1, unsampledSpans: 0,
    redactedAttributes: 0, droppedAttributesCount: '4', droppedEventsCount: '5', droppedLinksCount: '6', unknownFieldCount: 0, unknownFields: [] },
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

function render(tab: RuntimeInspectorTab, span: RuntimeTraceBundle['spans'][number] | null = matchedSpan, onOpenSource = vi.fn()) {
  return RuntimeInspector({ span, trace: bundle.traces[0]!, bundle, tab, onTab: vi.fn(), onSelectSpan: vi.fn(), onOpenSource })
}

describe('RuntimeInspector', () => {
  it('shows exact identity, timing, recorded status, sampling, relation, and dropped counts', () => {
    const content = text(render('span'))
    expect(content).toContain(`Trace ID: ${TRACE_ID}`)
    expect(content).toContain('Span ID: aaaaaaaaaaaaaaaa')
    expect(content).toContain('Recorded parent span ID: bbbbbbbbbbbbbbbb')
    expect(content).toContain('Trace state: vendor=value')
    expect(content).toContain('Flags: 257')
    expect(content).toContain('Sampled: yes')
    expect(content).toContain('Kind: 3')
    expect(content).toContain('Start time: 100 ns')
    expect(content).toContain('End time: 220 ns')
    expect(content).toContain('Duration: 120 ns')
    expect(content).toContain('Status code: 2 (error)')
    expect(content).toContain('Status message: <failed>')
    expect(content).toContain('Recorded relation: child')
    expect(content).toContain('Dropped span attributes: 4')
    expect(content).toContain('Dropped events: 5')
    expect(content).toContain('Dropped links: 6')
  })

  it('shows every recorded resource, scope, attribute, event, and link fact as React text', () => {
    const content = (['span', 'resource', 'scope', 'attributes', 'events', 'links'] as const).map((tab) => text(render(tab))).join('\n')
    expect(content).toContain('Resource schema URL: https://schema.example/resource')
    expect(content).toContain('service.name: api')
    expect(content).toContain('Dropped resource attributes: 7')
    expect(content).toContain('Scope schema URL: https://schema.example/scope')
    expect(content).toContain('Scope name: instrumentation')
    expect(content).toContain('Scope version: 1.2.3')
    expect(content).toContain('scope.key: true')
    expect(content).toContain('Dropped scope attributes: 8')
    expect(content).toContain('db.system: <postgres>')
    expect(content).toContain('retry: 2')
    expect(content).toContain('Event 1: <timeout>')
    expect(content).toContain('Event time: 150 ns')
    expect(content).toContain('attempt: 2')
    expect(content).toContain('Dropped event attributes: 1')
    expect(content).toContain('Linked trace ID: 22222222222222222222222222222222')
    expect(content).toContain('Linked span ID: cccccccccccccccc')
    expect(content).toContain('Link trace state: link=value')
    expect(content).toContain('Link flags: 1')
    expect(content).toContain('link.kind: follows')
    expect(content).toContain('Dropped link attributes: 2')
    expect(content).toContain('<script>database</script>')
  })

  it('keeps exact trace and span identity visible on every inspector tab', () => {
    for (const tab of ['span', 'resource', 'scope', 'attributes', 'events', 'links'] as const) {
      const content = text(render(tab))
      expect(content).toContain(`Trace ID: ${TRACE_ID}`)
      expect(content).toContain('Span ID: aaaaaaaaaaaaaaaa')
    }
  })

  it('opens only the exact matched source node ID', () => {
    const open = vi.fn()
    const elements = walk(render('span', matchedSpan, open))
    const source = elements.find((element) => element.type === 'button' && element.props.children === 'Open matched source')
    expect(source?.props.type).toBe('button')
    source?.props.onClick()
    expect(open).toHaveBeenCalledWith('file:src/api.ts')

    const unmatched = { ...matchedSpan, source: undefined }
    expect(walk(render('span', unmatched, open)).some((element) => element.type === 'button' && element.props.children === 'Open matched source')).toBe(false)
  })

  it('offers labeled native tab controls and a safe no-selection state', () => {
    const elements = walk(render('span'))
    for (const label of ['Span details', 'Resource', 'Scope', 'Attributes', 'Events', 'Links']) {
      const tab = elements.find((element) => element.type === 'button' && element.props.children === label)
      expect(tab?.props.type).toBe('button')
      expect(tab?.props.role).toBe('tab')
    }
    expect(text(render('span', null))).toContain('Select a recorded span to inspect its exact evidence.')
  })
})
