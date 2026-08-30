import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Atlas, RuntimeTraceBundle } from '@codeville/core'
import { RuntimeInspector, type RuntimeInspectorTab } from './RuntimeInspector.js'
import { Timeline } from './Timeline.js'
import { TraceRail } from './TraceRail.js'
import { buildRuntimeView, type RuntimeFilters, type RuntimeViewModel } from './view-model.js'

export interface RuntimeLensProps {
  atlas: Atlas
  runtime: RuntimeTraceBundle
  onShowStatic(): void
  onOpenSource(nodeId: string): void
  onClearRuntime(): void
  footerActions?: ReactNode
}

const INITIAL_FILTERS: RuntimeFilters = {
  service: null,
  status: 'all',
  minDurationNano: '0',
  errorsOnly: false,
}

function formattedNano(value: bigint | string): string {
  try {
    return BigInt(value).toLocaleString('en-US')
  } catch {
    return String(value)
  }
}

function isNonZero(value: string): boolean {
  try {
    return BigInt(value) !== 0n
  } catch {
    return value !== '' && value !== '0'
  }
}

function traceDuration(view: RuntimeViewModel): string {
  const trace = view.selectedTrace
  if (trace === null) return '0'
  try {
    return (BigInt(trace.endTimeUnixNano) - BigInt(trace.startTimeUnixNano)).toString()
  } catch {
    return 'unavailable'
  }
}

function warningItems(runtime: RuntimeTraceBundle, view: RuntimeViewModel): ReactNode[] {
  const { report } = runtime
  const warnings: ReactNode[] = []
  if (report.sampledSpans > 0 || report.unsampledSpans > 0) {
    warnings.push(<li key="sampling">{`Sampling: ${report.sampledSpans} sampled ${report.sampledSpans === 1 ? 'span' : 'spans'}; ${report.unsampledSpans} unsampled ${report.unsampledSpans === 1 ? 'span' : 'spans'}.`}</li>)
  }
  if (isNonZero(report.droppedAttributesCount)) warnings.push(<li key="dropped-attributes">{`OTLP dropped attributes: ${report.droppedAttributesCount}`}</li>)
  if (isNonZero(report.droppedEventsCount)) warnings.push(<li key="dropped-events">{`OTLP dropped events: ${report.droppedEventsCount}`}</li>)
  if (isNonZero(report.droppedLinksCount)) warnings.push(<li key="dropped-links">{`OTLP dropped links: ${report.droppedLinksCount}`}</li>)
  if (report.unknownFieldCount > 0) {
    warnings.push(
      <li key="unknown-fields">
        {`Unknown fields: ${report.unknownFieldCount}`}
        {report.unknownFields.length > 0
          ? <ul>{report.unknownFields.map((field) => <li key={field.path}>{`${field.path}: ${field.count}`}</li>)}</ul>
          : null}
      </li>,
    )
  }
  if (report.duplicateSpans > 0) warnings.push(<li key="duplicates">{`Exact duplicate spans removed: ${report.duplicateSpans}`}</li>)
  if (view.warnings.length > 0) warnings.push(<li key="deprecated">{`Deprecated source attributes: ${view.warnings.map((warning) => warning.attribute).join(', ')}`}</li>)
  if (view.orphanSpanIds.length > 0) warnings.push(<li key="orphans">{`Recorded orphan spans: ${view.orphanSpanIds.length}`}</li>)
  if (view.cycleBreakSpanIds.length > 0) warnings.push(<li key="cycles">{`Cycle breaks: ${view.cycleBreakSpanIds.length}`}</li>)
  if (report.redactedAttributes > 0) warnings.push(<li key="redactions">{`Redacted attributes: ${report.redactedAttributes}`}</li>)
  if ((report.unmatchedSourceSpans ?? 0) > 0) warnings.push(<li key="unmatched">{`Unmatched recorded sources: ${report.unmatchedSourceSpans}`}</li>)
  return warnings
}

