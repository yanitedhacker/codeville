import {
  DEFAULT_RUNTIME_IMPORT_LIMITS,
  RuntimeImportError,
  type NormalizedRuntimeInput,
  type RuntimeAttribute,
  type RuntimeImportLimits,
  type RuntimeNormalizeOptions,
  type RuntimeResource,
  type RuntimeScope,
  type RuntimeSpan,
  type RuntimeSpanEvent,
  type RuntimeSpanLink,
  type RuntimeSpanStatus,
  type RuntimeValue,
} from './types.js'
import type { ParsedOtlpDocument } from './otlp-json.js'

type JsonRecord = Record<string, unknown>

interface NormalizeState {
  readonly limits: RuntimeImportLimits
  readonly unknownPaths: Map<string, number>
  readonly traceSpanCounts: Map<string, number>
  readonly traceIds: Set<string>
  unknownFieldCount: number
  redactedAttributes: number
  resourceScopeGroups: number
  inputSpans: number
  duplicateSpans: number
  droppedAttributesCount: bigint
  droppedEventsCount: bigint
  droppedLinksCount: bigint
  valuePath: string
}

const encoder = new TextEncoder()
const UINT64_MAX = 18_446_744_073_709_551_615n
const INT64_MIN = -9_223_372_036_854_775_808n
const INT64_MAX = 9_223_372_036_854_775_807n
const UINT32_MAX = 4_294_967_295n
const MAX_UNKNOWN_PATHS = 256
const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'token',
  'secret',
  'password',
  'credential',
  'api-key',
  'api_key',
  'private-key',
  'private_key',
  'session',
  'db.statement',
  'db.query.text',
  'http.request.body',
  'http.response.body',
] as const

const EXPORT_KEYS = new Set(['resourceSpans'])
const RESOURCE_SPANS_KEYS = new Set(['resource', 'scopeSpans', 'schemaUrl'])
const RESOURCE_KEYS = new Set(['attributes', 'droppedAttributesCount'])
const SCOPE_SPANS_KEYS = new Set(['scope', 'spans', 'schemaUrl'])
const SCOPE_KEYS = new Set(['name', 'version', 'attributes', 'droppedAttributesCount'])
const SPAN_KEYS = new Set([
  'traceId', 'spanId', 'traceState', 'parentSpanId', 'flags', 'name', 'kind',
  'startTimeUnixNano', 'endTimeUnixNano', 'attributes', 'droppedAttributesCount',
  'events', 'droppedEventsCount', 'links', 'droppedLinksCount', 'status',
])
const EVENT_KEYS = new Set(['timeUnixNano', 'name', 'attributes', 'droppedAttributesCount'])
const LINK_KEYS = new Set(['traceId', 'spanId', 'traceState', 'attributes', 'droppedAttributesCount', 'flags'])
const STATUS_KEYS = new Set(['message', 'code'])
const ATTRIBUTE_KEYS = new Set(['key', 'value'])
const ANY_VALUE_KEYS = new Set([
  'stringValue', 'boolValue', 'intValue', 'doubleValue', 'arrayValue', 'kvlistValue', 'bytesValue',
])
const VALUE_LIST_KEYS = new Set(['values'])

function schemaError(message: string): RuntimeImportError {
  return new RuntimeImportError('schema', message)
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown, message: string): JsonRecord {
  if (!isRecord(value)) throw schemaError(message)
  return value
}

function array(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) throw schemaError(message)
  return value
}

function string(value: unknown, message: string): string {
  if (typeof value !== 'string') throw schemaError(message)
  return value
}

function enumValue(value: unknown, minimum: number, maximum: number, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw schemaError(message)
  }
  return value
}

function integerText(value: unknown, message: string): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw schemaError(message)
    return String(value)
  }
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) throw schemaError(message)
  return value
}

function decimal64(value: unknown, field: string): string {
  const text = integerText(value, `Runtime trace has an invalid ${field}.`)
  let parsed: bigint
  try {
    parsed = BigInt(text)
  } catch {
    throw schemaError(`Runtime trace has an invalid ${field}.`)
  }
  if (parsed < INT64_MIN || parsed > UINT64_MAX) {
    throw schemaError(`Runtime trace has an invalid ${field}.`)
  }
  return parsed.toString()
}

