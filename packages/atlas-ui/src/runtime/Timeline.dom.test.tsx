// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeTraceBundle } from '@codeville/core'
import { Timeline } from './Timeline.js'
import { buildRuntimeView } from './view-model.js'

class RecordingContext {
  readonly clears: Array<[number, number, number, number]> = []
  readonly texts: Array<{ text: string; x: number; y: number }> = []
  fillStyle = ''
  strokeStyle = ''
  lineWidth = 1
  font = ''
  textBaseline: CanvasTextBaseline = 'alphabetic'
  textAlign: CanvasTextAlign = 'start'
  setTransform(): void {}
  clearRect(x: number, y: number, width: number, height: number): void { this.clears.push([x, y, width, height]) }
  fillRect(): void {}
  strokeRect(): void {}
  fillText(text: string, x: number, y: number): void { this.texts.push({ text, x, y }) }
  save(): void {}
  restore(): void {}
  beginPath(): void {}
  rect(): void {}
  clip(): void {}
  moveTo(): void {}
  lineTo(): void {}
  stroke(): void {}
}

const contexts = new WeakMap<HTMLCanvasElement, RecordingContext>()
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    disconnect(): void {}
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, get: () => 390 })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLCanvasElement) { return Number.parseFloat(this.style.height) || 240 },
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value(this: HTMLCanvasElement) {
      let context = contexts.get(this)
      if (context === undefined) {
        context = new RecordingContext()
        contexts.set(this, context)
      }
      return context
    },
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', { configurable: true, value() {} })
  Object.defineProperty(HTMLCanvasElement.prototype, 'hasPointerCapture', { configurable: true, value: () => false })
  Object.defineProperty(HTMLCanvasElement.prototype, 'releasePointerCapture', { configurable: true, value() {} })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('Timeline real DOM and canvas interaction', () => {
  it('keeps eight lanes reachable, reports safe hover state, and runs every native viewport action', async () => {
    const runtime = bundleWithEightServices()
    const trace = runtime.traces[0]!
    const view = buildRuntimeView(runtime, trace.traceId, {
      service: null, status: 'all', minDurationNano: '0', errorsOnly: false,
    })
    await act(async () => {
      root.render(<Timeline view={view} trace={trace} selection={null} onSelectSpan={vi.fn()} />)
    })

    const canvas = container.querySelector('canvas')!
    const scroll = canvas.parentElement!
    const context = contexts.get(canvas)!
    expect(scroll.className).toBe('cv-runtime-timeline-scroll')
    expect(canvas.style.height).toBe('280px')
    expect(canvas.height).toBe(280)
    expect(context.texts.map((entry) => entry.text)).toEqual(expect.arrayContaining([
      'service-7', '+0 ns', '+25 ns', '+50 ns', '+75 ns', '+100 ns',
    ]))

    await act(async () => canvas.dispatchEvent(pointerEvent('pointermove', 389, 255)))
    const hover = container.querySelector('.cv-runtime-timeline-hover')!
    expect(hover.textContent).toContain('service-7')
    expect(hover.textContent).toContain('<point> (point)')
    expect(hover.textContent).toContain('+100 ns')
    expect(hover.textContent).toContain('0 ns')
    expect(hover.textContent).toContain('status error')
    expect(hover.textContent).not.toContain('raw-private-secret')

    await act(async () => canvas.dispatchEvent(new Event('pointerleave', { bubbles: true })))
    expect(hover.textContent).toBe('No recorded span is under the pointer.')

    const labels = ['Pan earlier', 'Pan later', 'Zoom in', 'Zoom out', 'Reset timeline view']
    const before = context.clears.length
    for (const label of labels) {
      const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === label)
      expect(button?.type).toBe('button')
      await act(async () => button!.click())
    }
    expect(context.clears.length).toBeGreaterThanOrEqual(before + labels.length)
  })
})

function pointerEvent(type: string, offsetX: number, offsetY: number): Event {
  const event = new MouseEvent(type, { bubbles: true, clientX: offsetX, clientY: offsetY })
  Object.defineProperties(event, {
    offsetX: { value: offsetX },
    offsetY: { value: offsetY },
  })
  return event
}

function bundleWithEightServices(): RuntimeTraceBundle {
  const traceId = '11111111111111111111111111111111'
  const spans = Array.from({ length: 8 }, (_, index): RuntimeTraceBundle['spans'][number] => {
    const point = index === 7
    const start = point ? '100' : String(index * 10)
    const duration = point ? '0' : '10'
    return {
      traceId,
      spanId: point ? 'point' : `span-${index}`,
      flags: 1,
      sampled: true,
      name: point ? '<point>' : `span ${index}`,
      kind: 1,
      startTimeUnixNano: start,
      endTimeUnixNano: (BigInt(start) + BigInt(duration)).toString(),
      durationNano: duration,
      attributes: point
        ? [{ key: 'authorization', value: { type: 'string', value: 'raw-private-secret' } }]
        : [],
      droppedAttributesCount: '0',
      events: [],
      droppedEventsCount: '0',
      links: [],
      droppedLinksCount: '0',
      status: { code: point ? 2 : 0 },
      resource: {
        attributes: [{ key: 'service.name', value: { type: 'string', value: `service-${index}` } }],
        droppedAttributesCount: '0',
      },
      scope: { attributes: [], droppedAttributesCount: '0' },
      relation: 'root',
    }
  })
  return {
    version: 1,
    format: 'otlp-json',
    traces: [{
      traceId,
      startTimeUnixNano: '0',
      endTimeUnixNano: '100',
      spanIds: spans.map((span) => span.spanId),
      rootSpanIds: spans.map((span) => span.spanId),
      orphanSpanIds: [],
      cycleBreakSpanIds: [],
      hotPathSpanIds: [],
      errorPaths: [],
    }],
    spans,
    report: {
      documents: 1, resourceScopeGroups: 8, traces: 1, inputSpans: 8, spans: 8, duplicateSpans: 0,
      sampledSpans: 8, unsampledSpans: 0, redactedAttributes: 0, droppedAttributesCount: '0',
      droppedEventsCount: '0', droppedLinksCount: '0', unknownFieldCount: 0, unknownFields: [],
    },
  }
}
