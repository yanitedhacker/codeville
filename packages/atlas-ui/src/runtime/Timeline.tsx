import { useEffect, useRef, type PointerEvent, type WheelEvent } from 'react'
import type { RuntimeTrace } from '@codeville/core'
import { TimelineRenderer } from './TimelineRenderer.js'
import type { RuntimeDisplaySpan, RuntimeViewModel } from './view-model.js'

export interface TimelineProps {
  view: RuntimeViewModel
  trace: RuntimeTrace
  selectedSpanId: string | null
  onSelectSpan(spanId: string): void
}

function formattedNano(value: string): string {
  try {
    return BigInt(value).toLocaleString('en-US')
  } catch {
    return value
  }
}

function relativeStart(span: RuntimeDisplaySpan, trace: RuntimeTrace): string {
  try {
    const delta = BigInt(span.span.startTimeUnixNano) - BigInt(trace.startTimeUnixNano)
    return `${delta >= 0n ? '+' : ''}${delta.toLocaleString('en-US')} ns`
  } catch {
    return `${span.span.startTimeUnixNano} ns from recorded trace start`
  }
}

function relationText(span: RuntimeDisplaySpan): string {
  const { parentSpanId, relation } = span.span
  if (relation === 'root') return 'recorded root'
  if (relation === 'orphan') return `recorded parent ${parentSpanId ?? 'not recorded'} (orphan)`
  if (relation === 'cycle-broken') return `recorded parent ${parentSpanId ?? 'not recorded'} (cycle broken)`
  return `recorded parent ${parentSpanId ?? 'not recorded'}`
}

function hasRecordedSource(span: RuntimeDisplaySpan): boolean {
  return span.span.attributes.some(({ key }) => key === 'code.file.path' || key === 'code.filepath')
}

function sourceText(span: RuntimeDisplaySpan): string {
  if (span.span.source !== undefined) return `exact source: ${span.span.source.path}`
  return hasRecordedSource(span) ? 'unmatched recorded source' : 'no recorded source'
}

export function timelineRowText(span: RuntimeDisplaySpan, trace: RuntimeTrace): string {
  return [
    span.serviceName,
    span.span.name,
    relativeStart(span, trace),
    `${formattedNano(span.span.durationNano)} ns`,
    span.status,
    relationText(span),
    sourceText(span),
  ].join(' / ')
}

function canvasPoint(event: { nativeEvent?: { offsetX?: number; offsetY?: number }; currentTarget?: HTMLCanvasElement }): { x: number; y: number } {
  const offsetX = event.nativeEvent?.offsetX
  const offsetY = event.nativeEvent?.offsetY
  if (typeof offsetX === 'number' && typeof offsetY === 'number') return { x: offsetX, y: offsetY }
  return { x: 0, y: 0 }
}

export function Timeline({ view, trace, selectedSpanId, onSelectSpan }: TimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<TimelineRenderer | null>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const renderer = new TimelineRenderer(canvas)
    rendererRef.current = renderer
    const resize = () => renderer.resize(canvas.clientWidth, canvas.clientHeight)
    resize()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(canvas)
    return () => {
      observer?.disconnect()
      renderer.dispose()
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    rendererRef.current?.setView(view, selectedSpanId)
  }, [view, selectedSpanId])

  const pointSpan = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event)
    return rendererRef.current?.spanAt(point.x, point.y) ?? null
  }

  const pointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const pointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const previous = dragRef.current
    if (previous !== null) {
      rendererRef.current?.panBy(event.clientX - previous.x)
      dragRef.current = { x: event.clientX, y: event.clientY }
    }
    pointSpan(event)
  }

  const pointerUp = () => { dragRef.current = null }
  const click = (event: PointerEvent<HTMLCanvasElement>) => {
    const spanId = pointSpan(event)
    if (spanId !== null) onSelectSpan(spanId)
  }
  const wheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    rendererRef.current?.zoomBy(event.deltaY < 0 ? 1.25 : 0.8)
  }

  return (
    <section className="cv-runtime-timeline" aria-label="Recorded span timeline">
      <div className="cv-runtime-timeline-controls">
        <button type="button" onClick={() => rendererRef.current?.resetView()}>Reset timeline view</button>
      </div>
      <p id="cv-runtime-timeline-help">
        Use pointer drag to pan, the wheel to zoom, and click to select. The complete recorded timeline is also available as buttons below.
      </p>
      <canvas
        ref={canvasRef}
        role="img"
        tabIndex={0}
        aria-label={`Observed span timeline for trace ${trace.traceId}`}
        aria-describedby="cv-runtime-timeline-help"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onPointerLeave={pointerUp}
        onClick={click}
        onWheel={wheel}
      />
      {view.visibleSpans.length === 0 ? <p>No recorded spans match the current filters.</p> : null}
      <ol className="cv-runtime-text-timeline" aria-label="Text timeline">
        {view.visibleSpans.map((span) => (
          <li key={span.spanId}>
            <button
              type="button"
              aria-label={`Select recorded span ${span.spanId}`}
              aria-current={selectedSpanId === span.spanId ? 'true' : undefined}
              onClick={() => onSelectSpan(span.spanId)}
            >
              {timelineRowText(span, trace)}
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
