import { layoutTimeline, spanAt, type TimelineLayout } from './timeline-geometry.js'
import type { RuntimeViewModel } from './view-model.js'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 16
const MAX_PAN_VIEWPORTS = 4

export class TimelineRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private view: RuntimeViewModel | null = null
  private selectedSpanId: string | null = null
  private width = 0
  private height = 0
  private zoom = 1
  private offsetX = 0
  private layout: TimelineLayout | null = null
  private disposed = false

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('codeville: 2d canvas context unavailable')
    this.canvas = canvas
    this.context = context
  }

  resize(width: number, height: number): void {
    if (this.disposed) return
    this.width = Number.isFinite(width) && width > 0 ? width : 0
    this.height = Number.isFinite(height) && height > 0 ? height : 0
    this.canvas.width = Math.max(1, Math.round(this.width))
    this.canvas.height = Math.max(1, Math.round(this.height))
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
    this.offsetX = this.boundedOffset(this.offsetX)
    this.paint()
  }

  setView(view: RuntimeViewModel, selectedSpanId: string | null = null): void {
    if (this.disposed) return
    this.view = view
    this.selectedSpanId = selectedSpanId && view.spansById.has(selectedSpanId)
      ? selectedSpanId
      : view.visibleSpanIds[0] ?? null
    this.paint()
  }

  panBy(deltaX: number): void {
    if (this.disposed || !Number.isFinite(deltaX)) return
    this.offsetX = this.boundedOffset(this.offsetX + deltaX)
    this.paint()
  }

  zoomBy(factor: number): void {
    if (this.disposed || !Number.isFinite(factor) || factor <= 0) return
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor))
    this.offsetX = this.boundedOffset(this.offsetX)
    this.paint()
  }

  resetView(): void {
    if (this.disposed) return
    this.zoom = 1
    this.offsetX = 0
    this.paint()
  }

  spanAt(x: number, y: number): string | null {
    if (this.disposed || !this.layout) return null
    return spanAt(this.layout, x, y)?.spanId ?? null
  }

  dispose(): void {
    this.disposed = true
    this.layout = null
    this.view = null
  }

  private boundedOffset(value: number): number {
    const maximum = Math.max(0, this.width * MAX_PAN_VIEWPORTS)
    return Math.min(maximum, Math.max(-maximum, value))
  }

  private paint(): void {
    if (this.disposed) return
    const context = this.context
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    if (!this.view) {
      this.layout = null
      return
    }
    this.layout = layoutTimeline(this.view, {
      width: this.width,
      height: this.height,
      zoom: this.zoom,
      offsetX: this.offsetX,
    })
    for (const lane of this.layout.lanes) {
      context.fillStyle = '#333333'
      context.font = '12px ui-monospace, monospace'
      context.textBaseline = 'middle'
      context.fillText(lane.serviceName, 8, lane.y + lane.height / 2)
    }
    const ancestors = this.selectedSpanId ? new Set(this.view.ancestorSpanIds(this.selectedSpanId)) : new Set<string>()
    const descendants = this.selectedSpanId ? new Set(this.view.descendantSpanIds(this.selectedSpanId)) : new Set<string>()
    for (const bar of this.layout.bars) {
      const display = this.view.spansById.get(bar.spanId)
      if (!display) continue
      const related = ancestors.has(bar.spanId) || descendants.has(bar.spanId)
      context.fillStyle = related ? '#9aa1a5' : '#c6cbce'
      context.fillRect(bar.x, bar.y, bar.width, bar.height)
      context.fillStyle = '#222222'
      context.font = '11px ui-monospace, monospace'
      context.textBaseline = 'middle'
      context.fillText(display.span.name, bar.x + 3, bar.y + bar.height / 2)
      context.fillText(bar.status === 2 ? '!' : bar.status === 1 ? '✓' : '○', bar.x + bar.width - 10, bar.y + bar.height / 2)
      if (related || bar.spanId === this.selectedSpanId) {
        context.strokeStyle = bar.spanId === this.selectedSpanId ? '#111111' : '#5b6266'
        context.lineWidth = bar.spanId === this.selectedSpanId ? 2 : 1
        context.strokeRect(bar.x, bar.y, bar.width, bar.height)
      }
    }
  }
}
