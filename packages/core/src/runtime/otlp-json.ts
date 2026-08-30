import {
  DEFAULT_RUNTIME_IMPORT_LIMITS,
  RuntimeImportError,
  type RuntimeImportLimits,
} from './types.js'

type JsonRecord = Record<string, unknown>

export interface ParsedOtlpDocument {
  readonly resourceSpans: unknown[]
  readonly raw: JsonRecord
}

export interface ParseOtlpDocumentsOptions {
  readonly limits?: Partial<RuntimeImportLimits>
}

const encoder = new TextEncoder()
const NON_TRACE_SIGNALS = ['resourceMetrics', 'resourceLogs', 'resourceProfiles'] as const

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function byteLength(text: string): number {
  return encoder.encode(text).byteLength
}

function syntaxError(): RuntimeImportError {
  return new RuntimeImportError('syntax', 'Runtime trace input is not valid JSON.')
}

function validateDocument(value: unknown): ParsedOtlpDocument {
  if (!isRecord(value) || !Array.isArray(value.resourceSpans)) {
    throw new RuntimeImportError('schema', 'Runtime trace input must be an OTLP trace object with resourceSpans.')
  }

  if (NON_TRACE_SIGNALS.some((signal) => signal in value)) {
    throw new RuntimeImportError('schema', 'Runtime trace input contains mixed telemetry signals.')
  }

  return { resourceSpans: value.resourceSpans, raw: value }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw syntaxError()
  }
}

export function parseOtlpDocuments(
  text: string,
  options: ParseOtlpDocumentsOptions = {},
): ParsedOtlpDocument[] {
  const limits = { ...DEFAULT_RUNTIME_IMPORT_LIMITS, ...options.limits }
  const inputBytes = byteLength(text)
  if (inputBytes > limits.maxInputBytes) {
    throw RuntimeImportError.limit('maxInputBytes', inputBytes)
  }

  try {
    return [validateDocument(JSON.parse(text.trim()))]
  } catch (error) {
    if (error instanceof RuntimeImportError) throw error
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < 2) throw syntaxError()
  if (lines.length > limits.maxTraces) {
    throw RuntimeImportError.limit('maxTraces', lines.length)
  }

  return lines.map((line) => {
    const lineBytes = byteLength(line)
    if (lineBytes > limits.maxJsonLineBytes) {
      throw RuntimeImportError.limit('maxJsonLineBytes', lineBytes)
    }
    return validateDocument(parseJson(line))
  })
}
