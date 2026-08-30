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
