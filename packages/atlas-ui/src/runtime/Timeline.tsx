import { useEffect, useRef } from 'react'
import type { RuntimeTrace } from '@codeville/core'
import { TimelineRenderer } from './TimelineRenderer.js'
import type { RuntimeSpanSelection } from './RuntimeInspector.js'
import type { RuntimeDisplaySpan, RuntimeViewModel } from './view-model.js'

export interface TimelineProps {
  view: RuntimeViewModel
  trace: RuntimeTrace
  selection: RuntimeSpanSelection | null
  onSelectSpan(selection: RuntimeSpanSelection): void
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

function canvasPoint(event: { offsetX?: number; offsetY?: number }): { x: number; y: number } {
  const offsetX = event.offsetX
  const offsetY = event.offsetY
  if (typeof offsetX === 'number' && typeof offsetY === 'number') return { x: offsetX, y: offsetY }
  return { x: 0, y: 0 }
}

export function Timeline({ view, trace, selection, onSelectSpan }: TimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<TimelineRenderer | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; lastX: number; dragged: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const onSelectSpanRef = useRef(onSelectSpan)
  const traceIdRef = useRef(trace.traceId)
  onSelectSpanRef.current = onSelectSpan
  traceIdRef.current = trace.traceId

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const renderer = new TimelineRenderer(canvas)
    rendererRef.current = renderer
    const resize = () => renderer.resize(canvas.clientWidth, canvas.clientHeight)
    const spanAtEvent = (event: MouseEvent | PointerEvent) => {
      const point = canvasPoint(event)
      return renderer.spanAt(point.x, point.y)
    }
    const releaseCapture = (pointerId: number) => {
      if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId)
    }
    const pointerDown = (event: PointerEvent) => {
      dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, dragged: false }
      suppressClickRef.current = false
      canvas.setPointerCapture(event.pointerId)
    }
    const pointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (drag !== null && drag.pointerId === event.pointerId) {
        renderer.panBy(event.clientX - drag.lastX)
        drag.lastX = event.clientX
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4) drag.dragged = true
      }
      spanAtEvent(event)
    }
    const pointerUp = (event: PointerEvent) => {
      const drag = dragRef.current
      if (drag !== null && drag.pointerId === event.pointerId) suppressClickRef.current = drag.dragged
      dragRef.current = null
      releaseCapture(event.pointerId)
    }
    const pointerCancel = (event: PointerEvent) => {
      suppressClickRef.current = true
      dragRef.current = null
      releaseCapture(event.pointerId)
    }
    const lostPointerCapture = (event: PointerEvent) => {
      const drag = dragRef.current
      if (drag?.pointerId === event.pointerId) {
        suppressClickRef.current = drag.dragged
        dragRef.current = null
      }
    }
    const click = (event: MouseEvent) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      const spanId = spanAtEvent(event)
      if (spanId !== null) onSelectSpanRef.current({ traceId: traceIdRef.current, spanId })
    }
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      renderer.zoomBy(event.deltaY < 0 ? 1.25 : 0.8)
    }
    resize()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(canvas)
    canvas.addEventListener('pointerdown', pointerDown)
    canvas.addEventListener('pointermove', pointerMove)
    canvas.addEventListener('pointerup', pointerUp)
    canvas.addEventListener('pointercancel', pointerCancel)
    canvas.addEventListener('lostpointercapture', lostPointerCapture)
    canvas.addEventListener('click', click)
    canvas.addEventListener('wheel', wheel, { passive: false })
    return () => {
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('pointerup', pointerUp)
      canvas.removeEventListener('pointercancel', pointerCancel)
      canvas.removeEventListener('lostpointercapture', lostPointerCapture)
      canvas.removeEventListener('click', click)
      canvas.removeEventListener('wheel', wheel)
      observer?.disconnect()
      renderer.dispose()
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    const selectedSpanId = selection?.traceId === trace.traceId ? selection.spanId : null
    rendererRef.current?.setView(view, selectedSpanId)
  }, [view, trace.traceId, selection])

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
      />
      {view.visibleSpans.length === 0 ? <p>No recorded spans match the current filters.</p> : null}
      <ol className="cv-runtime-text-timeline" aria-label="Text timeline">
        {view.visibleSpans.map((span) => (
          <li key={span.spanId}>
            <button
              type="button"
              aria-current={selection?.traceId === trace.traceId && selection.spanId === span.spanId ? 'true' : undefined}
              onClick={() => onSelectSpan({ traceId: trace.traceId, spanId: span.spanId })}
            >
              {timelineRowText(span, trace)}
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
