import type {
  DerivedRuntimeSpan,
  RuntimeCompatibilityWarning,
  RuntimeTrace,
  RuntimeTraceBundle,
} from '@codeville/core'

export const UNKNOWN_SERVICE = '(unknown service)'

export interface RuntimeFilters {
  service: string | null
  status: 'all' | 'unset' | 'ok' | 'error'
  minDurationNano: string
  errorsOnly: boolean
}

export type RuntimeDisplayStatus = 'unset' | 'ok' | 'error'

export interface RuntimeDisplaySpan {
  span: DerivedRuntimeSpan
  spanId: string
  serviceName: string
  status: RuntimeDisplayStatus
  durationLabel: string
}

export interface RuntimeViewModel {
  selectedTrace: RuntimeTrace | null
  selectedSpanIds: readonly string[]
  selectedSpans: readonly RuntimeDisplaySpan[]
  visibleSpanIds: readonly string[]
  visibleSpans: readonly RuntimeDisplaySpan[]
  spansById: ReadonlyMap<string, RuntimeDisplaySpan>
  rootSpanIds: readonly string[]
  orphanSpanIds: readonly string[]
  cycleBreakSpanIds: readonly string[]
  hotPathSpanIds: readonly string[]
  errorPaths: readonly (readonly string[])[]
  warnings: readonly RuntimeCompatibilityWarning[]
  warning: string | null
  ancestorSpanIds(spanId: string): readonly string[]
  descendantSpanIds(spanId: string): readonly string[]
}

const EMPTY_IDS: readonly string[] = []
const EMPTY_SPANS: readonly RuntimeDisplaySpan[] = []
const EMPTY_PATHS: readonly (readonly string[])[] = []
const EMPTY_WARNINGS: readonly RuntimeCompatibilityWarning[] = []

function serviceName(span: DerivedRuntimeSpan): string {
  const attribute = span.resource.attributes.find((candidate) => candidate.key === 'service.name')
  return attribute?.value.type === 'string' && attribute.value.value !== ''
    ? attribute.value.value
    : UNKNOWN_SERVICE
}

function statusFor(code: number): RuntimeDisplayStatus {
  if (code === 1) return 'ok'
  if (code === 2) return 'error'
  return 'unset'
}

function minimumDuration(value: string): bigint {
  return /^\d+$/.test(value) ? BigInt(value) : 0n
}

function isVisible(display: RuntimeDisplaySpan, filters: RuntimeFilters, minimum: bigint): boolean {
  if (filters.service !== null && display.serviceName !== filters.service) return false
  if (filters.status !== 'all' && display.status !== filters.status) return false
  if (filters.errorsOnly && display.status !== 'error') return false
  return BigInt(display.span.durationNano) >= minimum
}

function emptyView(warning: string, warnings: readonly RuntimeCompatibilityWarning[]): RuntimeViewModel {
  const spansById = new Map<string, RuntimeDisplaySpan>()
  return {
    selectedTrace: null,
    selectedSpanIds: EMPTY_IDS,
    selectedSpans: EMPTY_SPANS,
    visibleSpanIds: EMPTY_IDS,
    visibleSpans: EMPTY_SPANS,
    spansById,
    rootSpanIds: EMPTY_IDS,
    orphanSpanIds: EMPTY_IDS,
    cycleBreakSpanIds: EMPTY_IDS,
    hotPathSpanIds: EMPTY_IDS,
    errorPaths: EMPTY_PATHS,
    warnings,
    warning,
    ancestorSpanIds: () => EMPTY_IDS,
    descendantSpanIds: () => EMPTY_IDS,
  }
}

function relationAccessors(spansById: ReadonlyMap<string, RuntimeDisplaySpan>): Pick<RuntimeViewModel, 'ancestorSpanIds' | 'descendantSpanIds'> {
  const children = new Map<string, string[]>()
  for (const display of spansById.values()) {
    const { span } = display
    if (span.relation !== 'child' || span.parentSpanId === undefined || !spansById.has(span.parentSpanId)) continue
    const childIds = children.get(span.parentSpanId) ?? []
    childIds.push(span.spanId)
    children.set(span.parentSpanId, childIds)
  }

  return {
    ancestorSpanIds(spanId: string): readonly string[] {
      const ancestors: string[] = []
      const visited = new Set<string>([spanId])
      let current = spansById.get(spanId)
      while (current?.span.relation === 'child' && current.span.parentSpanId !== undefined) {
        const parentId = current.span.parentSpanId
        if (visited.has(parentId) || !spansById.has(parentId)) break
        ancestors.unshift(parentId)
        visited.add(parentId)
        current = spansById.get(parentId)
      }
      return ancestors
    },
    descendantSpanIds(spanId: string): readonly string[] {
      const descendants: string[] = []
      const pending = [...(children.get(spanId) ?? [])]
      while (pending.length > 0) {
        const childId = pending.shift()!
        descendants.push(childId)
        pending.push(...(children.get(childId) ?? []))
      }
      return descendants
    },
  }
}

/**
 * Projects existing runtime evidence into deterministic display rows. It never
 * changes trace order or graph/path evidence produced by the core package.
 */
export function buildRuntimeView(bundle: RuntimeTraceBundle, traceId: string, filters: RuntimeFilters): RuntimeViewModel {
  const warnings = bundle.report.compatibilityWarnings ?? EMPTY_WARNINGS
  const selectedTrace = bundle.traces.find((trace) => trace.traceId === traceId)
  if (!selectedTrace) return emptyView('Selected trace is unavailable.', warnings)

  const bySpanId = new Map(
    bundle.spans
      .filter((span) => span.traceId === selectedTrace.traceId)
      .map((span) => [span.spanId, span]),
  )
  const selectedSpans: RuntimeDisplaySpan[] = []
  for (const spanId of selectedTrace.spanIds) {
    const span = bySpanId.get(spanId)
    if (!span) continue
    selectedSpans.push({
      span,
      spanId: span.spanId,
      serviceName: serviceName(span),
      status: statusFor(span.status.code),
      durationLabel: `${span.durationNano} ns`,
    })
  }

  const spansById = new Map(selectedSpans.map((display) => [display.spanId, display]))
  const minimum = minimumDuration(filters.minDurationNano)
  const visibleSpans = selectedSpans.filter((display) => isVisible(display, filters, minimum))
  const relations = relationAccessors(spansById)

  return {
    selectedTrace,
    selectedSpanIds: selectedTrace.spanIds,
    selectedSpans,
    visibleSpanIds: visibleSpans.map((display) => display.spanId),
    visibleSpans,
    spansById,
    rootSpanIds: selectedTrace.rootSpanIds,
    orphanSpanIds: selectedTrace.orphanSpanIds,
    cycleBreakSpanIds: selectedTrace.cycleBreakSpanIds,
    hotPathSpanIds: selectedTrace.hotPathSpanIds,
    errorPaths: selectedTrace.errorPaths,
    warnings,
    warning: null,
    ...relations,
  }
}
