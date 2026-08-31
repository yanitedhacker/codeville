import type { Atlas } from '../types.js'
import {
  DEFAULT_RUNTIME_IMPORT_LIMITS,
  type DerivedRuntimeSpan,
  type RuntimeAttribute,
  type RuntimeCorrelationOptions,
  type RuntimeCompatibilityWarning,
  type RuntimeSourceMatch,
  type RuntimeTraceBundle,
  type RuntimeValue,
} from './types.js'
import { assertRuntimeBundleSerializedBytes } from './bundle-size.js'

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
  flavor: 'posix-absolute' | 'drive-absolute' | 'unc' | 'relative' | 'drive-relative' | 'rooted'
  prefix: string
  segments: string[]
  rawSegments: string[]
  escaped: boolean
}

export function correlateRuntimeSources(
  bundle: RuntimeTraceBundle,
  atlas: Atlas,
  options: RuntimeCorrelationOptions = {},
): RuntimeTraceBundle {
  const filesByPath = visibleFilesByPath(atlas)
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

  const correlated: RuntimeTraceBundle = {
    ...bundle,
    spans,
    report: {
      ...bundle.report,
      unmatchedSourceSpans,
      compatibilityWarnings: sourceWarnings(usedDeprecated),
    },
  }
  assertRuntimeBundleSerializedBytes(
    correlated,
    options.limits?.maxSerializedBundleBytes
      ?? DEFAULT_RUNTIME_IMPORT_LIMITS.maxSerializedBundleBytes,
  )
  return correlated
}

function sourceFields(attributes: RuntimeAttribute[]): SourceFields {
  const deprecated = new Set<DeprecatedSourceAttribute>()
  const path = readStringSourceAttribute(attributes, SOURCE_ATTRIBUTES[0], deprecated)
  const functionName = readStringSourceAttribute(attributes, SOURCE_ATTRIBUTES[1], deprecated)
  const lineNumber = readLineSourceAttribute(attributes, SOURCE_ATTRIBUTES[2], deprecated)
  return {
    recordedPath: path.value,
    functionName: functionName.value,
    lineNumber: lineNumber.value,
    deprecated,
    hasRecordedPath: path.value !== undefined,
  }
}

function readStringSourceAttribute(
  attributes: RuntimeAttribute[],
  names: typeof SOURCE_ATTRIBUTES[number],
  deprecated: Set<DeprecatedSourceAttribute>,
): { present: boolean; value?: string } {
  return readPreferredSourceAttribute(attributes, names, deprecated, stringSourceValue)
}

function readLineSourceAttribute(
  attributes: RuntimeAttribute[],
  names: typeof SOURCE_ATTRIBUTES[number],
  deprecated: Set<DeprecatedSourceAttribute>,
): { present: boolean; value?: string } {
  return readPreferredSourceAttribute(attributes, names, deprecated, lineSourceValue)
}

function readPreferredSourceAttribute(
  attributes: RuntimeAttribute[],
  names: typeof SOURCE_ATTRIBUTES[number],
  deprecated: Set<DeprecatedSourceAttribute>,
  extract: (value: RuntimeValue) => string | undefined,
): { present: boolean; value?: string } {
  const stable = attributes.find((attribute) => attribute.key === names.stable)
  if (stable !== undefined) return { present: true, value: extract(stable.value) }

  const legacy = attributes.find((attribute) => attribute.key === names.deprecated)
  if (legacy === undefined) return { present: false }
  const value = extract(legacy.value)
  if (value === undefined) return { present: true }
  deprecated.add(names.deprecated)
  return { present: true, value }
}

function stringSourceValue(value: RuntimeValue): string | undefined {
  return value.type === 'string' ? value.value : undefined
}

function lineSourceValue(value: RuntimeValue): string | undefined {
  if (value.type !== 'int') return undefined
  try {
    const line = BigInt(value.value)
    return line > 0n && line <= BigInt(Number.MAX_SAFE_INTEGER) ? value.value : undefined
  } catch {
    return undefined
  }
}

function matchSource(
  fields: SourceFields,
  filesByPath: ReadonlyMap<string, Atlas['nodes'][number] | undefined>,
  sourceRoot: NormalizedPath | undefined,
): RuntimeSourceMatch | undefined {
  const recorded = normalizePath(fields.recordedPath!)
  const path = recorded.flavor === 'relative'
    ? normalizedRelativePath(recorded)
    : isAbsoluteFlavor(recorded.flavor)
      ? relativePathUnderRoot(recorded, sourceRoot)
      : undefined
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
  if (sourceRoot === undefined || !isAbsoluteFlavor(sourceRoot.flavor) || sourceRoot.escaped || recorded.escaped) return undefined
  if (recorded.flavor !== sourceRoot.flavor || recorded.prefix !== sourceRoot.prefix || recorded.segments.length < sourceRoot.segments.length) return undefined
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
  const flavor = classifyPath(value)
  const slashPath = value.replace(/\\/g, '/')
  const drive = /^([A-Za-z]:)\//.exec(slashPath)
  const uncSegments = flavor === 'unc'
    ? slashPath.replace(/^\/+/u, '').split('/').filter((segment) => segment !== '' && segment !== '.')
    : undefined
  const prefix = flavor === 'unc'
    ? uncSegments !== undefined && uncSegments.length >= 2 ? `//${uncSegments[0]!}/${uncSegments[1]!}` : ''
    : drive?.[1] ?? (flavor === 'posix-absolute' ? '/' : '')
  const withoutPrefix = flavor === 'unc'
    ? uncSegments?.slice(2).join('/') ?? ''
    : drive === null ? slashPath : slashPath.slice(drive[0].length)
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

  return { flavor, prefix, segments, rawSegments, escaped }
}

function classifyPath(value: string): NormalizedPath['flavor'] {
  if (/^(?:\\\\|\/\/)/u.test(value)) return 'unc'
  if (/^[A-Za-z]:[\\/]/u.test(value)) return 'drive-absolute'
  if (/^[A-Za-z]:/u.test(value)) return 'drive-relative'
  if (value.startsWith('/')) return 'posix-absolute'
  if (value.startsWith('\\')) return 'rooted'
  return 'relative'
}

function isAbsoluteFlavor(flavor: NormalizedPath['flavor']): boolean {
  return flavor === 'posix-absolute' || flavor === 'drive-absolute' || flavor === 'unc'
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

function visibleFilesByPath(atlas: Atlas): Map<string, Atlas['nodes'][number] | undefined> {
  const filesByPath = new Map<string, Atlas['nodes'][number] | undefined>()
  for (const node of atlas.nodes) {
    if (node.kind !== 'file') continue
    if (filesByPath.has(node.path)) filesByPath.set(node.path, undefined)
    else filesByPath.set(node.path, node)
  }
  return filesByPath
}
