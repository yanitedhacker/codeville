type JsonObject = Record<string, unknown>

export interface OtlpSpanFixtureOptions {
  traceId?: string
  spanId?: string
  parentSpanId?: string
  name?: string
  start?: string | number
  end?: string | number
  attributes?: JsonObject[]
  events?: JsonObject[]
  links?: JsonObject[]
  resourceAttributes?: JsonObject[]
  scopeAttributes?: JsonObject[]
  resourceExtra?: JsonObject
  scopeSpanExtra?: JsonObject
  spanExtra?: JsonObject
}

export function otlpAttribute(key: string, value: JsonObject): JsonObject {
  return { key, value }
}

export function otlpSpan(options: OtlpSpanFixtureOptions = {}): JsonObject {
  return {
    traceId: options.traceId ?? '11111111111111111111111111111111',
    spanId: options.spanId ?? '2222222222222222',
    ...(options.parentSpanId === undefined ? {} : { parentSpanId: options.parentSpanId }),
    name: options.name ?? 'fixture span',
    kind: 1,
    startTimeUnixNano: options.start ?? '100',
    endTimeUnixNano: options.end ?? '200',
    attributes: options.attributes ?? [],
    droppedAttributesCount: 0,
    events: options.events ?? [],
    droppedEventsCount: 0,
    links: options.links ?? [],
    droppedLinksCount: 0,
    status: { code: 0 },
    ...options.spanExtra,
  }
}

export function otlpDocument(options?: OtlpSpanFixtureOptions): JsonObject {
  if (options === undefined) return { resourceSpans: [] }

  return {
    resourceSpans: [{
      resource: {
        attributes: options.resourceAttributes ?? [],
        droppedAttributesCount: 0,
        ...options.resourceExtra,
      },
      scopeSpans: [{
        scope: {
          name: 'fixture scope',
          version: '1.0.0',
          attributes: options.scopeAttributes ?? [],
          droppedAttributesCount: 0,
        },
        spans: [otlpSpan(options)],
        ...options.scopeSpanExtra,
      }],
    }],
  }
}

function otlpDocumentWithSpans(spans: JsonObject[]): JsonObject {
  return {
    resourceSpans: [{
      resource: { attributes: [], droppedAttributesCount: 0 },
      scopeSpans: [{
        scope: {
          name: 'fixture scope',
          version: '1.0.0',
          attributes: [],
          droppedAttributesCount: 0,
        },
        spans,
      }],
    }],
  }
}

export function otlpDocumentWithRelations(): JsonObject {
  return otlpDocumentWithSpans([
    otlpSpan({ spanId: '0000000000000001', name: 'root', start: '0', end: '10' }),
    otlpSpan({ spanId: '0000000000000002', parentSpanId: '0000000000000001', name: 'child', start: '10', end: '20' }),
    otlpSpan({ spanId: '0000000000000004', parentSpanId: '9999999999999999', name: 'orphan', start: '20', end: '30' }),
    otlpSpan({ spanId: '0000000000000005', parentSpanId: '0000000000000006', name: 'cycle a low', start: '30', end: '40' }),
    otlpSpan({ spanId: '0000000000000006', parentSpanId: '0000000000000005', name: 'cycle a high', start: '40', end: '50' }),
    otlpSpan({ spanId: '0000000000000007', parentSpanId: '0000000000000008', name: 'cycle b low', start: '50', end: '60' }),
    otlpSpan({ spanId: '0000000000000008', parentSpanId: '0000000000000007', name: 'cycle b high', start: '60', end: '70' }),
  ])
}

export function otlpDocumentWithTiedPaths(): JsonObject {
  return otlpDocumentWithSpans([
    otlpSpan({ spanId: '0000000000000001', name: 'root', start: '0', end: '10' }),
    otlpSpan({
      spanId: '0000000000000002',
      parentSpanId: '0000000000000001',
      name: 'branch one',
      start: '20',
      end: '25',
      spanExtra: { status: { code: 2 } },
    }),
    otlpSpan({
      spanId: '0000000000000004',
      parentSpanId: '0000000000000002',
      name: 'branch one leaf',
      start: '20',
      end: '25',
      spanExtra: { status: { code: 2 } },
    }),
    otlpSpan({
      spanId: '0000000000000003',
      parentSpanId: '0000000000000001',
      name: 'branch two error',
      start: '5',
      end: '15',
      spanExtra: { status: { code: 2 } },
    }),
    otlpSpan({ spanId: '0000000000000009', name: 'later tied root', start: '30', end: '50' }),
  ])
}

export function otlpDocumentWithoutTrueRoot(): JsonObject {
  return otlpDocumentWithSpans([
    otlpSpan({ spanId: '0000000000000001', parentSpanId: '9999999999999999', name: 'orphan', start: '0', end: '10' }),
    otlpSpan({
      spanId: '0000000000000002',
      parentSpanId: '0000000000000001',
      name: 'orphan child error',
      start: '10',
      end: '20',
      spanExtra: { status: { code: 2 } },
    }),
    otlpSpan({
      spanId: '0000000000000003',
      parentSpanId: '0000000000000004',
      name: 'cycle child error',
      start: '20',
      end: '30',
      spanExtra: { status: { code: 2 } },
    }),
    otlpSpan({ spanId: '0000000000000004', parentSpanId: '0000000000000003', name: 'cycle break', start: '30', end: '40' }),
  ])
}
