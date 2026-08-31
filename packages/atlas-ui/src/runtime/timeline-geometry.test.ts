import { describe, expect, it } from 'vitest'
import type { RuntimeTraceBundle } from '@codeville/core'
import { layoutTimeline, spanAt } from './timeline-geometry.js'
import { buildRuntimeView } from './view-model.js'

function viewWithEpoch(options: {
  traceStart: string
  traceDuration: string
  spans: Array<{ startOffset: string, duration: string, service: string | null, spanId?: string }>
}) {
  const traceId = '11111111111111111111111111111111'
  const traceEnd = (BigInt(options.traceStart) + BigInt(options.traceDuration)).toString()
  const bundle: RuntimeTraceBundle = {
    version: 1, format: 'otlp-json',
    traces: [{ traceId, startTimeUnixNano: options.traceStart, endTimeUnixNano: traceEnd,
      spanIds: options.spans.map((span, index) => span.spanId ?? `span-${index}`),
      rootSpanIds: [], orphanSpanIds: [], cycleBreakSpanIds: [], hotPathSpanIds: [], errorPaths: [] }],
    spans: options.spans.map((item, index) => {
      const startTimeUnixNano = (BigInt(options.traceStart) + BigInt(item.startOffset)).toString()
      return {
        traceId, spanId: item.spanId ?? `span-${index}`, flags: 0, sampled: true, name: `span ${index}`, kind: 1,
        startTimeUnixNano, endTimeUnixNano: (BigInt(startTimeUnixNano) + BigInt(item.duration)).toString(), durationNano: item.duration,
        attributes: [], droppedAttributesCount: '0', events: [], droppedEventsCount: '0', links: [], droppedLinksCount: '0',
        status: { code: 0 }, resource: { attributes: item.service === null ? [] : [{ key: 'service.name', value: { type: 'string' as const, value: item.service } }], droppedAttributesCount: '0' },
        scope: { attributes: [], droppedAttributesCount: '0' }, relation: 'root' as const,
      }
    }),
    report: { documents: 1, resourceScopeGroups: 1, traces: 1, inputSpans: options.spans.length, spans: options.spans.length,
      duplicateSpans: 0, sampledSpans: options.spans.length, unsampledSpans: 0, redactedAttributes: 0,
      droppedAttributesCount: '0', droppedEventsCount: '0', droppedLinksCount: '0', unknownFieldCount: 0, unknownFields: [] },
  }
  return buildRuntimeView(bundle, traceId, { service: null, status: 'all', minDurationNano: '0', errorsOnly: false })
}

