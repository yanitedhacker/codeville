import type { RuntimeViewModel } from './view-model.js'

export interface TimelineViewport {
  width: number
  height: number
  zoom: number
  offsetX: number
}

export interface TimelineBar {
  spanId: string
  lane: number
  x: number
  y: number
  width: number
  height: number
  status: 0 | 1 | 2
}

export interface TimelineLane {
  serviceName: string
  index: number
  y: number
  height: number
}

export interface TimelineTick {
  x: number
  label: string
}

export interface TimelineLayout {
  bars: readonly TimelineBar[]
  lanes: readonly TimelineLane[]
  ticks: readonly TimelineTick[]
  plotLeft: number
  plotWidth: number
  width: number
  height: number
}

export const TIMELINE_LABEL_WIDTH = 160
export const TIMELINE_TOP_MARGIN = 24
export const TIMELINE_LANE_HEIGHT = 32
export const TIMELINE_MIN_HEIGHT = 240
const BAR_TOP_INSET = 6
const MIN_BAR_HEIGHT = 8
const MIN_BAR_WIDTH = 4
const RATIO_SCALE = 1_000_000n

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function statusCode(code: number): 0 | 1 | 2 {
  return code === 1 ? 1 : code === 2 ? 2 : 0
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function boundedRatio(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) return 0
  if (numerator <= 0n) return 0
  if (numerator >= denominator) return 1
  return Number((numerator * RATIO_SCALE) / denominator) / Number(RATIO_SCALE)
}

function serviceNames(view: RuntimeViewModel): string[] {
  return [...new Set(view.selectedSpans.map((display) => display.serviceName))]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
}

export function timelineContentHeight(view: RuntimeViewModel): number {
  return Math.max(TIMELINE_MIN_HEIGHT, TIMELINE_TOP_MARGIN + serviceNames(view).length * TIMELINE_LANE_HEIGHT)
}

function timelineTicks(
  traceDuration: bigint,
  plotLeft: number,
  plotWidth: number,
  width: number,
  zoom: number,
  offsetX: number,
): TimelineTick[] {
  const intervals = traceDuration > 0n ? 4n : 0n
  const offsets = intervals === 0n
    ? [0n]
    : Array.from({ length: Number(intervals) + 1 }, (_, index) => (traceDuration * BigInt(index)) / intervals)
  const ticks: TimelineTick[] = []
  const seen = new Set<string>()
  for (const offset of offsets) {
    const key = offset.toString()
    if (seen.has(key)) continue
    seen.add(key)
    const rawX = plotLeft + boundedRatio(offset, traceDuration) * plotWidth * zoom + offsetX
    if (rawX < plotLeft || rawX > width) continue
    ticks.push({
      x: clamp(rawX, plotLeft, Math.max(plotLeft, width - 1)),
      label: `+${offset.toLocaleString('en-US')} ns`,
    })
  }
  return ticks
}

export function layoutTimeline(view: RuntimeViewModel, viewport: TimelineViewport): TimelineLayout {
  const width = finiteNonNegative(viewport.width)
  const height = Math.max(finiteNonNegative(viewport.height), timelineContentHeight(view))
  const plotLeft = Math.min(TIMELINE_LABEL_WIDTH, Math.max(0, width - 1))
  const plotWidth = Math.max(1, width - plotLeft)
  const zoom = clamp(Number.isFinite(viewport.zoom) ? viewport.zoom : 1, 0.25, 16)
  const offsetX = Number.isFinite(viewport.offsetX) ? viewport.offsetX : 0

  if (!view.selectedTrace) return { bars: [], lanes: [], ticks: [], plotLeft, plotWidth, width, height }

  const allLanes = serviceNames(view).map((serviceName, index) => ({
    serviceName,
    index,
    y: TIMELINE_TOP_MARGIN + index * TIMELINE_LANE_HEIGHT,
    height: TIMELINE_LANE_HEIGHT,
  }))
  const laneByService = new Map(allLanes.map((lane) => [lane.serviceName, lane]))
  const traceStart = BigInt(view.selectedTrace.startTimeUnixNano)
  const traceEnd = BigInt(view.selectedTrace.endTimeUnixNano)
  const traceDuration = traceEnd > traceStart ? traceEnd - traceStart : 0n
  const ticks = timelineTicks(traceDuration, plotLeft, plotWidth, width, zoom, offsetX)
  const naturalBarHeight = Math.max(MIN_BAR_HEIGHT, Math.min(20, TIMELINE_LANE_HEIGHT - BAR_TOP_INSET * 2))
  const maxBarWidth = Math.max(1, Math.min(MIN_BAR_WIDTH, plotWidth))
  const bars: TimelineBar[] = []

  for (const display of view.visibleSpans) {
    const lane = laneByService.get(display.serviceName)
    if (!lane) continue
    const startOffset = BigInt(display.span.startTimeUnixNano) - traceStart
    const duration = BigInt(display.span.durationNano)
    const startRatio = boundedRatio(startOffset, traceDuration)
    const endRatio = boundedRatio(startOffset + duration, traceDuration)
    const rawX = plotLeft + startRatio * plotWidth * zoom + offsetX
    const rawWidth = (endRatio - startRatio) * plotWidth * zoom
    const pointLike = rawWidth < maxBarWidth
    const rawY = lane.y + BAR_TOP_INSET
    if (rawY >= height || rawY + naturalBarHeight <= 0) continue
    if (pointLike && (rawX < plotLeft || rawX > width)) continue
    if (!pointLike && (rawX >= width || rawX + rawWidth <= plotLeft)) continue
    const x = pointLike
      ? clamp(rawX, plotLeft, Math.max(plotLeft, width - maxBarWidth))
      : Math.max(plotLeft, rawX)
    const visibleWidth = pointLike
      ? Math.min(maxBarWidth, width - x)
      : Math.min(width, rawX + rawWidth) - x
    const barWidth = Math.max(0, Math.min(plotWidth, visibleWidth))
    const y = Math.max(0, rawY)
    const barHeight = Math.max(0, Math.min(height, rawY + naturalBarHeight) - y)
    if (barWidth <= 0 || barHeight <= 0) continue
    bars.push({
      spanId: display.spanId,
      lane: lane.index,
      x,
      y,
      width: barWidth,
      height: barHeight,
      status: statusCode(display.span.status.code),
    })
  }

  return { bars, lanes: allLanes, ticks, plotLeft, plotWidth, width, height }
}

/** Last evidence bar wins when timeline rectangles overlap. */
export function spanAt(layout: TimelineLayout, x: number, y: number): TimelineBar | null {
  for (let index = layout.bars.length - 1; index >= 0; index -= 1) {
    const bar = layout.bars[index]!
    if (x >= bar.x && x < bar.x + bar.width && y >= bar.y && y < bar.y + bar.height) return bar
  }
  return null
}