export function RuntimeLens({ atlas, runtime, onShowStatic, onOpenSource, onClearRuntime, footerActions }: RuntimeLensProps) {
  const [traceId, setTraceId] = useState(() => runtime.traces[0]?.traceId ?? '')
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)
  const [filters, setFilters] = useState<RuntimeFilters>(INITIAL_FILTERS)
  const [tab, setTab] = useState<RuntimeInspectorTab>('span')
  const [statusText, setStatusText] = useState('Runtime data loaded. No recorded span is selected.')

  const selectedTraceIndex = runtime.traces.findIndex((trace) => trace.traceId === traceId)
  const effectiveTraceIndex = selectedTraceIndex >= 0 ? selectedTraceIndex : runtime.traces.length > 0 ? 0 : -1
  const effectiveTraceId = effectiveTraceIndex >= 0 ? runtime.traces[effectiveTraceIndex]!.traceId : ''
  const view = useMemo(
    () => buildRuntimeView(runtime, effectiveTraceId, filters),
    [runtime, effectiveTraceId, filters],
  )
  const effectiveSelectedSpanId = selectedSpanId !== null && view.visibleSpanIds.includes(selectedSpanId) ? selectedSpanId : null
  const selectedSpan = effectiveSelectedSpanId === null ? null : view.spansById.get(effectiveSelectedSpanId)?.span ?? null
  const services = useMemo(
    () => [...new Set(view.selectedSpans.map((span) => span.serviceName))].sort((left, right) => left.localeCompare(right)),
    [view],
  )
  const errors = view.selectedSpans.filter((span) => span.status === 'error').length
  const warnings = warningItems(runtime, view)
  const completenessKey = [
    runtime.report.sampledSpans,
    runtime.report.unsampledSpans,
    runtime.report.droppedAttributesCount,
    runtime.report.droppedEventsCount,
    runtime.report.droppedLinksCount,
    runtime.report.unknownFieldCount,
    runtime.report.duplicateSpans,
    runtime.report.redactedAttributes,
    runtime.report.unmatchedSourceSpans ?? 0,
    view.warnings.map((warning) => warning.attribute).join(','),
    view.orphanSpanIds.length,
    view.cycleBreakSpanIds.length,
  ].join('|')

  useEffect(() => {
    if (traceId !== effectiveTraceId) setTraceId(effectiveTraceId)
  }, [traceId, effectiveTraceId])

  useEffect(() => {
    if (selectedSpanId !== null && effectiveSelectedSpanId === null) {
      setSelectedSpanId(null)
      setStatusText('The selected span is not visible under the current filters. No recorded span is selected.')
    }
  }, [selectedSpanId, effectiveSelectedSpanId])

  useEffect(() => {
    setStatusText(`Runtime completeness changed: ${runtime.report.redactedAttributes} redacted attributes. ${warnings.length} non-zero completeness notices are visible.`)
  }, [completenessKey])

  const selectSpan = (spanId: string) => {
    const display = view.spansById.get(spanId)
    if (display === undefined || !view.visibleSpanIds.includes(spanId)) return
    setSelectedSpanId(spanId)
    setStatusText(`Selected span ${spanId}: ${display.span.name}.`)
  }

  const moveTrace = (delta: number) => {
    if (effectiveTraceIndex < 0) return
    const nextIndex = Math.max(0, Math.min(runtime.traces.length - 1, effectiveTraceIndex + delta))
    const next = runtime.traces[nextIndex]
    if (next === undefined || nextIndex === effectiveTraceIndex) return
    setTraceId(next.traceId)
    setSelectedSpanId(null)
    setStatusText(`Selected trace ${next.traceId}. No recorded span is selected.`)
  }

  const changeFilters = (next: RuntimeFilters) => {
    setFilters(next)
    setStatusText('Runtime filters changed.')
  }

  return (
    <section className="cv-runtime-lens" aria-label="Runtime Lens" data-atlas-repo={atlas.repo.name}>
      <header className="cv-runtime-header">
        <div>
          <h2>Runtime Lens</h2>
          <p>Observed in imported trace data; this view may be incomplete.</p>
          <p>Hot path is the greatest sum of recorded span durations; it is not causal proof.</p>
        </div>
        <div className="cv-runtime-header-actions">
          <button type="button" onClick={onShowStatic}>Show static atlas</button>
          <button type="button" onClick={onClearRuntime}>Clear runtime data</button>
        </div>
      </header>

      {view.selectedTrace === null
        ? <p>No imported runtime traces are available.</p>
        : (
            <>
              <section className="cv-runtime-summary" aria-label="Runtime trace summary">
                <h3>Trace summary</h3>
                <p>{`Static atlas: ${atlas.repo.name}`}</p>
                <p>{`Trace ID: ${view.selectedTrace.traceId}`}</p>
                <p>{`Recorded spans: ${view.selectedSpans.length}`}</p>
                <p>{`Recorded time: ${formattedNano(traceDuration(view))} ns`}</p>
                <p>{`Services: ${services.length}`}</p>
                <p>{`Recorded errors: ${errors}`}</p>
                <div className="cv-runtime-trace-navigation">
                  <button type="button" disabled={effectiveTraceIndex <= 0} onClick={() => moveTrace(-1)}>Previous trace</button>
                  <span>{`Trace ${effectiveTraceIndex + 1} of ${runtime.traces.length}`}</span>
                  <button type="button" disabled={effectiveTraceIndex < 0 || effectiveTraceIndex >= runtime.traces.length - 1} onClick={() => moveTrace(1)}>Next trace</button>
                </div>
                <h4>Completeness notices</h4>
                {warnings.length > 0 ? <ul>{warnings}</ul> : <p>No non-zero completeness notices were recorded.</p>}
              </section>

              <form className="cv-runtime-filters" onSubmit={(event) => event.preventDefault()}>
                <h3>Runtime filters</h3>
                <label htmlFor="cv-runtime-service-filter">Service</label>
                <select
                  id="cv-runtime-service-filter"
                  value={filters.service ?? ''}
                  onChange={(event) => changeFilters({ ...filters, service: event.currentTarget.value === '' ? null : event.currentTarget.value })}
                >
                  <option value="">All services</option>
                  {services.map((service) => <option key={service} value={service}>{service}</option>)}
                </select>

                <label htmlFor="cv-runtime-status-filter">Status</label>
                <select
                  id="cv-runtime-status-filter"
                  value={filters.status}
                  onChange={(event) => changeFilters({ ...filters, status: event.currentTarget.value as RuntimeFilters['status'] })}
                >
                  <option value="all">All statuses</option>
                  <option value="unset">Unset</option>
                  <option value="ok">OK</option>
                  <option value="error">Error</option>
                </select>

                <label htmlFor="cv-runtime-duration-filter">Minimum duration in nanoseconds</label>
                <input
                  id="cv-runtime-duration-filter"
                  type="number"
                  min="0"
                  step="1"
                  value={filters.minDurationNano}
                  onChange={(event) => changeFilters({ ...filters, minDurationNano: event.currentTarget.value })}
                />

                <label htmlFor="cv-runtime-errors-filter">
                  <input
                    id="cv-runtime-errors-filter"
                    type="checkbox"
                    checked={filters.errorsOnly}
                    onChange={(event) => changeFilters({ ...filters, errorsOnly: event.currentTarget.checked })}
                  />
                  Errors only
                </label>
              </form>

              <div className="cv-runtime-regions">
                <TraceRail view={view} selectedSpanId={effectiveSelectedSpanId} onSelectSpan={selectSpan} />
                <Timeline view={view} trace={view.selectedTrace} selectedSpanId={effectiveSelectedSpanId} onSelectSpan={selectSpan} />
                <RuntimeInspector
                  span={selectedSpan}
                  trace={view.selectedTrace}
                  bundle={runtime}
                  tab={tab}
                  onTab={setTab}
                  onSelectSpan={selectSpan}
                  onOpenSource={onOpenSource}
                />
              </div>
            </>
          )}

      <p role="status" aria-live="polite">{statusText}</p>
      {footerActions === undefined ? null : <footer className="cv-runtime-footer-actions">{footerActions}</footer>}
    </section>
  )
}