describe('layoutTimeline', () => {
  it('uses relative BigInt deltas for bounded bar geometry', () => {
    const view = viewWithEpoch({
      traceStart: '18446744073709550000', traceDuration: '2000',
      spans: [{ startOffset: '0', duration: '1000', service: 'api' }],
    })
    const layout = layoutTimeline(view, { width: 800, height: 400, zoom: 1, offsetX: 0 })

    expect(layout.bars[0]).toMatchObject({ x: 160, width: 320, lane: 0 })
    expect(layout.bars.every((bar) => Number.isFinite(bar.x + bar.width))).toBe(true)
  })

  it('sorts lanes by service and retains evidence order for filtered bars', () => {
    const view = viewWithEpoch({
      traceStart: '100', traceDuration: '100',
      spans: [
        { spanId: 'first', startOffset: '50', duration: '10', service: 'zeta' },
        { spanId: 'second', startOffset: '0', duration: '10', service: null },
        { spanId: 'third', startOffset: '10', duration: '10', service: 'alpha' },
      ],
    })
    const layout = layoutTimeline(view, { width: 800, height: 400, zoom: 1, offsetX: 0 })

    expect(layout.lanes.map((lane) => lane.serviceName)).toEqual(['(unknown service)', 'alpha', 'zeta'])
    expect(layout.bars.map((bar) => bar.spanId)).toEqual(['first', 'second', 'third'])
    expect(layout.bars.map((bar) => bar.lane)).toEqual([2, 0, 1])
  })

  it('keeps short and zero-duration bars inside the grown content height without non-finite coordinates', () => {
    const view = viewWithEpoch({
      traceStart: '999999999999999999999999999999', traceDuration: '0',
      spans: [{ startOffset: '0', duration: '0', service: 'api' }],
    })
    const layout = layoutTimeline(view, { width: 80, height: 40, zoom: 999, offsetX: 0 })

    expect(layout.bars[0]).toMatchObject({ x: 79, y: 30, width: 1, height: 20 })
    expect(layout.height).toBe(240)
    expect(layout.bars.every((bar) => Number.isFinite(bar.x) && Number.isFinite(bar.width))).toBe(true)
  })

  it('clamps an exact-end point inside the plot and clips intersecting span intervals', () => {
    const view = viewWithEpoch({
      traceStart: '0', traceDuration: '100',
      spans: [
        { spanId: 'right-point', startOffset: '100', duration: '0', service: 'api' },
        { spanId: 'left-point', startOffset: '0', duration: '0', service: 'api' },
        { spanId: 'intersects', startOffset: '90', duration: '20', service: 'api' },
      ],
    })

    expect(layoutTimeline(view, { width: 800, height: 100, zoom: 1, offsetX: 0 }).bars).toEqual([
      expect.objectContaining({ spanId: 'right-point', x: 796, width: 4 }),
      expect.objectContaining({ spanId: 'left-point', x: 160, width: 4 }),
      expect.objectContaining({ spanId: 'intersects', x: 736, width: 64 }),
    ])
    expect(layoutTimeline(view, { width: 800, height: 100, zoom: 1, offsetX: -1000 }).bars).toEqual([])
  })

  it('grows a short viewport and keeps each vertical lane hit target distinct', () => {
    const view = viewWithEpoch({
      traceStart: '0', traceDuration: '100',
      spans: [
        { spanId: 'api', startOffset: '0', duration: '10', service: 'api' },
        { spanId: 'worker', startOffset: '0', duration: '10', service: 'worker' },
        { spanId: 'zeta', startOffset: '0', duration: '10', service: 'zeta' },
      ],
    })
    const layout = layoutTimeline(view, { width: 800, height: 40, zoom: 1, offsetX: 0 })

    expect(layout.height).toBe(240)
    expect(layout.lanes.map((lane) => lane.serviceName)).toEqual(['api', 'worker', 'zeta'])
    expect(layout.bars).toEqual([
      expect.objectContaining({ spanId: 'api', y: 30, height: 20 }),
      expect.objectContaining({ spanId: 'worker', y: 62, height: 20 }),
      expect.objectContaining({ spanId: 'zeta', y: 94, height: 20 }),
    ])
    expect(spanAt(layout, 200, 39)?.spanId).toBe('api')
    expect(spanAt(layout, 200, 70)?.spanId).toBe('worker')
    expect(spanAt(layout, 200, 102)?.spanId).toBe('zeta')
    expect(spanAt(layout, 200, 240)).toBeNull()
  })

  it('returns the topmost last-evidence bar during hit testing', () => {
    const view = viewWithEpoch({
      traceStart: '0', traceDuration: '100',
      spans: [
        { spanId: 'early', startOffset: '0', duration: '100', service: 'api' },
        { spanId: 'late', startOffset: '0', duration: '100', service: 'api' },
      ],
    })
    const layout = layoutTimeline(view, { width: 800, height: 400, zoom: 1, offsetX: 0 })

    expect(spanAt(layout, 200, 34)?.spanId).toBe('late')
  })

  it('keeps an exact-end point hit-testable and uses half-open rectangle edges', () => {
    const view = viewWithEpoch({
      traceStart: '0', traceDuration: '100',
      spans: [{ spanId: 'end', startOffset: '100', duration: '0', service: 'api' }],
    })
    const layout = layoutTimeline(view, { width: 390, height: 100, zoom: 1, offsetX: 0 })
    const bar = layout.bars[0]!

    expect(bar).toMatchObject({ spanId: 'end', x: 386, width: 4 })
    expect(spanAt(layout, 389, bar.y + 1)?.spanId).toBe('end')
    expect(spanAt(layout, 390, bar.y + 1)).toBeNull()
    expect(spanAt(layout, bar.x + 1, bar.y + bar.height)).toBeNull()
  })

  it('grows the content height so eight service lanes are vertically reachable at 390px', () => {
    const view = viewWithEpoch({
      traceStart: '0', traceDuration: '100',
      spans: Array.from({ length: 8 }, (_, index) => ({
        spanId: `service-${index}`,
        startOffset: String(index),
        duration: '10',
        service: `service-${index}`,
      })),
    })
    const layout = layoutTimeline(view, { width: 390, height: 240, zoom: 1, offsetX: 0 })
    const last = layout.bars.find((bar) => bar.spanId === 'service-7')!

    expect(layout.height).toBeGreaterThanOrEqual(280)
    expect(layout.lanes).toHaveLength(8)
    expect(layout.bars).toHaveLength(8)
    expect(last.y + last.height).toBeLessThanOrEqual(layout.height)
    expect(spanAt(layout, last.x + 1, last.y + 1)?.spanId).toBe('service-7')
  })

  it('provides labeled relative-time ticks inside the plot', () => {
    const view = viewWithEpoch({
      traceStart: '18446744073709550000', traceDuration: '100',
      spans: [{ startOffset: '0', duration: '100', service: 'api' }],
    })
    const layout = layoutTimeline(view, { width: 390, height: 240, zoom: 1, offsetX: 0 })

    expect(layout.ticks.map((tick) => tick.label)).toEqual(['+0 ns', '+25 ns', '+50 ns', '+75 ns', '+100 ns'])
    expect(layout.ticks.every((tick) => tick.x >= layout.plotLeft && tick.x < layout.width)).toBe(true)
  })
})
