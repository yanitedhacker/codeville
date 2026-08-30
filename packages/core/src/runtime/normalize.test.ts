import { describe, expect, it } from 'vitest'
import { otlpAttribute, otlpDocument, otlpSpan } from './fixtures.js'
import { normalizeOtlpDocuments } from './normalize.js'
import { parseOtlpDocuments } from './otlp-json.js'
import { DEFAULT_RUNTIME_IMPORT_LIMITS, RuntimeImportError, type RuntimeImportLimits } from './types.js'

type JsonObject = Record<string, unknown>

const parseOne = (document: JsonObject) => parseOtlpDocuments(JSON.stringify(document))

const normalize = (document: JsonObject, limits: Partial<RuntimeImportLimits> = {}) =>
  normalizeOtlpDocuments(parseOne(document), { limits })

const traceDocument = (spans: JsonObject[]): JsonObject => ({
  resourceSpans: [{
    resource: { attributes: [], droppedAttributesCount: 0 },
    scopeSpans: [{
      scope: { name: 'test', version: '1', attributes: [], droppedAttributesCount: 0 },
      spans,
    }],
  }],
})

const expectImportError = (
  run: () => unknown,
  code: RuntimeImportError['code'],
  limit?: keyof RuntimeImportLimits,
  actual?: number,
) => {
  try {
    run()
    throw new Error('expected RuntimeImportError')
  } catch (error) {
    expect(error).toBeInstanceOf(RuntimeImportError)
    expect(error).toMatchObject({ code, ...(limit === undefined ? {} : { limit, actual }) })
  }
}