function unsigned64(value: unknown, field: string): string {
  const normalized = decimal64(value, field)
  if (BigInt(normalized) < 0n) throw schemaError(`Runtime trace has an invalid ${field}.`)
  return normalized
}

function signed64(value: unknown, field: string): string {
  const normalized = decimal64(value, field)
  const parsed = BigInt(normalized)
  if (parsed < INT64_MIN || parsed > INT64_MAX) throw schemaError(`Runtime trace has an invalid ${field}.`)
  return normalized
}

function unsigned32(value: unknown, field: string): string {
  if (value === undefined) return '0'
  const normalized = unsigned64(value, field)
  if (BigInt(normalized) > UINT32_MAX) throw schemaError(`Runtime trace has an invalid ${field}.`)
  return normalized
}

function flags(value: unknown, field: string): number {
  if (value === undefined) return 0
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > Number(UINT32_MAX)) {
    throw schemaError(`Runtime trace has invalid ${field}.`)
  }
  return value
}

function hexId(value: unknown, bytes: 8 | 16, field: string): string {
  if (typeof value !== 'string') {
    throw new RuntimeImportError('identity', `Runtime trace has an invalid ${field}.`)
  }
  const expectedLength = bytes * 2
  if (value.length !== expectedLength || !/^[0-9a-f]+$/i.test(value) || /^0+$/.test(value)) {
    throw new RuntimeImportError('identity', `Runtime trace has an invalid ${field}.`)
  }
  return value.toLowerCase()
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function unknownPath(base: string, key: string): string {
  return base.length === 0 ? key : `${base}.${key}`
}

function noteUnknownFields(value: JsonRecord, allowed: ReadonlySet<string>, base: string, state: NormalizeState): void {
  for (const key of Object.keys(value)) {
    if (allowed.has(key)) continue
    enforceValueBytes(key, state)
    state.unknownFieldCount += 1
    const path = unknownPath(base, key)
    const existing = state.unknownPaths.get(path)
    if (existing !== undefined) {
      state.unknownPaths.set(path, existing + 1)
    } else if (state.unknownPaths.size < MAX_UNKNOWN_PATHS) {
      state.unknownPaths.set(path, 1)
    } else {
      let largest = path
      for (const retained of state.unknownPaths.keys()) {
        if (compareText(retained, largest) > 0) largest = retained
      }
      if (largest !== path) {
        state.unknownPaths.delete(largest)
        state.unknownPaths.set(path, 1)
      }
    }
  }
}

function byteLength(value: string): number {
  return encoder.encode(value).byteLength
}

function enforceValueBytes(value: string, state: NormalizeState, decodedBytes?: number): void {
  const actual = decodedBytes ?? byteLength(value)
  if (actual > state.limits.maxValueBytes) throw RuntimeImportError.limit('maxValueBytes', actual)
}

function retainedString(value: unknown, message: string, state: NormalizeState): string {
  const decoded = string(value, message)
  enforceValueBytes(decoded, state)
  return decoded
}

function withValuePath<T>(state: NormalizeState, path: string, decode: () => T): T {
  const previous = state.valuePath
  state.valuePath = path
  try {
    return decode()
  } finally {
    state.valuePath = previous
  }
}

function base64DecodedLength(value: string): number | undefined {
  if (value === '') return 0
  if (value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return undefined
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return (value.length / 4) * 3 - padding
}

function decodeAnyValue(value: unknown, depth: number, state: NormalizeState): RuntimeValue {
  if (depth > state.limits.maxAttributeDepth) {
    throw RuntimeImportError.limit('maxAttributeDepth', depth)
  }
  const message = record(value, 'Runtime trace has an invalid attribute value.')
  noteUnknownFields(message, ANY_VALUE_KEYS, state.valuePath, state)
  const tags = [...ANY_VALUE_KEYS].filter((key) => key in message)
  if (tags.length !== 1) throw schemaError('Runtime trace has an invalid attribute value.')

  const tag = tags[0]!
  switch (tag) {
    case 'stringValue': {
      const decoded = string(message.stringValue, 'Runtime trace has an invalid string attribute value.')
      enforceValueBytes(decoded, state)
      return { type: 'string', value: decoded }
    }
    case 'boolValue':
      if (typeof message.boolValue !== 'boolean') throw schemaError('Runtime trace has an invalid boolean attribute value.')
      return { type: 'bool', value: message.boolValue }
    case 'intValue':
      return { type: 'int', value: signed64(message.intValue, 'integer attribute value') }
    case 'doubleValue':
      if (typeof message.doubleValue !== 'number' || !Number.isFinite(message.doubleValue)) {
        throw schemaError('Runtime trace has an invalid double attribute value.')
      }
      return { type: 'double', value: message.doubleValue }
    case 'bytesValue': {
      const decoded = string(message.bytesValue, 'Runtime trace has an invalid bytes attribute value.')
      const decodedLength = base64DecodedLength(decoded)
      if (decodedLength === undefined) throw schemaError('Runtime trace has an invalid bytes attribute value.')
      enforceValueBytes(decoded, state, decodedLength)
      return { type: 'bytes', value: decoded }
    }
    case 'arrayValue': {
      const list = record(message.arrayValue, 'Runtime trace has an invalid array attribute value.')
      const path = `${state.valuePath}.arrayValue`
      noteUnknownFields(list, VALUE_LIST_KEYS, path, state)
      const values = list.values === undefined ? [] : array(list.values, 'Runtime trace has an invalid array attribute value.')
      return {
        type: 'array',
        value: values.map((item) => withValuePath(state, `${path}.values[]`, () => decodeAnyValue(item, depth + 1, state))),
      }
    }
    case 'kvlistValue': {
      const list = record(message.kvlistValue, 'Runtime trace has an invalid key-value list attribute value.')
      const path = `${state.valuePath}.kvlistValue`
      noteUnknownFields(list, VALUE_LIST_KEYS, path, state)
      return {
        type: 'kvlist',
        value: decodeAttributes(list.values, `${path}.values[]`, state, depth + 1),
      }
    }
  }
  throw schemaError('Runtime trace has an invalid attribute value.')
}

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase()
  return SENSITIVE_KEYS.some((candidate) => lower === candidate)
}

function decodeAttributes(
  value: unknown,
  owner: string,
  state: NormalizeState,
  depth = 1,
): RuntimeAttribute[] {
  if (value === undefined) return []
  const values = array(value, 'Runtime trace has an invalid attribute list.')
  if (values.length > state.limits.maxAttributes) {
    throw RuntimeImportError.limit('maxAttributes', values.length)
  }

  const keys = new Set<string>()
  const decoded = values.map((item): RuntimeAttribute => {
    const attribute = record(item, 'Runtime trace has an invalid attribute.')
    noteUnknownFields(attribute, ATTRIBUTE_KEYS, owner, state)
    const key = retainedString(attribute.key, 'Runtime trace has an invalid attribute key.', state)
    if (key.length === 0 || keys.has(key)) throw schemaError('Runtime trace has duplicate or invalid attribute keys.')
    keys.add(key)
    if (!('value' in attribute)) throw schemaError('Runtime trace has an attribute without a value.')
    const decodedValue = withValuePath(state, `${owner}.value`, () => decodeAnyValue(attribute.value, depth, state))
    if (isSensitiveKey(key)) {
      state.redactedAttributes += 1
      return { key, value: { type: 'redacted' } }
    }
    return { key, value: decodedValue }
  })

  decoded.sort((left, right) => compareText(left.key, right.key))
  return decoded
}

function decodeSchemaUrl(value: unknown, state: NormalizeState): string {
  return retainedString(value, 'Runtime trace has an invalid schema URL.', state)
}

function addDroppedAttributes(state: NormalizeState, value: string): void {
  state.droppedAttributesCount += BigInt(value)
}

function decodeResource(value: unknown, schemaUrl: unknown, state: NormalizeState): RuntimeResource {
  const resource = value === undefined ? {} : record(value, 'Runtime trace has an invalid resource.')
  const path = 'resourceSpans[].resource'
  noteUnknownFields(resource, RESOURCE_KEYS, path, state)
  const droppedAttributesCount = unsigned32(resource.droppedAttributesCount, 'resource dropped attribute count')
  addDroppedAttributes(state, droppedAttributesCount)
  return {
    ...(schemaUrl === undefined ? {} : { schemaUrl: decodeSchemaUrl(schemaUrl, state) }),
    attributes: decodeAttributes(resource.attributes, `${path}.attributes[]`, state),
    droppedAttributesCount,
  }
}

function decodeScope(value: unknown, schemaUrl: unknown, state: NormalizeState): RuntimeScope {
  const scope = value === undefined ? {} : record(value, 'Runtime trace has an invalid instrumentation scope.')
  const path = 'resourceSpans[].scopeSpans[].scope'
  noteUnknownFields(scope, SCOPE_KEYS, path, state)
  const droppedAttributesCount = unsigned32(scope.droppedAttributesCount, 'scope dropped attribute count')
  addDroppedAttributes(state, droppedAttributesCount)
  return {
    ...(schemaUrl === undefined ? {} : { schemaUrl: decodeSchemaUrl(schemaUrl, state) }),
    ...(scope.name === undefined ? {} : { name: retainedString(scope.name, 'Runtime trace has an invalid scope name.', state) }),
    ...(scope.version === undefined ? {} : { version: retainedString(scope.version, 'Runtime trace has an invalid scope version.', state) }),
    attributes: decodeAttributes(scope.attributes, `${path}.attributes[]`, state),
    droppedAttributesCount,
  }
}

function decodeEvent(value: unknown, state: NormalizeState): RuntimeSpanEvent {
  const event = record(value, 'Runtime trace has an invalid span event.')
  const path = 'resourceSpans[].scopeSpans[].spans[].events[]'
  noteUnknownFields(event, EVENT_KEYS, path, state)
  if (!('timeUnixNano' in event) || !('name' in event)) throw schemaError('Runtime trace has an invalid span event.')
  const droppedAttributesCount = unsigned32(event.droppedAttributesCount, 'event dropped attribute count')
  addDroppedAttributes(state, droppedAttributesCount)
  return {
    timeUnixNano: unsigned64(event.timeUnixNano, 'event time'),
    name: retainedString(event.name, 'Runtime trace has an invalid event name.', state),
    attributes: decodeAttributes(event.attributes, `${path}.attributes[]`, state),
    droppedAttributesCount,
  }
}

function decodeLink(value: unknown, state: NormalizeState): RuntimeSpanLink {
  const link = record(value, 'Runtime trace has an invalid span link.')
  const path = 'resourceSpans[].scopeSpans[].spans[].links[]'
  noteUnknownFields(link, LINK_KEYS, path, state)
  if (!('traceId' in link) || !('spanId' in link)) throw schemaError('Runtime trace has an invalid span link.')
  const droppedAttributesCount = unsigned32(link.droppedAttributesCount, 'link dropped attribute count')
  addDroppedAttributes(state, droppedAttributesCount)
  return {
    traceId: hexId(link.traceId, 16, 'link trace ID'),
    spanId: hexId(link.spanId, 8, 'link span ID'),
    ...(link.traceState === undefined ? {} : { traceState: retainedString(link.traceState, 'Runtime trace has an invalid link trace state.', state) }),
    flags: flags(link.flags, 'link flags'),
    attributes: decodeAttributes(link.attributes, `${path}.attributes[]`, state),
    droppedAttributesCount,
  }
}

function decodeStatus(value: unknown, state: NormalizeState): RuntimeSpanStatus {
  if (value === undefined) return { code: 0 }
  const status = record(value, 'Runtime trace has an invalid span status.')
  noteUnknownFields(status, STATUS_KEYS, 'resourceSpans[].scopeSpans[].spans[].status', state)
  return {
    ...(status.message === undefined ? {} : { message: retainedString(status.message, 'Runtime trace has an invalid status message.', state) }),
    code: status.code === undefined ? 0 : enumValue(status.code, 0, 2, 'Runtime trace has an invalid status code.'),
  }
}

function decodeSpan(value: unknown, resource: RuntimeResource, scope: RuntimeScope, state: NormalizeState): RuntimeSpan {
  const span = record(value, 'Runtime trace has an invalid span.')
  const path = 'resourceSpans[].scopeSpans[].spans[]'
  noteUnknownFields(span, SPAN_KEYS, path, state)
  for (const required of ['traceId', 'spanId', 'name', 'startTimeUnixNano', 'endTimeUnixNano'] as const) {
    if (!(required in span)) throw schemaError('Runtime trace span is missing a required lower-camel field.')
  }

  const name = retainedString(span.name, 'Runtime trace has an invalid span name.', state)
  if (name.length === 0) throw schemaError('Runtime trace has an empty span name.')
  const traceId = hexId(span.traceId, 16, 'trace ID')
  const spanId = hexId(span.spanId, 8, 'span ID')
  const startTimeUnixNano = unsigned64(span.startTimeUnixNano, 'span start time')
  const endTimeUnixNano = unsigned64(span.endTimeUnixNano, 'span end time')
  if (BigInt(endTimeUnixNano) < BigInt(startTimeUnixNano)) {
    throw new RuntimeImportError('time', 'Runtime trace span ends before it starts.')
  }

  state.inputSpans += 1
  if (state.inputSpans > state.limits.maxSpans) throw RuntimeImportError.limit('maxSpans', state.inputSpans)
  state.traceIds.add(traceId)
  if (state.traceIds.size > state.limits.maxTraces) throw RuntimeImportError.limit('maxTraces', state.traceIds.size)
  const traceSpanCount = (state.traceSpanCounts.get(traceId) ?? 0) + 1
  state.traceSpanCounts.set(traceId, traceSpanCount)
  if (traceSpanCount > state.limits.maxSpansPerTrace) {
    throw RuntimeImportError.limit('maxSpansPerTrace', traceSpanCount)
  }

  const eventValues = span.events === undefined ? [] : array(span.events, 'Runtime trace has an invalid event list.')
  if (eventValues.length > state.limits.maxEventsPerSpan) {
    throw RuntimeImportError.limit('maxEventsPerSpan', eventValues.length)
  }
  const linkValues = span.links === undefined ? [] : array(span.links, 'Runtime trace has an invalid link list.')
  if (linkValues.length > state.limits.maxLinksPerSpan) {
    throw RuntimeImportError.limit('maxLinksPerSpan', linkValues.length)
  }

  const droppedAttributesCount = unsigned32(span.droppedAttributesCount, 'span dropped attribute count')
  const droppedEventsCount = unsigned32(span.droppedEventsCount, 'span dropped event count')
  const droppedLinksCount = unsigned32(span.droppedLinksCount, 'span dropped link count')
  addDroppedAttributes(state, droppedAttributesCount)
  state.droppedEventsCount += BigInt(droppedEventsCount)
  state.droppedLinksCount += BigInt(droppedLinksCount)
  const spanFlags = flags(span.flags, 'span flags')

  return {
    traceId,
    spanId,
    ...(span.parentSpanId === undefined ? {} : { parentSpanId: hexId(span.parentSpanId, 8, 'parent span ID') }),
    ...(span.traceState === undefined ? {} : { traceState: retainedString(span.traceState, 'Runtime trace has an invalid trace state.', state) }),
    flags: spanFlags,
    sampled: (spanFlags & 1) === 1,
    name,
    kind: span.kind === undefined ? 0 : enumValue(span.kind, 0, 5, 'Runtime trace has an invalid span kind.'),
    startTimeUnixNano,
    endTimeUnixNano,
    durationNano: (BigInt(endTimeUnixNano) - BigInt(startTimeUnixNano)).toString(),
    attributes: decodeAttributes(span.attributes, `${path}.attributes[]`, state),
    droppedAttributesCount,
    events: eventValues.map((event) => decodeEvent(event, state)),
    droppedEventsCount,
    links: linkValues.map((link) => decodeLink(link, state)),
    droppedLinksCount,
    status: decodeStatus(span.status, state),
    resource,
    scope,
  }
}

function compareSpans(left: RuntimeSpan, right: RuntimeSpan): number {
  return compareText(left.traceId, right.traceId)
    || (BigInt(left.startTimeUnixNano) < BigInt(right.startTimeUnixNano) ? -1
      : BigInt(left.startTimeUnixNano) > BigInt(right.startTimeUnixNano) ? 1 : 0)
    || (BigInt(left.endTimeUnixNano) < BigInt(right.endTimeUnixNano) ? -1
      : BigInt(left.endTimeUnixNano) > BigInt(right.endTimeUnixNano) ? 1 : 0)
    || compareText(left.spanId, right.spanId)
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  const pending: Array<[unknown, unknown]> = [[left, right]]
  while (pending.length > 0) {
    const [currentLeft, currentRight] = pending.pop()!
    if (Object.is(currentLeft, currentRight)) continue
    if (typeof currentLeft !== typeof currentRight) return false
    if (typeof currentLeft !== 'object' || currentLeft === null || currentRight === null) return false

    const leftIsArray = Array.isArray(currentLeft)
    if (leftIsArray !== Array.isArray(currentRight)) return false
    if (leftIsArray) {
      const leftArray = currentLeft as unknown[]
      const rightArray = currentRight as unknown[]
      if (leftArray.length !== rightArray.length) return false
      for (let index = 0; index < leftArray.length; index += 1) {
        pending.push([leftArray[index], rightArray[index]])
      }
      continue
    }

    const leftRecord = currentLeft as JsonRecord
    const rightRecord = currentRight as JsonRecord
    const leftKeys = Object.keys(leftRecord)
    const rightKeys = Object.keys(rightRecord)
    if (leftKeys.length !== rightKeys.length) return false
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(rightRecord, key)) return false
      pending.push([leftRecord[key], rightRecord[key]])
    }
  }
  return true
}

