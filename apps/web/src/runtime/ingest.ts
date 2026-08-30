import {
  correlateRuntimeSources,
  DEFAULT_RUNTIME_IMPORT_LIMITS,
  importOtlpTraceJson,
  RuntimeImportError,
  type Atlas,
  type RuntimeSourceOptions,
  type RuntimeTraceBundle,
} from '@codeville/core'

export async function ingestRuntimeFile(
  file: File,
  atlas: Atlas,
  options: RuntimeSourceOptions = {},
): Promise<RuntimeTraceBundle> {
  if (file.size > DEFAULT_RUNTIME_IMPORT_LIMITS.maxInputBytes) {
    throw RuntimeImportError.limit('maxInputBytes', file.size)
  }

  const bytes = await file.arrayBuffer()
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new RuntimeImportError('syntax', 'Runtime trace is not valid UTF-8.')
  }

  const imported = importOtlpTraceJson(text)
  return correlateRuntimeSources(imported, atlas, options)
}
