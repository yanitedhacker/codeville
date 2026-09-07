import {
  DEFAULT_RUNTIME_IMPORT_LIMITS,
  RuntimeImportError,
  type DerivedRuntimeSpan,
  type NormalizedRuntimeInput,
  type RuntimeImportOptions,
  type RuntimeSpan,
  type RuntimeSpanRelation,
  type RuntimeTrace,
  type RuntimeTraceBundle,
} from './types.js'
import { assertRuntimeBundleSerializedBytes } from './bundle-size.js'

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareDecimal(left: string, right: string): number {
  const leftValue = BigInt(left)
  const rightValue = BigInt(right)
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
}

function compareSpans(left: RuntimeSpan, right: RuntimeSpan): number {
  return compareText(left.traceId, right.traceId)
    || compareDecimal(left.startTimeUnixNano, right.startTimeUnixNano)
    || compareDecimal(left.endTimeUnixNano, right.endTimeUnixNano)
    || compareText(left.spanId, right.spanId)
}

function compareSpanIdPaths(left: string[], right: string[]): number {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const order = compareText(left[index]!, right[index]!)
    if (order !== 0) return order
  }
  return left.length - right.length
}

function cycleBreaks(spans: RuntimeSpan[], spansById: ReadonlyMap<string, RuntimeSpan>): Set<string> {
  const processed = new Set<string>()
  const breaks = new Set<string>()

  for (const span of spans) {
    if (processed.has(span.spanId)) continue
    const path: string[] = []
    const pathIndexes = new Map<string, number>()
    let current: string | undefined = span.spanId

    while (current !== undefined && !processed.has(current)) {
      const cycleStart = pathIndexes.get(current)
      if (cycleStart !== undefined) {
        const cycle = path.slice(cycleStart)
        breaks.add(cycle.reduce((greatest, spanId) => compareText(greatest, spanId) < 0 ? spanId : greatest))
        break
      }

      pathIndexes.set(current, path.length)
      path.push(current)
      const parentSpanId: string | undefined = spansById.get(current)?.parentSpanId
      current = parentSpanId !== undefined && spansById.has(parentSpanId) ? parentSpanId : undefined
    }

    for (const spanId of path) processed.add(spanId)
  }

  return breaks
}

interface DerivedGraph {
  relations: Map<string, RuntimeSpanRelation>
  derivedParents: Map<string, string>
  children: Map<string, RuntimeSpan[]>
  rootSpanIds: string[]
  orphanSpanIds: string[]
  cycleBreakSpanIds: string[]
}

function deriveGraph(spans: RuntimeSpan[]): DerivedGraph {
  const spansById = new Map(spans.map((span) => [span.spanId, span]))
  const breaks = cycleBreaks(spans, spansById)
  const relations = new Map<string, RuntimeSpanRelation>()
  const derivedParents = new Map<string, string>()
  const children = new Map<string, RuntimeSpan[]>()
  const rootSpanIds: string[] = []
  const orphanSpanIds: string[] = []
  const cycleBreakSpanIds: string[] = []

  for (const span of spans) {
    let relation: RuntimeSpanRelation
    if (span.parentSpanId === undefined) {
      relation = 'root'
      rootSpanIds.push(span.spanId)
    } else if (breaks.has(span.spanId)) {
      relation = 'cycle-broken'
      cycleBreakSpanIds.push(span.spanId)
    } else if (!spansById.has(span.parentSpanId)) {
      relation = 'orphan'
      orphanSpanIds.push(span.spanId)
    } else {
      relation = 'child'
      derivedParents.set(span.spanId, span.parentSpanId)
      const siblings = children.get(span.parentSpanId) ?? []
      siblings.push(span)
      children.set(span.parentSpanId, siblings)
    }
    relations.set(span.spanId, relation)
  }

  for (const siblings of children.values()) siblings.sort(compareSpans)
  return { relations, derivedParents, children, rootSpanIds, orphanSpanIds, cycleBreakSpanIds }
}

