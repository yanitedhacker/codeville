import type { ReactNode } from 'react'
import type {
  DerivedRuntimeSpan,
  RuntimeAttribute,
  RuntimeTrace,
  RuntimeTraceBundle,
  RuntimeValue,
} from '@codeville/core'

export type RuntimeInspectorTab = 'span' | 'resource' | 'scope' | 'attributes' | 'events' | 'links'

export interface RuntimeInspectorProps {
  span: DerivedRuntimeSpan | null
  trace: RuntimeTrace | null
  bundle: RuntimeTraceBundle
  tab: RuntimeInspectorTab
  onTab(tab: RuntimeInspectorTab): void
  onSelectSpan(spanId: string): void
  onOpenSource(nodeId: string): void
}

const TABS: readonly { id: RuntimeInspectorTab; label: string }[] = [
  { id: 'span', label: 'Span details' },
  { id: 'resource', label: 'Resource' },
  { id: 'scope', label: 'Scope' },
  { id: 'attributes', label: 'Attributes' },
  { id: 'events', label: 'Events' },
  { id: 'links', label: 'Links' },
]

function statusLabel(code: number): string {
  if (code === 1) return 'ok'
  if (code === 2) return 'error'
  return 'unset'
}

function valueText(value: RuntimeValue): string {
  switch (value.type) {
    case 'string': return value.value
    case 'bool': return String(value.value)
    case 'int': return value.value
    case 'double': return String(value.value)
    case 'bytes': return value.value
    case 'redacted': return '[redacted]'
    case 'array': return `[${value.value.map(valueText).join(', ')}]`
    case 'kvlist': return `{${value.value.map((attribute) => `${attribute.key}: ${valueText(attribute.value)}`).join(', ')}}`
  }
}

function fact(label: string, value: ReactNode) {
  return <p><strong>{`${label}: `}</strong>{value}</p>
}

