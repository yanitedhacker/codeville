import { describe, expect, it } from 'vitest'
import type { RuntimeTraceBundle } from '@codeville/core'
import { buildRuntimeView, UNKNOWN_SERVICE } from './view-model.js'

const TRACE_ID = '11111111111111111111111111111111'
const ORIGINAL_SPAN_IDS = ['0000000000000001', '0000000000000002', '0000000000000003', '0000000000000004']

const bundle: RuntimeTraceBundle = {
  version: 1,
  format: 'otlp-json',
  traces: [{
    traceId: TRACE_ID,
    startTimeUnixNano: '18446744073709550000',
    endTimeUnixNano: '18446744073709554000',
    spanIds: ORIGINAL_SPAN_IDS,
    rootSpanIds: ['0000000000000001'],
    orphanSpanIds: ['0000000000000004'],
    cycleBreakSpanIds: [],
    hotPathSpanIds: ['0000000000000001', '0000000000000003'],
    errorPaths: [['0000000000000001', '0000000000000003']],
  }],
  spans: [
    span('0000000000000001', 'root', '18446744073709550000', '1000', 'api', 0),
    span('0000000000000002', 'child ok', '18446744073709551000', '500', 'worker', 1, '0000000000000001'),
    span('0000000000000003', 'child error', '18446744073709552000', '1500', 'api', 2, '0000000000000001'),
    span('0000000000000004', 'unknown', '18446744073709553500', '500', null, 2, 'missing'),
  ],
  report: report(),
}

function report(): RuntimeTraceBundle['report'] {
  return {
    documents: 1, resourceScopeGroups: 1, traces: 1, inputSpans: 4, spans: 4,
    duplicateSpans: 0, sampledSpans: 4, unsampledSpans: 0, redactedAttributes: 0,
    droppedAttributesCount: '0', droppedEventsCount: '0', droppedLinksCount: '0',
    unknownFieldCount: 0, unknownFields: [],
  }
}

function span(
  spanId: string,
  name: string,
  startTimeUnixNano: string,
  durationNano: string,
  service: string | null,
  statusCode: number,
  parentSpanId?: string,
): RuntimeTraceBundle['spans'][number] {
  return {
    traceId: TRACE_ID, spanId, ...(parentSpanId ? { parentSpanId } : {}), flags: 0, sampled: true,
    name, kind: 1, startTimeUnixNano,
    endTimeUnixNano: (BigInt(startTimeUnixNano) + BigInt(durationNano)).toString(), durationNano,
    attributes: [], droppedAttributesCount: '0', events: [], droppedEventsCount: '0', links: [], droppedLinksCount: '0',
    status: { code: statusCode },
    resource: { attributes: service === null ? [] : [{ key: 'service.name', value: { type: 'string', value: service } }], droppedAttributesCount: '0' },
    scope: { attributes: [], droppedAttributesCount: '0' },
    relation: parentSpanId === 'missing' ? 'orphan' : parentSpanId ? 'child' : 'root',
  }
}

describe('buildRuntimeView', () => {
  it('filters visibility without changing evidence order', () => {
    const view = buildRuntimeView(bundle, TRACE_ID, {
      service: 'api', status: 'error', minDurationNano: '1000', errorsOnly: true,
    })

    expect(view.visibleSpanIds).toEqual(['0000000000000003'])
    expect(bundle.traces[0]!.spanIds).toEqual(ORIGINAL_SPAN_IDS)
    expect(view.selectedSpanIds).toEqual(ORIGINAL_SPAN_IDS)
  })

  it('keeps core graph evidence intact while it provides selected-span relations', () => {
    const view = buildRuntimeView(bundle, TRACE_ID, {
      service: null, status: 'all', minDurationNano: '0', errorsOnly: false,
    })

    expect(view.rootSpanIds).toBe(bundle.traces[0]!.rootSpanIds)
    expect(view.orphanSpanIds).toBe(bundle.traces[0]!.orphanSpanIds)
    expect(view.cycleBreakSpanIds).toBe(bundle.traces[0]!.cycleBreakSpanIds)
    expect(view.hotPathSpanIds).toBe(bundle.traces[0]!.hotPathSpanIds)
    expect(view.errorPaths).toBe(bundle.traces[0]!.errorPaths)
    expect(view.ancestorSpanIds('0000000000000003')).toEqual(['0000000000000001'])
    expect(view.descendantSpanIds('0000000000000001')).toEqual(['0000000000000002', '0000000000000003'])
  })

  it('uses an explicit unknown-service label and keeps status filtering exact', () => {
    const view = buildRuntimeView(bundle, TRACE_ID, {
      service: UNKNOWN_SERVICE, status: 'error', minDurationNano: '0', errorsOnly: false,
    })

    expect(view.selectedSpans[3]!.serviceName).toBe(UNKNOWN_SERVICE)
    expect(view.visibleSpanIds).toEqual(['0000000000000004'])
    expect(view.selectedSpans.map((item) => item.status)).toEqual(['unset', 'ok', 'error', 'error'])
  })

  it('returns an empty deterministic view when the selected trace is absent', () => {
    const view = buildRuntimeView(bundle, 'absent', {
      service: null, status: 'all', minDurationNano: '0', errorsOnly: false,
    })

    expect(view.selectedTrace).toBeNull()
    expect(view.visibleSpanIds).toEqual([])
    expect(view.warning).toBe('Selected trace is unavailable.')
  })
})