interface WeightedNode {
  total: bigint
  nextSpanId?: string
}

interface WeightedPath {
  total: bigint
  spanIds: string[]
}

function nonNegativeDuration(span: RuntimeSpan): bigint {
  const duration = BigInt(span.durationNano)
  return duration < 0n ? 0n : duration
}

function bestPathFromRoot(
  root: RuntimeSpan,
  children: ReadonlyMap<string, RuntimeSpan[]>,
): WeightedPath {
  const postOrder: RuntimeSpan[] = []
  const stack: Array<{ span: RuntimeSpan; visited: boolean }> = [{ span: root, visited: false }]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current.visited) {
      postOrder.push(current.span)
      continue
    }
    stack.push({ span: current.span, visited: true })
    const descendants = children.get(current.span.spanId) ?? []
    for (let index = descendants.length - 1; index >= 0; index -= 1) {
      stack.push({ span: descendants[index]!, visited: false })
    }
  }

  const bestNodes = new Map<string, WeightedNode>()
  for (const span of postOrder) {
    let bestChild: RuntimeSpan | undefined
    for (const child of children.get(span.spanId) ?? []) {
      const candidate = bestNodes.get(child.spanId)!
      const currentBest = bestChild === undefined ? undefined : bestNodes.get(bestChild.spanId)!
      if (bestChild === undefined
        || candidate.total > currentBest!.total
        || (candidate.total === currentBest!.total && compareText(child.spanId, bestChild.spanId) < 0)) {
        bestChild = child
      }
    }
    const bestChildNode = bestChild === undefined ? undefined : bestNodes.get(bestChild.spanId)!
    bestNodes.set(span.spanId, {
      total: nonNegativeDuration(span) + (bestChildNode?.total ?? 0n),
      ...(bestChild === undefined ? {} : { nextSpanId: bestChild.spanId }),
    })
  }

  const spanIds: string[] = []
  let current: string | undefined = root.spanId
  while (current !== undefined) {
    spanIds.push(current)
    current = bestNodes.get(current)?.nextSpanId
  }
  return { total: bestNodes.get(root.spanId)!.total, spanIds }
}

function hotPath(
  rootSpanIds: string[],
  spansById: ReadonlyMap<string, RuntimeSpan>,
  children: ReadonlyMap<string, RuntimeSpan[]>,
): string[] {
  let best: { path: WeightedPath; firstStart: string } | undefined
  for (const rootSpanId of rootSpanIds) {
    const root = spansById.get(rootSpanId)!
    const path = bestPathFromRoot(root, children)
    if (best === undefined
      || path.total > best.path.total
      || (path.total === best.path.total && compareDecimal(root.startTimeUnixNano, best.firstStart) < 0)
      || (path.total === best.path.total
        && compareDecimal(root.startTimeUnixNano, best.firstStart) === 0
        && compareSpanIdPaths(path.spanIds, best.path.spanIds) < 0)) {
      best = { path, firstStart: root.startTimeUnixNano }
    }
  }
  return best?.path.spanIds ?? []
}

function ancestryLength(spanId: string, derivedParents: ReadonlyMap<string, string>): number {
  let length = 1
  let current = spanId
  while (derivedParents.has(current)) {
    current = derivedParents.get(current)!
    length += 1
  }
  return length
}

function ancestry(spanId: string, length: number, derivedParents: ReadonlyMap<string, string>): string[] {
  const path = new Array<string>(length)
  let current = spanId
  for (let index = length - 1; index >= 0; index -= 1) {
    path[index] = current
    current = derivedParents.get(current) ?? current
  }
  return path
}