function attributesList(attributes: readonly RuntimeAttribute[], emptyText: string) {
  if (attributes.length === 0) return <p>{emptyText}</p>
  return (
    <dl>
      {attributes.map((attribute, index) => (
        <div key={`${attribute.key}:${index}`}>
          <dt>{`${attribute.key}: `}</dt>
          <dd>{valueText(attribute.value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function spanPanel(span: DerivedRuntimeSpan, trace: RuntimeTrace | null, onOpenSource: (nodeId: string) => void) {
  return (
    <div>
      {fact('Trace ID', span.traceId)}
      {fact('Span ID', span.spanId)}
      {fact('Span name', span.name)}
      {span.parentSpanId === undefined ? fact('Recorded parent', 'none') : fact('Recorded parent span ID', span.parentSpanId)}
      {fact('Trace state', span.traceState ?? 'not recorded')}
      {fact('Flags', span.flags)}
      {fact('Sampled', span.sampled ? 'yes' : 'no')}
      {fact('Kind', span.kind)}
      {fact('Start time', `${span.startTimeUnixNano} ns`)}
      {fact('End time', `${span.endTimeUnixNano} ns`)}
      {fact('Duration', `${span.durationNano} ns`)}
      {fact('Status code', `${span.status.code} (${statusLabel(span.status.code)})`)}
      {fact('Status message', span.status.message ?? 'not recorded')}
      {fact('Recorded relation', span.relation)}
      {fact('Dropped span attributes', span.droppedAttributesCount)}
      {fact('Dropped events', span.droppedEventsCount)}
      {fact('Dropped links', span.droppedLinksCount)}
      {trace === null ? <p>The selected trace is unavailable.</p> : null}
      {span.source === undefined
        ? <p>No exact source match is available.</p>
        : (
            <section aria-label="Exact source match">
              <h4>Exact source match</h4>
              {fact('Atlas node ID', span.source.nodeId)}
              {fact('Matched path', span.source.path)}
              {fact('Recorded path', span.source.recordedPath)}
              {fact('Recorded function', span.source.functionName ?? 'not recorded')}
              {fact('Recorded line', span.source.lineNumber ?? 'not recorded')}
              <button type="button" onClick={() => onOpenSource(span.source!.nodeId)}>Open matched source</button>
            </section>
          )}
    </div>
  )
}

function resourcePanel(span: DerivedRuntimeSpan) {
  return (
    <div>
      {fact('Resource schema URL', span.resource.schemaUrl ?? 'not recorded')}
      {fact('Dropped resource attributes', span.resource.droppedAttributesCount)}
      <h4>Resource attributes</h4>
      {attributesList(span.resource.attributes, 'No recorded resource attributes.')}
    </div>
  )
}

function scopePanel(span: DerivedRuntimeSpan) {
  return (
    <div>
      {fact('Scope schema URL', span.scope.schemaUrl ?? 'not recorded')}
      {fact('Scope name', span.scope.name ?? 'not recorded')}
      {fact('Scope version', span.scope.version ?? 'not recorded')}
      {fact('Dropped scope attributes', span.scope.droppedAttributesCount)}
      <h4>Scope attributes</h4>
      {attributesList(span.scope.attributes, 'No recorded scope attributes.')}
    </div>
  )
}

function eventsPanel(span: DerivedRuntimeSpan) {
  if (span.events.length === 0) return <p>No recorded span events.</p>
  return (
    <ol>
      {span.events.map((event, index) => (
        <li key={`${event.timeUnixNano}:${index}`}>
          <h4>{`Event ${index + 1}: ${event.name}`}</h4>
          {fact('Event time', `${event.timeUnixNano} ns`)}
          {fact('Dropped event attributes', event.droppedAttributesCount)}
          {attributesList(event.attributes, 'No recorded event attributes.')}
        </li>
      ))}
    </ol>
  )
}

function linksPanel(span: DerivedRuntimeSpan, bundle: RuntimeTraceBundle, onSelectSpan: (spanId: string) => void) {
  if (span.links.length === 0) return <p>No recorded span links.</p>
  return (
    <ol>
      {span.links.map((link, index) => {
        const localTarget = bundle.spans.some((candidate) => candidate.traceId === link.traceId && candidate.spanId === link.spanId)
        return (
          <li key={`${link.traceId}:${link.spanId}:${index}`}>
            <h4>{`Link ${index + 1}`}</h4>
            {fact('Linked trace ID', link.traceId)}
            {fact('Linked span ID', link.spanId)}
            {fact('Link trace state', link.traceState ?? 'not recorded')}
            {fact('Link flags', link.flags)}
            {fact('Dropped link attributes', link.droppedAttributesCount)}
            {attributesList(link.attributes, 'No recorded link attributes.')}
            {localTarget ? <button type="button" onClick={() => onSelectSpan(link.spanId)}>Select linked span</button> : null}
          </li>
        )
      })}
    </ol>
  )
}

function activePanel(props: RuntimeInspectorProps): ReactNode {
  const { span, trace, bundle, tab, onSelectSpan, onOpenSource } = props
  if (span === null) return <p>Select a recorded span to inspect its exact evidence.</p>
  switch (tab) {
    case 'span': return spanPanel(span, trace, onOpenSource)
    case 'resource': return resourcePanel(span)
    case 'scope': return scopePanel(span)
    case 'attributes': return attributesList(span.attributes, 'No recorded span attributes.')
    case 'events': return eventsPanel(span)
    case 'links': return linksPanel(span, bundle, onSelectSpan)
  }
}

export function RuntimeInspector(props: RuntimeInspectorProps) {
  return (
    <aside className="cv-runtime-inspector" aria-label="Runtime evidence details">
      <h3>Runtime evidence details</h3>
      {props.span === null
        ? null
        : (
            <div aria-label="Selected runtime identity">
              {fact('Trace ID', props.span.traceId)}
              {fact('Span ID', props.span.spanId)}
            </div>
          )}
      <div role="tablist" aria-label="Runtime inspector tabs">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={props.tab === id}
            aria-controls="cv-runtime-inspector-panel"
            onClick={() => props.onTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div id="cv-runtime-inspector-panel" role="tabpanel">
        {activePanel(props)}
      </div>
    </aside>
  )
}
