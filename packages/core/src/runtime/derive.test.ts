import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  otlpAttribute,
  otlpSpan,
  otlpDocumentWithRelations,
  otlpDocumentWithTiedPaths,
  otlpDocumentWithoutTrueRoot,
} from './fixtures.js'
import { deriveRuntimeTraces } from './index.js'
import { normalizeOtlpDocuments } from './normalize.js'
import { parseOtlpDocuments } from './otlp-json.js'
import { importOtlpTraceJson } from '../index.js'

type JsonObject = Record<string, unknown>

function freezeEvidence<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) freezeEvidence(child)
  return value
}

function permutationDocument(): JsonObject {
  const resource = (service: string, scopes: Array<{ name: string; spans: JsonObject[] }>): JsonObject => ({
    resource: {
      attributes: [otlpAttribute('service.name', { stringValue: service })],
      droppedAttributesCount: 0,
    },
    scopeSpans: scopes.map(({ name, spans }) => ({
      scope: { name, version: '1', attributes: [], droppedAttributesCount: 0 },
      spans,
    })),
  })
  return {
    resourceSpans: [
      resource('api', [
        { name: 'api-a', spans: [
          otlpSpan({ traceId: '22222222222222222222222222222222', spanId: '0000000000000002', start: '20', end: '30' }),
          otlpSpan({ traceId: '11111111111111111111111111111111', spanId: '0000000000000002', parentSpanId: '0000000000000001', start: '10', end: '20' }),
        ] },
        { name: 'api-b', spans: [
          otlpSpan({ traceId: '11111111111111111111111111111111', spanId: '0000000000000001', start: '0', end: '10' }),
        ] },
      ]),
      resource('worker', [
        { name: 'worker-a', spans: [
          otlpSpan({ traceId: '33333333333333333333333333333333', spanId: '0000000000000001', start: '30', end: '40' }),
        ] },
        { name: 'worker-b', spans: [
          otlpSpan({ traceId: '22222222222222222222222222222222', spanId: '0000000000000001', start: '0', end: '20' }),
        ] },
      ]),
    ],
  }
}

function reverseResourceScopeAndSpanOrder(document: JsonObject): JsonObject {
  const copy = structuredClone(document) as {
    resourceSpans: Array<{ scopeSpans: Array<{ spans: unknown[] }> }>
  }
  copy.resourceSpans.reverse()
  for (const resource of copy.resourceSpans) {
    resource.scopeSpans.reverse()
    for (const scope of resource.scopeSpans) scope.spans.reverse()
  }
  return copy as unknown as JsonObject
}