describe('normalizeOtlpDocuments', () => {
  it('keeps epoch nanoseconds exact, canonicalizes IDs, and redacts sensitive values', () => {
    const document = otlpDocument({
      traceId: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      spanId: 'BBBBBBBBBBBBBBBB',
      parentSpanId: 'CCCCCCCCCCCCCCCC',
      start: '18446744073709550000',
      end: '18446744073709551615',
      attributes: [
        otlpAttribute('authorization', { stringValue: 'Bearer secret' }),
        otlpAttribute('code.file.path', { stringValue: 'src/api.ts' }),
      ],
    })

    const result = normalize(document)

    expect(result.spans[0]).toMatchObject({
      traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      spanId: 'bbbbbbbbbbbbbbbb',
      parentSpanId: 'cccccccccccccccc',
      startTimeUnixNano: '18446744073709550000',
      endTimeUnixNano: '18446744073709551615',
      durationNano: '1615',
      attributes: [
        { key: 'authorization', value: { type: 'redacted' } },
        { key: 'code.file.path', value: { type: 'string', value: 'src/api.ts' } },
      ],
    })
    expect(result.report.redactedAttributes).toBe(1)
    expect(() => JSON.stringify(result)).not.toThrow()
    expect(JSON.stringify(result)).not.toContain('Bearer secret')
  })

  it('decodes resource, scope, span, status, flags, trace state, schema, events, and links', () => {
    const document: JsonObject = {
      resourceSpans: [{
        schemaUrl: 'https://opentelemetry.io/schemas/1.30.0',
        resource: {
          attributes: [otlpAttribute('service.name', { stringValue: 'api' })],
          droppedAttributesCount: '3',
        },
        scopeSpans: [{
          schemaUrl: 'https://scope.example/schema',
          scope: {
            name: 'instrumentation',
            version: '2.1.0',
            attributes: [otlpAttribute('scope.enabled', { boolValue: true })],
            droppedAttributesCount: 4,
          },
          spans: [{
            traceId: '11111111111111111111111111111111',
            spanId: '2222222222222222',
            parentSpanId: '3333333333333333',
            traceState: 'vendor=value',
            flags: 257,
            name: 'GET /items',
            kind: 2,
            startTimeUnixNano: '10',
            endTimeUnixNano: '25',
            attributes: [otlpAttribute('http.request.method', { stringValue: 'GET' })],
            droppedAttributesCount: '5',
            events: [{
              timeUnixNano: '12',
              name: 'exception',
              attributes: [otlpAttribute('exception.escaped', { boolValue: false })],
              droppedAttributesCount: '6',
            }],
            droppedEventsCount: '7',
            links: [{
              traceId: '44444444444444444444444444444444',
              spanId: '5555555555555555',
              traceState: 'other=value',
              attributes: [otlpAttribute('link.kind', { stringValue: 'follows' })],
              droppedAttributesCount: '8',
              flags: 1,
            }],
            droppedLinksCount: '9',
            status: { message: 'accepted', code: 1 },
          }],
        }],
      }],
    }

    const result = normalize(document)

    expect(result.spans[0]).toEqual({
      traceId: '11111111111111111111111111111111',
      spanId: '2222222222222222',
      parentSpanId: '3333333333333333',
      traceState: 'vendor=value',
      flags: 257,
      sampled: true,
      name: 'GET /items',
      kind: 2,
      startTimeUnixNano: '10',
      endTimeUnixNano: '25',
      durationNano: '15',
      attributes: [{ key: 'http.request.method', value: { type: 'string', value: 'GET' } }],
      droppedAttributesCount: '5',
      events: [{
        timeUnixNano: '12',
        name: 'exception',
        attributes: [{ key: 'exception.escaped', value: { type: 'bool', value: false } }],
        droppedAttributesCount: '6',
      }],
      droppedEventsCount: '7',
      links: [{
        traceId: '44444444444444444444444444444444',
        spanId: '5555555555555555',
        traceState: 'other=value',
        flags: 1,
        attributes: [{ key: 'link.kind', value: { type: 'string', value: 'follows' } }],
        droppedAttributesCount: '8',
      }],
      droppedLinksCount: '9',
      status: { message: 'accepted', code: 1 },
      resource: {
        schemaUrl: 'https://opentelemetry.io/schemas/1.30.0',
        attributes: [{ key: 'service.name', value: { type: 'string', value: 'api' } }],
        droppedAttributesCount: '3',
      },
      scope: {
        schemaUrl: 'https://scope.example/schema',
        name: 'instrumentation',
        version: '2.1.0',
        attributes: [{ key: 'scope.enabled', value: { type: 'bool', value: true } }],
        droppedAttributesCount: '4',
      },
    })
    expect(result.report).toMatchObject({
      traces: 1,
      spans: 1,
      sampledSpans: 1,
      unsampledSpans: 0,
      duplicateSpans: 0,
      redactedAttributes: 0,
    })
  })

  it('preserves every tagged AnyValue variant and sorts nested attributes by key', () => {
    const result = normalize(otlpDocument({ attributes: [
      otlpAttribute('v.string', { stringValue: 'text' }),
      otlpAttribute('v.bool', { boolValue: true }),
      otlpAttribute('v.int.string', { intValue: '-9223372036854775808' }),
      otlpAttribute('v.int.number', { intValue: 42 }),
      otlpAttribute('v.double', { doubleValue: 1.25 }),
      otlpAttribute('v.bytes', { bytesValue: 'AQID' }),
      otlpAttribute('v.array', { arrayValue: { values: [{ stringValue: 'a' }, { intValue: '2' }] } }),
      otlpAttribute('v.kvlist', { kvlistValue: { values: [
        otlpAttribute('z', { boolValue: false }),
        otlpAttribute('a', { stringValue: 'first' }),
      ] } }),
    ] }))

    expect(result.spans[0]!.attributes).toEqual([
      { key: 'v.array', value: { type: 'array', value: [
        { type: 'string', value: 'a' },
        { type: 'int', value: '2' },
      ] } },
      { key: 'v.bool', value: { type: 'bool', value: true } },
      { key: 'v.bytes', value: { type: 'bytes', value: 'AQID' } },
      { key: 'v.double', value: { type: 'double', value: 1.25 } },
      { key: 'v.int.number', value: { type: 'int', value: '42' } },
      { key: 'v.int.string', value: { type: 'int', value: '-9223372036854775808' } },
      { key: 'v.kvlist', value: { type: 'kvlist', value: [
        { key: 'a', value: { type: 'string', value: 'first' } },
        { key: 'z', value: { type: 'bool', value: false } },
      ] } },
      { key: 'v.string', value: { type: 'string', value: 'text' } },
    ])
  })

  it.each([
    ['resource', 'Authorization'],
    ['scope', 'COOKIE'],
    ['span', 'ToKeN'],
    ['event', 'SECRET'],
    ['link', 'db.Query.Text'],
  ] as const)('redacts sensitive %s attributes case-insensitively', (owner, key) => {
    const attribute = otlpAttribute(key, { stringValue: 'must-not-survive' })
    const options = {
      resourceAttributes: owner === 'resource' ? [attribute] : [],
      scopeAttributes: owner === 'scope' ? [attribute] : [],
      attributes: owner === 'span' ? [attribute] : [],
      events: owner === 'event' ? [{ timeUnixNano: '110', name: 'event', attributes: [attribute], droppedAttributesCount: 0 }] : [],
      links: owner === 'link' ? [{
        traceId: '33333333333333333333333333333333',
        spanId: '4444444444444444',
        attributes: [attribute],
        droppedAttributesCount: 0,
        flags: 0,
      }] : [],
    }

    const result = normalize(otlpDocument(options))

    expect(result.report.redactedAttributes).toBe(1)
    expect(JSON.stringify(result)).toContain(`\"key\":\"${key}\",\"value\":{\"type\":\"redacted\"}`)
    expect(JSON.stringify(result)).not.toContain('must-not-survive')
  })

  it.each([
    'authorization', 'cookie', 'token', 'secret', 'password', 'credential', 'api-key', 'api_key',
    'private-key', 'private_key', 'session', 'db.statement', 'db.query.text',
    'http.request.body', 'http.response.body',
  ])('redacts the design key %s', (key) => {
    const result = normalize(otlpDocument({
      attributes: [otlpAttribute(key, { kvlistValue: { values: [otlpAttribute('nested', { stringValue: 'hidden' })] } })],
    }))

    expect(result.spans[0]!.attributes).toEqual([{ key, value: { type: 'redacted' } }])
    expect(result.report.redactedAttributes).toBe(1)
  })

  it('does not redact keys outside the exact case-insensitive design-key set', () => {
    const result = normalize(otlpDocument({ attributes: [
      otlpAttribute('token.count', { intValue: '3' }),
      otlpAttribute('http.request.body.size', { intValue: '128' }),
      otlpAttribute('session.duration', { intValue: '42' }),
    ] }))

    expect(result.report.redactedAttributes).toBe(0)
    expect(result.spans[0]!.attributes).toEqual([
      { key: 'http.request.body.size', value: { type: 'int', value: '128' } },
      { key: 'session.duration', value: { type: 'int', value: '42' } },
      { key: 'token.count', value: { type: 'int', value: '3' } },
    ])
  })

  it.each([
    ['resourceSpans', { scope_spans: [] }],
    ['scopeSpans', { resourceSpans: [{ resource: { attributes: [] }, scope_spans: [] }] }],
    ['spans', {
      resourceSpans: [{ resource: { attributes: [] }, scopeSpans: [{ scope: {}, span_list: [] }] }],
    }],
  ] as Array<[string, JsonObject]>)('rejects a snake-case substitute for required %s', (_field, document) => {
    expectImportError(() => normalize(document), 'schema')
  })

  it.each([
    ['empty span name', { name: '' }, 'schema'],
    ['short trace ID', { traceId: '11' }, 'identity'],
    ['zero trace ID', { traceId: '00000000000000000000000000000000' }, 'identity'],
    ['non-hex span ID', { spanId: 'gggggggggggggggg' }, 'identity'],
    ['zero parent ID', { parentSpanId: '0000000000000000' }, 'identity'],
    ['end before start', { startTimeUnixNano: '201', endTimeUnixNano: '200' }, 'time'],
    ['unsafe numeric time', { startTimeUnixNano: 9007199254740992 }, 'schema'],
    ['negative timestamp', { startTimeUnixNano: '-1' }, 'schema'],
    ['uint64 overflow', { endTimeUnixNano: '18446744073709551616' }, 'schema'],
    ['fractional kind', { kind: 1.5 }, 'schema'],
    ['kind below range', { kind: -1 }, 'schema'],
    ['kind above range', { kind: 6 }, 'schema'],
    ['fractional status', { status: { code: 1.5 } }, 'schema'],
    ['status above range', { status: { code: 3 } }, 'schema'],
    ['flags above uint32', { flags: 4294967296 }, 'schema'],
  ] as const)('rejects %s', (_name, patch, code) => {
    expectImportError(() => normalize(traceDocument([{ ...otlpSpan(), ...patch }])), code)
  })

  it('rejects lower-camel span required fields that are absent or replaced', () => {
    const span = otlpSpan()
    delete span.startTimeUnixNano
    span.start_time_unix_nano = '100'
    expectImportError(() => normalize(traceDocument([span])), 'schema')
  })

  it('rejects duplicate attribute keys at every owner, including kvlists', () => {
    const duplicate = [
      otlpAttribute('same', { stringValue: 'one' }),
      otlpAttribute('same', { stringValue: 'two' }),
    ]
    for (const document of [
      otlpDocument({ resourceAttributes: duplicate }),
      otlpDocument({ scopeAttributes: duplicate }),
      otlpDocument({ attributes: duplicate }),
      otlpDocument({ events: [{ timeUnixNano: '101', name: 'event', attributes: duplicate }] }),
      otlpDocument({ links: [{ traceId: '3'.repeat(32), spanId: '4'.repeat(16), attributes: duplicate }] }),
      otlpDocument({ attributes: [otlpAttribute('list', { kvlistValue: { values: duplicate } })] }),
    ]) {
      expectImportError(() => normalize(document), 'schema')
    }
  })

  it('rejects malformed tagged AnyValues and int64 overflow', () => {
    for (const value of [
      {},
      { stringValue: 'one', boolValue: true },
      { intValue: '9223372036854775808' },
      { intValue: '-9223372036854775809' },
      { intValue: 9007199254740992 },
      { doubleValue: '1.25' },
      { bytesValue: 'not base64' },
    ]) {
      expectImportError(() => normalize(otlpDocument({ attributes: [otlpAttribute('value', value)] })), 'schema')
    }
  })

  it('ignores and reports unknown OTLP fields without copying their values', () => {
    const document = otlpDocument({
      spanExtra: { spanExtra: { futureSecret: 'do-not-copy' } },
      resourceExtra: { resourceExtra: 'resource-value' },
    })
    ;(document.resourceSpans as JsonObject[])[0]!.exportExtra = 'export-value'

    const result = normalize(document)

    expect(result.report.unknownFields).toEqual([
      { path: 'resourceSpans[].exportExtra', count: 1 },
      { path: 'resourceSpans[].resource.resourceExtra', count: 1 },
      { path: 'resourceSpans[].scopeSpans[].spans[].spanExtra', count: 1 },
    ])
    expect(result.report.unknownFieldCount).toBe(3)
    expect(JSON.stringify(result)).not.toContain('do-not-copy')
    expect(JSON.stringify(result)).not.toContain('resource-value')
    expect(JSON.stringify(result)).not.toContain('export-value')
  })

  it('keeps at most 256 unknown paths and preserves the exact total count', () => {
    const span = otlpSpan()
    for (let index = 0; index < 300; index += 1) span[`unknown${index}`] = { ignored: index }

    const result = normalize(traceDocument([span]))

    expect(result.report.unknownFields).toHaveLength(256)
    expect(result.report.unknownFieldCount).toBe(300)
    expect(JSON.stringify(result)).not.toContain('ignored')
  })

  it('retains deterministic unknown diagnostics when unknown key order changes', () => {
    const ascending = otlpSpan()
    const descending = otlpSpan()
    const keys = Array.from({ length: 260 }, (_, index) => `unknown-${String(index).padStart(3, '0')}`)
    for (const key of keys) ascending[key] = null
    for (const key of [...keys].reverse()) descending[key] = null

    const left = normalize(traceDocument([ascending])).report
    const right = normalize(traceDocument([descending])).report

    expect(left.unknownFieldCount).toBe(260)
    expect(right.unknownFieldCount).toBe(260)
    expect(left.unknownFields).toEqual(right.unknownFields)
    expect(left.unknownFields[0]).toEqual({
      path: 'resourceSpans[].scopeSpans[].spans[].unknown-000',
      count: 1,
    })
    expect(left.unknownFields[255]).toEqual({
      path: 'resourceSpans[].scopeSpans[].spans[].unknown-255',
      count: 1,
    })
  })

  it('coalesces byte-identical duplicate spans and counts them', () => {
    const span = otlpSpan({ attributes: [otlpAttribute('b', { intValue: '2' }), otlpAttribute('a', { intValue: '1' })] })
    const same = structuredClone(span)

    const result = normalize(traceDocument([span, same]))

    expect(result.spans).toHaveLength(1)
    expect(result.report).toMatchObject({ spans: 1, duplicateSpans: 1, traces: 1 })
  })

  it('rejects conflicting duplicate span identities without echoing imported values', () => {
    const left = otlpSpan({ name: 'private-left-name' })
    const right = otlpSpan({ name: 'private-right-name' })

    try {
      normalize(traceDocument([left, right]))
      throw new Error('expected conflict')
    } catch (error) {
      expect(error).toMatchObject({ code: 'conflict' })
      expect(String(error)).toMatch(/conflicting duplicate span/i)
      expect(String(error)).not.toContain('private-left-name')
      expect(String(error)).not.toContain('private-right-name')
      expect(String(error)).not.toContain('11111111111111111111111111111111')
    }
  })

  it('sorts spans by trace ID, start, end, then span ID using integer timestamps', () => {
    const spans = [
      otlpSpan({ traceId: '2'.repeat(32), spanId: '4'.repeat(16), start: '10', end: '30' }),
      otlpSpan({ traceId: '1'.repeat(32), spanId: '3'.repeat(16), start: '100', end: '120' }),
      otlpSpan({ traceId: '1'.repeat(32), spanId: '2'.repeat(16), start: '20', end: '40' }),
      otlpSpan({ traceId: '1'.repeat(32), spanId: '1'.repeat(16), start: '20', end: '30' }),
    ]

    const result = normalize(traceDocument(spans))

    expect(result.spans.map((span) => span.spanId)).toEqual([
      '1111111111111111',
      '2222222222222222',
      '3333333333333333',
      '4444444444444444',
    ])
  })

  it('tracks sampled and unsampled span flags without deriving parent graphs', () => {
    const sampled = { ...otlpSpan({ spanId: '1'.repeat(16) }), flags: 1 }
    const unsampled = { ...otlpSpan({ spanId: '2'.repeat(16) }), flags: 256 }

    const result = normalize(traceDocument([sampled, unsampled]))

    expect(result.spans.map((span) => ({ flags: span.flags, sampled: span.sampled }))).toEqual([
      { flags: 1, sampled: true },
      { flags: 256, sampled: false },
    ])
    expect(result.report).toMatchObject({ sampledSpans: 1, unsampledSpans: 1 })
  })

  it('accepts exact semantic caps and rejects one above each cap', () => {
    const baseLimits = { ...DEFAULT_RUNTIME_IMPORT_LIMITS }
    const distinctTraceSpans = [
      otlpSpan({ traceId: '1'.repeat(32), spanId: '1'.repeat(16) }),
      otlpSpan({ traceId: '2'.repeat(32), spanId: '2'.repeat(16) }),
      otlpSpan({ traceId: '3'.repeat(32), spanId: '3'.repeat(16) }),
    ]
    expect(normalize(traceDocument(distinctTraceSpans.slice(0, 2)), { ...baseLimits, maxTraces: 2 }).spans).toHaveLength(2)
    expectImportError(
      () => normalize(traceDocument(distinctTraceSpans), { ...baseLimits, maxTraces: 2 }),
      'limit', 'maxTraces', 3,
    )

    const spans = [
      otlpSpan({ spanId: '1'.repeat(16) }),
      otlpSpan({ spanId: '2'.repeat(16) }),
      otlpSpan({ spanId: '3'.repeat(16) }),
    ]
    expect(normalize(traceDocument(spans.slice(0, 2)), { ...baseLimits, maxSpans: 2 }).spans).toHaveLength(2)
    expectImportError(
      () => normalize(traceDocument(spans), { ...baseLimits, maxSpans: 2 }),
      'limit', 'maxSpans', 3,
    )
    expect(normalize(traceDocument(spans.slice(0, 2)), { ...baseLimits, maxSpansPerTrace: 2 }).spans).toHaveLength(2)
    expectImportError(
      () => normalize(traceDocument(spans), { ...baseLimits, maxSpansPerTrace: 2 }),
      'limit', 'maxSpansPerTrace', 3,
    )

    const group = { scope: { attributes: [] }, spans: [] }
    const groupsAtLimit = { resourceSpans: [{ resource: { attributes: [] }, scopeSpans: [group, group] }] }
    const groupsOverLimit = { resourceSpans: [{ resource: { attributes: [] }, scopeSpans: [group, group, group] }] }
    expect(normalize(groupsAtLimit, { ...baseLimits, maxResourceScopeGroups: 2 }).spans).toHaveLength(0)
    expectImportError(
      () => normalize(groupsOverLimit, { ...baseLimits, maxResourceScopeGroups: 2 }),
      'limit', 'maxResourceScopeGroups', 3,
    )
  })

  it('accepts exact owner-list caps and rejects one above each cap', () => {
    const baseLimits = { ...DEFAULT_RUNTIME_IMPORT_LIMITS }
    const attributes = [
      otlpAttribute('a', { stringValue: 'a' }),
      otlpAttribute('b', { stringValue: 'b' }),
      otlpAttribute('c', { stringValue: 'c' }),
    ]
    expect(normalize(otlpDocument({ attributes: attributes.slice(0, 2) }), { ...baseLimits, maxAttributes: 2 }).spans[0]!.attributes).toHaveLength(2)
    expectImportError(
      () => normalize(otlpDocument({ attributes }), { ...baseLimits, maxAttributes: 2 }),
      'limit', 'maxAttributes', 3,
    )

    const events = [0, 1, 2].map((index) => ({ timeUnixNano: String(110 + index), name: `event-${index}`, attributes: [] }))
    expect(normalize(otlpDocument({ events: events.slice(0, 2) }), { ...baseLimits, maxEventsPerSpan: 2 }).spans[0]!.events).toHaveLength(2)
    expectImportError(
      () => normalize(otlpDocument({ events }), { ...baseLimits, maxEventsPerSpan: 2 }),
      'limit', 'maxEventsPerSpan', 3,
    )

    const links = [0, 1, 2].map((index) => ({
      traceId: String(index + 3).repeat(32), spanId: String(index + 3).repeat(16), attributes: [],
    }))
    expect(normalize(otlpDocument({ links: links.slice(0, 2) }), { ...baseLimits, maxLinksPerSpan: 2 }).spans[0]!.links).toHaveLength(2)
    expectImportError(
      () => normalize(otlpDocument({ links }), { ...baseLimits, maxLinksPerSpan: 2 }),
      'limit', 'maxLinksPerSpan', 3,
    )
  })

  it('accepts exact attribute depth and value bytes and rejects one above', () => {
    const baseLimits = { ...DEFAULT_RUNTIME_IMPORT_LIMITS }
    const atDepth = { arrayValue: { values: [{ stringValue: 'ok' }] } }
    const overDepth = { arrayValue: { values: [{ arrayValue: { values: [{ stringValue: 'too deep' }] } }] } }
    expect(normalize(otlpDocument({ attributes: [otlpAttribute('depth', atDepth)] }), {
      ...baseLimits, maxAttributeDepth: 2,
    }).spans).toHaveLength(1)
    expectImportError(
      () => normalize(otlpDocument({ attributes: [otlpAttribute('depth', overDepth)] }), {
        ...baseLimits, maxAttributeDepth: 2,
      }),
      'limit', 'maxAttributeDepth', 3,
    )

    expect(normalize(otlpDocument({ attributes: [otlpAttribute('bytes', { stringValue: '€' })] }), {
      ...baseLimits, maxValueBytes: 3,
    }).spans).toHaveLength(1)
    expectImportError(
      () => normalize(otlpDocument({ attributes: [otlpAttribute('bytes', { stringValue: '€x' })] }), {
        ...baseLimits, maxValueBytes: 3,
      }),
      'limit', 'maxValueBytes', 4,
    )
  })

  it('counts semantic limits before duplicate coalescing', () => {
    const span = otlpSpan()
    expectImportError(
      () => normalize(traceDocument([span, structuredClone(span)]), { maxSpans: 1 }),
      'limit', 'maxSpans', 2,
    )
    expectImportError(
      () => normalize(traceDocument([span, structuredClone(span)]), { maxSpansPerTrace: 1 }),
      'limit', 'maxSpansPerTrace', 2,
    )
  })

  it('returns no partial model after a later invalid span', () => {
    const valid = otlpSpan({ spanId: '1'.repeat(16) })
    const invalid = otlpSpan({ spanId: '2'.repeat(16), start: '201', end: '200' })
    expectImportError(() => normalize(traceDocument([valid, invalid])), 'time')
  })
})
