import type { ReactNode } from 'react'
import type { RuntimeSpanSelection } from './RuntimeInspector.js'
import type { RuntimeViewModel } from './view-model.js'

export interface TraceRailProps {
  view: RuntimeViewModel
  selection: RuntimeSpanSelection | null
  onSelectSpan(selection: RuntimeSpanSelection): void
}

function spanLabel(view: RuntimeViewModel, spanId: string): string {
  const span = view.spansById.get(spanId)?.span
  return span === undefined ? `Unavailable recorded span ${spanId}` : `${span.name} (${spanId})`
}

function selectButton(
  view: RuntimeViewModel,
  spanId: string,
  context: string,
  selection: RuntimeSpanSelection | null,
  onSelectSpan: (selection: RuntimeSpanSelection) => void,
): ReactNode {
  const span = view.spansById.get(spanId)?.span
  if (span === undefined) return <span>{`Unavailable recorded span ${spanId}`}</span>
  if (!view.visibleSpanIds.includes(spanId)) return <span>{`${spanLabel(view, spanId)} — hidden by current filters.`}</span>
  const traceId = view.selectedTrace?.traceId
  if (traceId === undefined) return <span>{spanLabel(view, spanId)}</span>
  return (
    <button
      type="button"
      aria-label={`Select ${span.name} span ${spanId} in ${context}`}
      aria-pressed={selection?.traceId === traceId && selection.spanId === spanId}
      onClick={() => onSelectSpan({ traceId, spanId })}
    >
      {spanLabel(view, spanId)}
    </button>
  )
}

function childIds(view: RuntimeViewModel, parentSpanId: string): string[] {
  return view.selectedSpans
    .filter(({ span }) => span.relation === 'child' && span.parentSpanId === parentSpanId)
    .map(({ spanId }) => spanId)
}

function treeItem(
  view: RuntimeViewModel,
  spanId: string,
  context: string,
  selection: RuntimeSpanSelection | null,
  onSelectSpan: (selection: RuntimeSpanSelection) => void,
  visited: ReadonlySet<string> = new Set(),
): ReactNode {
  if (visited.has(spanId)) return null
  const nextVisited = new Set(visited)
  nextVisited.add(spanId)
  const children = childIds(view, spanId)
  return (
    <li key={spanId}>
      {selectButton(view, spanId, context, selection, onSelectSpan)}
      {children.length > 0 ? <ol>{children.map((childId) => treeItem(view, childId, context, selection, onSelectSpan, nextVisited))}</ol> : null}
    </li>
  )
}

function pathList(
  view: RuntimeViewModel,
  spanIds: readonly string[],
  context: string,
  selection: RuntimeSpanSelection | null,
  onSelectSpan: (selection: RuntimeSpanSelection) => void,
): ReactNode {
  return (
    <ol>
      {spanIds.map((spanId) => (
        <li key={`${context}:${spanId}`}>
          {selectButton(view, spanId, context, selection, onSelectSpan)}
        </li>
      ))}
    </ol>
  )
}

export function TraceRail({ view, selection, onSelectSpan }: TraceRailProps) {
  const firstHotPathSpanId = view.hotPathSpanIds.find((spanId) => view.visibleSpanIds.includes(spanId))
  const firstErrorSpanId = view.errorPaths
    .map((path) => [...path].reverse().find((spanId) => view.visibleSpanIds.includes(spanId)))
    .find((spanId) => spanId !== undefined)
  const traceId = view.selectedTrace?.traceId
  const hotPathUnavailableBecauseNoRoot = view.rootSpanIds.length === 0

  return (
    <aside className="cv-runtime-trace-rail" aria-label="Recorded trace structure">
      <section>
        <h3>Recorded call tree</h3>
        {view.rootSpanIds.length > 0
          ? <ol>{view.rootSpanIds.map((spanId) => treeItem(view, spanId, 'call tree', selection, onSelectSpan))}</ol>
          : <p>No recorded root spans are available.</p>}
      </section>

      <section>
        <h3>Recorded orphan spans</h3>
        {view.orphanSpanIds.length > 0
          ? <ol>{view.orphanSpanIds.map((spanId) => treeItem(view, spanId, 'orphan group', selection, onSelectSpan))}</ol>
          : <p>No recorded orphan spans.</p>}
      </section>

      <section>
        <h3>Cycle-broken spans</h3>
        {view.cycleBreakSpanIds.length > 0
          ? <ol>{view.cycleBreakSpanIds.map((spanId) => treeItem(view, spanId, 'cycle-broken group', selection, onSelectSpan))}</ol>
          : <p>No cycle-broken spans.</p>}
      </section>

      <section>
        <h3>Hot path</h3>
        <p>Hot path is the greatest sum of recorded span durations; it is not causal proof.</p>
        <button
          type="button"
          aria-label="Show hot path"
          disabled={firstHotPathSpanId === undefined}
          onClick={() => { if (firstHotPathSpanId !== undefined && traceId !== undefined) onSelectSpan({ traceId, spanId: firstHotPathSpanId }) }}
        >
          Show hot path
        </button>
        {view.hotPathSpanIds.length > 0
          ? pathList(view, view.hotPathSpanIds, 'hot path', selection, onSelectSpan)
          : <p>{hotPathUnavailableBecauseNoRoot ? 'No hot path is available because this trace has no true recorded root.' : 'No recorded hot path is available.'}</p>}
      </section>

      <section>
        <h3>Recorded error ancestry</h3>
        <p>Error path is a recorded error span and its known parent ancestry. It is not a root-cause claim.</p>
        <button
          type="button"
          aria-label="Show error paths"
          disabled={firstErrorSpanId === undefined}
          onClick={() => { if (firstErrorSpanId !== undefined && traceId !== undefined) onSelectSpan({ traceId, spanId: firstErrorSpanId }) }}
        >
          Show error paths
        </button>
        {view.errorPaths.length > 0
          ? view.errorPaths.map((spanIds, index) => (
              <section key={`error:${index}`} aria-label={`Recorded error path ${index + 1}`}>
                <h4>{`Recorded error path ${index + 1}`}</h4>
                {pathList(view, spanIds, `error path ${index + 1}`, selection, onSelectSpan)}
              </section>
            ))
          : <p>No recorded error paths.</p>}
      </section>
    </aside>
  )
}