describe('deriveRuntimeTraces', () => {
  it('keeps missing parents explicit and breaks every cycle deterministically', () => {
    const bundle = importOtlpTraceJson(JSON.stringify(otlpDocumentWithRelations()))
    const trace = bundle.traces[0]!

    expect(trace).toMatchObject({
      traceId: '11111111111111111111111111111111',
      startTimeUnixNano: '0',
      endTimeUnixNano: '70',
      spanIds: [
        '0000000000000001',
        '0000000000000002',
        '0000000000000004',
        '0000000000000005',
        '0000000000000006',
        '0000000000000007',
        '0000000000000008',
      ],
      rootSpanIds: ['0000000000000001'],
      orphanSpanIds: ['0000000000000004'],
      cycleBreakSpanIds: ['0000000000000006', '0000000000000008'],
    })
    expect(bundle.spans.map(({ spanId, parentSpanId, relation }) => ({ spanId, parentSpanId, relation }))).toEqual([
      { spanId: '0000000000000001', parentSpanId: undefined, relation: 'root' },
      { spanId: '0000000000000002', parentSpanId: '0000000000000001', relation: 'child' },
      { spanId: '0000000000000004', parentSpanId: '9999999999999999', relation: 'orphan' },
      { spanId: '0000000000000005', parentSpanId: '0000000000000006', relation: 'child' },
      { spanId: '0000000000000006', parentSpanId: '0000000000000005', relation: 'cycle-broken' },
      { spanId: '0000000000000007', parentSpanId: '0000000000000008', relation: 'child' },
      { spanId: '0000000000000008', parentSpanId: '0000000000000007', relation: 'cycle-broken' },
    ])
  })

  it('uses the specified hot-path and error-path tie breaks', () => {
    const trace = importOtlpTraceJson(JSON.stringify(otlpDocumentWithTiedPaths())).traces[0]!

    expect(trace.rootSpanIds).toEqual(['0000000000000001', '0000000000000009'])
    expect(trace.hotPathSpanIds).toEqual([
      '0000000000000001',
      '0000000000000002',
      '0000000000000004',
    ])
    expect(trace.errorPaths).toEqual([
      ['0000000000000001', '0000000000000003'],
      ['0000000000000001', '0000000000000002', '0000000000000004'],
      ['0000000000000001', '0000000000000002'],
    ])
  })

  it('keeps orphan and cycle groups visible without inventing a hot-path root', () => {
    const trace = importOtlpTraceJson(JSON.stringify(otlpDocumentWithoutTrueRoot())).traces[0]!

    expect(trace.rootSpanIds).toEqual([])
    expect(trace.orphanSpanIds).toEqual(['0000000000000001'])
    expect(trace.cycleBreakSpanIds).toEqual(['0000000000000004'])
    expect(trace.hotPathSpanIds).toEqual([])
    expect(trace.errorPaths).toEqual([
      ['0000000000000001', '0000000000000002'],
      ['0000000000000004', '0000000000000003'],
    ])
  })

  it('is stable across resource, scope, and span permutations', () => {
    const original = permutationDocument()
    const permuted = reverseResourceScopeAndSpanOrder(original)

    expect(importOtlpTraceJson(JSON.stringify(permuted))).toEqual(
      importOtlpTraceJson(JSON.stringify(original)),
    )
  })

  it('does not mutate normalized evidence and sorts direct derivation deterministically', () => {
    const normalized = normalizeOtlpDocuments(parseOtlpDocuments(JSON.stringify(permutationDocument())))
    const reversed = {
      spans: [...normalized.spans].reverse(),
      report: normalized.report,
    }
    const snapshot = JSON.stringify(reversed)
    freezeEvidence(reversed)

    expect(deriveRuntimeTraces(reversed)).toEqual(deriveRuntimeTraces(normalized))
    expect(JSON.stringify(reversed)).toBe(snapshot)
  })

  it('returns serializable plain JSON and safely handles an empty export', () => {
    const empty = importOtlpTraceJson('{"resourceSpans":[]}')

    expect(empty).toEqual({
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
    })
    expect(JSON.parse(JSON.stringify(empty))).toEqual(empty)
  })

  it('derives errors only from status code 2', () => {
    const document = {
      resourceSpans: [{
        resource: { attributes: [], droppedAttributesCount: 0 },
        scopeSpans: [{
          scope: { attributes: [], droppedAttributesCount: 0 },
          spans: [
            otlpSpan({
              spanId: '0000000000000001',
              name: 'error exception failed',
              attributes: [otlpAttribute('error', { boolValue: true })],
              spanExtra: { status: { code: 0, message: 'error' } },
            }),
          ],
        }],
      }],
    }

    expect(importOtlpTraceJson(JSON.stringify(document)).traces[0]!.errorPaths).toEqual([])
  })

  it('normalizes equivalent public JSON and JSON Lines evidence identically', async () => {
    const fixtureUrl = new URL('../../../../fixtures/runtime/', import.meta.url)
    const [jsonText, jsonlText] = await Promise.all([
      readFile(new URL('minimal-otlp.json', fixtureUrl), 'utf8'),
      readFile(new URL('minimal-otlp.jsonl', fixtureUrl), 'utf8'),
    ])

    const json = importOtlpTraceJson(jsonText)
    const jsonl = importOtlpTraceJson(jsonlText)
    expect(jsonl.spans).toEqual(json.spans)
    expect(jsonl.traces).toEqual(json.traces)
    expect(json.traces).toHaveLength(2)
    expect(json.spans.filter((span) => span.status.code === 2)).toHaveLength(1)
    expect(json.report).toMatchObject({ documents: 1, redactedAttributes: 1 })
    expect(jsonl.report).toMatchObject({ documents: 2, redactedAttributes: 1 })
    expect(json.spans.flatMap((span) => span.attributes)).toContainEqual({
      key: 'authorization',
      value: { type: 'redacted' },
    })
    expect(json.spans.flatMap((span) => span.attributes)).toContainEqual({
      key: 'code.file.path',
      value: { type: 'string', value: 'packages/core/src/runtime/index.ts' },
    })
    expect(JSON.stringify(json)).not.toContain('fixture-secret')
    expect(JSON.parse(JSON.stringify(json))).toEqual(json)
  })
})
