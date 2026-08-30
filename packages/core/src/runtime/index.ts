import { deriveRuntimeTraces } from './derive.js'
import { normalizeOtlpDocuments } from './normalize.js'
import { parseOtlpDocuments } from './otlp-json.js'
import type { RuntimeImportOptions, RuntimeTraceBundle } from './types.js'

export function importOtlpTraceJson(
  text: string,
  options: RuntimeImportOptions = {},
): RuntimeTraceBundle {
  const documents = parseOtlpDocuments(text, options)
  const normalized = normalizeOtlpDocuments(documents, options)
  return deriveRuntimeTraces(normalized)
}

export { deriveRuntimeTraces } from './derive.js'
export { correlateRuntimeSources } from './correlate.js'
export * from './types.js'