function sameRecordExcept(left: JsonRecord, right: JsonRecord, excluded: string): boolean {
  const leftKeys = Object.keys(left).filter((key) => key !== excluded)
  const rightKeys = Object.keys(right).filter((key) => key !== excluded)
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key) || !sameJsonValue(left[key], right[key])) {
      return false
    }
  }
  return true
}

function sameRawSpanEvidence(
  existing: {
    readonly rawResourceSpans: JsonRecord
    readonly rawScopeSpans: JsonRecord
    readonly rawSpan: JsonRecord
  },
  rawResourceSpans: JsonRecord,
  rawScopeSpans: JsonRecord,
  rawSpan: JsonRecord,
): boolean {
  return sameRecordExcept(existing.rawResourceSpans, rawResourceSpans, 'scopeSpans')
    && sameRecordExcept(existing.rawScopeSpans, rawScopeSpans, 'spans')
    && sameJsonValue(existing.rawSpan, rawSpan)
}

function validateLimits(limits: RuntimeImportLimits): void {
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 0) throw schemaError('Runtime normalization limits are invalid.')
  }
}

export function normalizeOtlpDocuments(
  documents: ParsedOtlpDocument[],
  options: RuntimeNormalizeOptions = {},
): NormalizedRuntimeInput {
  const limits = { ...DEFAULT_RUNTIME_IMPORT_LIMITS, ...options.limits }
  validateLimits(limits)
  const state: NormalizeState = {
    limits,
    unknownPaths: new Map(),
    traceSpanCounts: new Map(),
    traceIds: new Set(),
    unknownFieldCount: 0,
    redactedAttributes: 0,
    resourceScopeGroups: 0,
    inputSpans: 0,
    duplicateSpans: 0,
    droppedAttributesCount: 0n,
    droppedEventsCount: 0n,
    droppedLinksCount: 0n,
    valuePath: '',
  }
  const spansByIdentity = new Map<string, {
    span: RuntimeSpan
    rawResourceSpans: JsonRecord
    rawScopeSpans: JsonRecord
    rawSpan: JsonRecord
  }>()

  for (const document of documents) {
    noteUnknownFields(document.raw, EXPORT_KEYS, '', state)
    for (const rawResourceSpans of document.resourceSpans) {
      const resourceSpans = record(rawResourceSpans, 'Runtime trace has an invalid resource span group.')
      noteUnknownFields(resourceSpans, RESOURCE_SPANS_KEYS, 'resourceSpans[]', state)
      if (!('scopeSpans' in resourceSpans)) {
        throw schemaError('Runtime trace resource span group is missing required scopeSpans.')
      }
      const resource = decodeResource(resourceSpans.resource, resourceSpans.schemaUrl, state)
      const scopeSpanValues = array(resourceSpans.scopeSpans, 'Runtime trace has an invalid scope span list.')

      for (const rawScopeSpans of scopeSpanValues) {
        state.resourceScopeGroups += 1
        if (state.resourceScopeGroups > limits.maxResourceScopeGroups) {
          throw RuntimeImportError.limit('maxResourceScopeGroups', state.resourceScopeGroups)
        }
        const scopeSpans = record(rawScopeSpans, 'Runtime trace has an invalid scope span group.')
        noteUnknownFields(scopeSpans, SCOPE_SPANS_KEYS, 'resourceSpans[].scopeSpans[]', state)
        if (!('spans' in scopeSpans)) throw schemaError('Runtime trace scope span group is missing required spans.')
        const scope = decodeScope(scopeSpans.scope, scopeSpans.schemaUrl, state)
        const spanValues = array(scopeSpans.spans, 'Runtime trace has an invalid span list.')

        for (const rawSpanValue of spanValues) {
          const rawSpan = record(rawSpanValue, 'Runtime trace has an invalid span.')
          if (!('traceId' in rawSpan) || !('spanId' in rawSpan)) {
            decodeSpan(rawSpan, resource, scope, state)
            throw schemaError('Runtime trace span is missing a required lower-camel field.')
          }
          const identity = `${hexId(rawSpan.traceId, 16, 'trace ID')}/${hexId(rawSpan.spanId, 8, 'span ID')}`
          const existing = spansByIdentity.get(identity)
          if (existing !== undefined && !sameRawSpanEvidence(existing, resourceSpans, scopeSpans, rawSpan)) {
            throw new RuntimeImportError(
              'conflict',
              'Runtime trace contains a conflicting duplicate span at resourceSpans[].scopeSpans[].spans[].',
            )
          }

          const span = decodeSpan(rawSpan, resource, scope, state)
          if (existing === undefined) {
            spansByIdentity.set(identity, { span, rawResourceSpans: resourceSpans, rawScopeSpans: scopeSpans, rawSpan })
          } else {
            state.duplicateSpans += 1
          }
        }
      }
    }
  }

  const spans = [...spansByIdentity.values()].map(({ span }) => span).sort(compareSpans)
  const sampledSpans = spans.filter((span) => span.sampled).length
  return {
    spans,
    report: {
      documents: documents.length,
      resourceScopeGroups: state.resourceScopeGroups,
      traces: state.traceIds.size,
      inputSpans: state.inputSpans,
      spans: spans.length,
      duplicateSpans: state.duplicateSpans,
      sampledSpans,
      unsampledSpans: spans.length - sampledSpans,
      redactedAttributes: state.redactedAttributes,
      droppedAttributesCount: state.droppedAttributesCount.toString(),
      droppedEventsCount: state.droppedEventsCount.toString(),
      droppedLinksCount: state.droppedLinksCount.toString(),
      unknownFieldCount: state.unknownFieldCount,
      unknownFields: [...state.unknownPaths.entries()]
        .map(([path, count]) => ({ path, count }))
        .sort((left, right) => compareText(left.path, right.path)),
    },
  }
}
