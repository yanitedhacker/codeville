export interface RuntimeImportLimits {
  maxInputBytes: number
  maxJsonLineBytes: number
  maxTraces: number
  maxSpans: number
  maxSpansPerTrace: number
  maxResourceScopeGroups: number
  maxAttributes: number
  maxEventsPerSpan: number
  maxLinksPerSpan: number
  maxAttributeDepth: number
  maxValueBytes: number
}

export const DEFAULT_RUNTIME_IMPORT_LIMITS: Readonly<RuntimeImportLimits> = {
  maxInputBytes: 25 * 1024 * 1024,
  maxJsonLineBytes: 8 * 1024 * 1024,
  maxTraces: 10_000,
  maxSpans: 50_000,
  maxSpansPerTrace: 20_000,
  maxResourceScopeGroups: 2_000,
  maxAttributes: 128,
  maxEventsPerSpan: 256,
  maxLinksPerSpan: 128,
  maxAttributeDepth: 8,
  maxValueBytes: 16 * 1024,
}

export interface RuntimeAttribute {
  key: string
  value: RuntimeValue
}

export type RuntimeValue =
  | { type: 'string'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'int'; value: string }
  | { type: 'double'; value: number }
  | { type: 'bytes'; value: string }
  | { type: 'array'; value: RuntimeValue[] }
  | { type: 'kvlist'; value: RuntimeAttribute[] }
  | { type: 'redacted' }

export interface RuntimeResource {
  schemaUrl?: string
  attributes: RuntimeAttribute[]
  droppedAttributesCount: string
}

export interface RuntimeScope {
  schemaUrl?: string
  name?: string
  version?: string
  attributes: RuntimeAttribute[]
  droppedAttributesCount: string
}

export interface RuntimeSpanEvent {
  timeUnixNano: string
  name: string
  attributes: RuntimeAttribute[]
  droppedAttributesCount: string
}

export interface RuntimeSpanLink {
  traceId: string
  spanId: string
  traceState?: string
  flags: number
  attributes: RuntimeAttribute[]
  droppedAttributesCount: string
}

export interface RuntimeSpanStatus {
  message?: string
  code: number
}

export interface RuntimeSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  traceState?: string
  flags: number
  sampled: boolean
  name: string
  kind: number
  startTimeUnixNano: string
  endTimeUnixNano: string
  durationNano: string
  attributes: RuntimeAttribute[]
  droppedAttributesCount: string
  events: RuntimeSpanEvent[]
  droppedEventsCount: string
  links: RuntimeSpanLink[]
  droppedLinksCount: string
  status: RuntimeSpanStatus
  resource: RuntimeResource
  scope: RuntimeScope
}

export interface RuntimeUnknownFieldDiagnostic {
  path: string
  count: number
}

export interface RuntimeImportReport {
  documents: number
  resourceScopeGroups: number
  traces: number
  inputSpans: number
  spans: number
  duplicateSpans: number
  sampledSpans: number
  unsampledSpans: number
  redactedAttributes: number
  droppedAttributesCount: string
  droppedEventsCount: string
  droppedLinksCount: string
  unknownFieldCount: number
  unknownFields: RuntimeUnknownFieldDiagnostic[]
}

export interface NormalizedRuntimeInput {
  spans: RuntimeSpan[]
  report: RuntimeImportReport
}

export interface RuntimeNormalizeOptions {
  readonly limits?: Partial<RuntimeImportLimits>
}

export class RuntimeImportError extends Error {
  constructor(
    public readonly code: 'syntax' | 'schema' | 'limit' | 'identity' | 'time' | 'conflict',
    message: string,
    public readonly limit?: keyof RuntimeImportLimits,
    public readonly actual?: number,
  ) {
    super(message)
    this.name = 'RuntimeImportError'
  }

  static limit(limit: keyof RuntimeImportLimits, actual: number): RuntimeImportError {
    return new RuntimeImportError('limit', `Runtime trace exceeds ${limit} (${actual}).`, limit, actual)
  }
}
