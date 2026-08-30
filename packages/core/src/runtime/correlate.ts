import type { Atlas } from '../types.js'
import type {
  DerivedRuntimeSpan,
  RuntimeAttribute,
  RuntimeCompatibilityWarning,
  RuntimeSourceMatch,
  RuntimeSourceOptions,
  RuntimeTraceBundle,
  RuntimeValue,
} from './types.js'

type DeprecatedSourceAttribute = RuntimeCompatibilityWarning['attribute']

const SOURCE_ATTRIBUTES = [
  { stable: 'code.file.path', deprecated: 'code.filepath' },
  { stable: 'code.function.name', deprecated: 'code.function' },
  { stable: 'code.line.number', deprecated: 'code.lineno' },
] as const

interface SourceFields {
  recordedPath?: string
  functionName?: string
  lineNumber?: string
  deprecated: Set<DeprecatedSourceAttribute>
  hasRecordedPath: boolean
}

interface NormalizedPath {
  absolute: boolean
  prefix: string
  segments: string[]
  rawSegments: string[]
  escaped: boolean
}

export function correlateRuntimeSources(
  bundle: RuntimeTraceBundle,
  atlas: Atlas,
  options: RuntimeSourceOptions = {},
): RuntimeTraceBundle {
  const filesByPath = new Map(
    atlas.nodes
      .filter((node) => node.kind === 'file')
      .map((node) => [node.path, node] as const),
  )
  const sourceRoot = options.sourceRoot === undefined ? undefined : normalizePath(options.sourceRoot)
  const usedDeprecated = new Set<DeprecatedSourceAttribute>()
  let unmatchedSourceSpans = 0

  const spans = bundle.spans.map((span) => {
    const fields = sourceFields(span.attributes)
    for (const attribute of fields.deprecated) usedDeprecated.add(attribute)
    const match = fields.recordedPath === undefined
      ? undefined
      : matchSource(fields, filesByPath, sourceRoot)

    if (fields.hasRecordedPath && match === undefined) unmatchedSourceSpans += 1
    const { source: _previousSource, ...evidence } = span
    return match === undefined ? evidence : { ...evidence, source: match }
  })

  return {
    ...bundle,
    spans,
    report: {
      ...bundle.report,
      unmatchedSourceSpans,
      compatibilityWarnings: sourceWarnings(usedDeprecated),
    },
  }
}

function sourceFields(attributes: RuntimeAttribute[]): SourceFields {
  const deprecated = new Set<DeprecatedSourceAttribute>()
  const path = readSourceAttribute(attributes, SOURCE_ATTRIBUTES[0], deprecated)
  const functionName = readSourceAttribute(attributes, SOURCE_ATTRIBUTES[1], deprecated)
  const lineNumber = readSourceAttribute(attributes, SOURCE_ATTRIBUTES[2], deprecated)
  return {
    recordedPath: path.value,
    functionName: functionName.value,
    lineNumber: lineNumber.value,
    deprecated,
    hasRecordedPath: path.present,
  }
}

function readSourceAttribute(
  attributes: RuntimeAttribute[],
  names: typeof SOURCE_ATTRIBUTES[number],
  deprecated: Set<DeprecatedSourceAttribute>,
): { present: boolean; value?: string } {
  const stable = attributes.find((attribute) => attribute.key === names.stable)
  if (stable !== undefined) return { present: true, value: sourceValue(stable.value) }

  const legacy = attributes.find((attribute) => attribute.key === names.deprecated)
  if (legacy === undefined) return { present: false }
  deprecated.add(names.deprecated)
  return { present: true, value: sourceValue(legacy.value) }
}

function sourceValue(value: RuntimeValue): string | undefined {
  return value.type === 'string' || value.type === 'int' ? value.value : undefined
}

function matchSource(
  fields: SourceFields,
  filesByPath: ReadonlyMap<string, Atlas['nodes'][number]>,
  sourceRoot: NormalizedPath | undefined,
): RuntimeSourceMatch | undefined {
  const recorded = normalizePath(fields.recordedPath!)
  const path = recorded.absolute
    ? relativePathUnderRoot(recorded, sourceRoot)
    : normalizedRelativePath(recorded)
  if (path === undefined) return undefined

  const node = filesByPath.get(path)
  if (node === undefined) return undefined
  return {
    nodeId: node.id,
    path: node.path,
    recordedPath: fields.recordedPath!,
    ...(fields.functionName === undefined ? {} : { functionName: fields.functionName }),
    ...(fields.lineNumber === undefined ? {} : { lineNumber: fields.lineNumber }),
    kind: 'exact-file',
  }
}

function relativePathUnderRoot(recorded: NormalizedPath, sourceRoot: NormalizedPath | undefined): string | undefined {
  if (sourceRoot === undefined || !sourceRoot.absolute || sourceRoot.escaped || recorded.escaped) return undefined
  if (recorded.prefix !== sourceRoot.prefix || recorded.segments.length < sourceRoot.segments.length) return undefined
  for (let index = 0; index < sourceRoot.segments.length; index += 1) {
    if (recorded.segments[index] !== sourceRoot.segments[index]) return undefined
  }
  const remainder = relativeSegmentsWithinRoot(recorded.rawSegments, sourceRoot.segments)
  return remainder?.join('/') || undefined
}

function normalizedRelativePath(path: NormalizedPath): string | undefined {
  if (path.escaped || path.segments.length === 0) return undefined
  return path.segments.join('/')
}

function normalizePath(value: string): NormalizedPath {
  const path = value.replace(/\\+/g, '/').replace(/\/+/g, '/')
  const drive = /^([A-Za-z]:)\//.exec(path)
  const absolute = drive !== null || path.startsWith('/')
  const prefix = drive?.[1] ?? (absolute ? '/' : '')
  const withoutPrefix = drive === null ? path : path.slice(drive[0].length)
  const rawSegments = withoutPrefix.split('/').filter((segment) => segment !== '' && segment !== '.')
  const segments: string[] = []
  let escaped = false

  for (const segment of rawSegments) {
    if (segment === '..') {
      if (segments.length === 0) escaped = true
      else segments.pop()
      continue
    }
    segments.push(segment)
  }

  return { absolute, prefix, segments, rawSegments, escaped }
}

function relativeSegmentsWithinRoot(rawSegments: readonly string[], rootSegments: readonly string[]): string[] | undefined {
  if (rawSegments.length < rootSegments.length) return undefined
  for (let index = 0; index < rootSegments.length; index += 1) {
    if (rawSegments[index] !== rootSegments[index]) return undefined
  }

  const relative: string[] = []
  for (const segment of rawSegments.slice(rootSegments.length)) {
    if (segment === '..') {
      if (relative.length === 0) return undefined
      relative.pop()
    } else {
      relative.push(segment)
    }
  }
  return relative
}

function sourceWarnings(usedDeprecated: ReadonlySet<DeprecatedSourceAttribute>): RuntimeCompatibilityWarning[] {
  return SOURCE_ATTRIBUTES
    .map(({ deprecated }) => deprecated)
    .filter((attribute): attribute is DeprecatedSourceAttribute => usedDeprecated.has(attribute))
    .map((attribute) => ({ code: 'deprecated-runtime-source-attribute', attribute }))
}