function errorPaths(
  spans: RuntimeSpan[],
  derivedParents: ReadonlyMap<string, string>,
  maxErrorPathIds: number,
  retainedBefore: number,
): string[][] {
  const errors: Array<{ span: RuntimeSpan; length: number }> = []
  let totalPathIds = retainedBefore
  for (const span of spans) {
    if (span.status.code !== 2) continue
    const length = ancestryLength(span.spanId, derivedParents)
    totalPathIds += length
    if (totalPathIds > maxErrorPathIds) {
      throw RuntimeImportError.limit('maxErrorPathIds', totalPathIds)
    }
    errors.push({ span, length })
  }

  return errors
    .map(({ span, length }) => ({ span, path: ancestry(span.spanId, length, derivedParents) }))
    .sort((left, right) => compareDecimal(left.span.endTimeUnixNano, right.span.endTimeUnixNano)
      || right.path.length - left.path.length
      || compareSpanIdPaths(left.path, right.path))
    .map(({ path }) => path)
}

function deriveTrace(
  spans: RuntimeSpan[],
  maxErrorPathIds: number,
  retainedErrorPathIds: number,
): { trace: RuntimeTrace; spans: DerivedRuntimeSpan[]; errorPathIds: number } {
  const graph = deriveGraph(spans)
  const spansById = new Map(spans.map((span) => [span.spanId, span]))
  const derivedErrorPaths = errorPaths(spans, graph.derivedParents, maxErrorPathIds, retainedErrorPathIds)
  const trace: RuntimeTrace = {
    traceId: spans[0]!.traceId,
    startTimeUnixNano: spans.reduce((minimum, span) => compareDecimal(span.startTimeUnixNano, minimum) < 0 ? span.startTimeUnixNano : minimum, spans[0]!.startTimeUnixNano),
    endTimeUnixNano: spans.reduce((maximum, span) => compareDecimal(span.endTimeUnixNano, maximum) > 0 ? span.endTimeUnixNano : maximum, spans[0]!.endTimeUnixNano),
    spanIds: spans.map((span) => span.spanId),
    rootSpanIds: graph.rootSpanIds,
    orphanSpanIds: graph.orphanSpanIds,
    cycleBreakSpanIds: graph.cycleBreakSpanIds,
    hotPathSpanIds: hotPath(graph.rootSpanIds, spansById, graph.children),
    errorPaths: derivedErrorPaths,
  }
  return {
    trace,
    spans: spans.map((span) => ({ ...span, relation: graph.relations.get(span.spanId)! })),
    errorPathIds: derivedErrorPaths.reduce((total, path) => total + path.length, 0),
  }
}

export function deriveRuntimeTraces(
  input: NormalizedRuntimeInput,
  options: RuntimeImportOptions = {},
): RuntimeTraceBundle {
  const limits = { ...DEFAULT_RUNTIME_IMPORT_LIMITS, ...options.limits }
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RuntimeImportError('schema', 'Runtime normalization limits are invalid.')
    }
  }
  const sortedSpans = [...input.spans].sort(compareSpans)
  const tracesById = new Map<string, RuntimeSpan[]>()
  for (const span of sortedSpans) {
    const traceSpans = tracesById.get(span.traceId) ?? []
    traceSpans.push(span)
    tracesById.set(span.traceId, traceSpans)
  }

  const traces: RuntimeTrace[] = []
  const spans: DerivedRuntimeSpan[] = []
  let retainedErrorPathIds = 0
  for (const traceId of [...tracesById.keys()].sort(compareText)) {
    const derived = deriveTrace(tracesById.get(traceId)!, limits.maxErrorPathIds, retainedErrorPathIds)
    traces.push(derived.trace)
    spans.push(...derived.spans)
    retainedErrorPathIds += derived.errorPathIds
  }

  const bundle: RuntimeTraceBundle = {
    version: 1,
    format: 'otlp-json',
    traces,
    spans,
    report: input.report,
  }
  assertRuntimeBundleSerializedBytes(bundle, limits.maxSerializedBundleBytes)
  return bundle
}
