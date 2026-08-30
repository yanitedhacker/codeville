import { describe, expect, it } from 'vitest'
import type { RuntimeTraceBundle } from '@codeville/core'
import { TimelineRenderer } from './TimelineRenderer.js'
import { buildRuntimeView } from './view-model.js'

function view() {
  const traceId = '11111111111111111111111111111111'
  const bundle: RuntimeTraceBundle = {
    version: 1, format: 'otlp-json',
    traces: [{ traceId, startTimeUnixNano: '0', endTimeUnixNano: '100', spanIds: ['root', 'error', 'tail'],
      rootSpanIds: ['root'], orphanSpanIds: [], cycleBreakSpanIds: [], hotPathSpanIds: ['root', 'tail'], errorPaths: [['root', 'error'], ['root', 'tail']] }],
    spans: [runtimeSpan(traceId, 'root', 'root', '0', '100', 1), runtimeSpan(traceId, 'error', 'error', '10', '50', 2, 'root'), runtimeSpan(traceId, 'tail', 'tail', '90', '10', 2, 'root')],
    report: { documents: 1, resourceScopeGroups: 1, traces: 1, inputSpans: 3, spans: 3, duplicateSpans: 0, sampledSpans: 3,
      unsampledSpans: 0, redactedAttributes: 0, droppedAttributesCount: '0', droppedEventsCount: '0', droppedLinksCount: '0', unknownFieldCount: 0, unknownFields: [] },
  }
  return buildRuntimeView(bundle, traceId, { service: null, status: 'all', minDurationNano: '0', errorsOnly: false })
}

function runtimeSpan(traceId: string, spanId: string, name: string, start: string, duration: string, code: number, parentSpanId?: string): RuntimeTraceBundle['spans'][number] {
  return {
    traceId, spanId, ...(parentSpanId ? { parentSpanId } : {}), flags: 0, sampled: true, name, kind: 1,
    startTimeUnixNano: start, endTimeUnixNano: (BigInt(start) + BigInt(duration)).toString(), durationNano: duration,
    attributes: [], droppedAttributesCount: '0', events: [], droppedEventsCount: '0', links: [], droppedLinksCount: '0', status: { code },
    resource: { attributes: [{ key: 'service.name', value: { type: 'string', value: 'api' } }], droppedAttributesCount: '0' },
    scope: { attributes: [], droppedAttributesCount: '0' }, relation: parentSpanId ? 'child' : 'root',
  }
}

class FakeContext {
  readonly calls: string[] = []
  fillStyle = ''
  strokeStyle = ''
  lineWidth = 1
  font = ''
  textBaseline: CanvasTextBaseline = 'alphabetic'
  setTransform(...values: number[]): void { this.calls.push(`setTransform:${values.join(',')}`) }
  clearRect(): void { this.calls.push('clearRect') }
  fillRect(): void { this.calls.push('fillRect') }
  strokeRect(): void { this.calls.push('strokeRect') }
  fillText(text: string): void { this.calls.push(`fillText:${text}`) }
}

function fakeCanvas(context: FakeContext): HTMLCanvasElement {
  return {
    width: 0, height: 0, style: {}, getContext: () => context,
  } as unknown as HTMLCanvasElement
}

describe('TimelineRenderer', () => {
  it('paints labels, non-color status glyphs, selection, and related-span emphasis', () => {
    const context = new FakeContext()
    const renderer = new TimelineRenderer(fakeCanvas(context))

    renderer.resize(800, 240)
    renderer.setView(view(), 'error')

    expect(context.calls).toContain('fillText:error')
    expect(context.calls).toContain('fillText:!')
    expect(context.calls.filter((call) => call === 'strokeRect').length).toBeGreaterThanOrEqual(2)
    expect(renderer.spanAt(300, 34)).toBe('error')
  })

  it('bounds pan and zoom then resets to the deterministic static view', () => {
    const context = new FakeContext()
    const renderer = new TimelineRenderer(fakeCanvas(context))
    renderer.resize(800, 240)
    renderer.setView(view())

    renderer.zoomBy(16)
    renderer.panBy(-1_000_000)
    expect(renderer.spanAt(400, 34)).toBe('tail')
    renderer.resetView()

    expect(renderer.spanAt(300, 34)).toBe('error')
    expect(context.calls.every((call) => !call.startsWith('requestAnimationFrame'))).toBe(true)
  })

  it('keeps null and invalid selections unselected', () => {
    const context = new FakeContext()
    const renderer = new TimelineRenderer(fakeCanvas(context))
    renderer.resize(800, 240)
    renderer.setView(view(), 'error')
    context.calls.splice(0)

    renderer.setView(view(), null)
    expect(context.calls).not.toContain('strokeRect')
    context.calls.splice(0)
    renderer.setView(view(), 'missing')
    expect(context.calls).not.toContain('strokeRect')
  })

  it('uses high-DPI backing pixels while layout and hit tests stay in CSS pixels', () => {
    const context = new FakeContext()
    const canvas = fakeCanvas(context)
    const renderer = new TimelineRenderer(canvas)

    renderer.resize(800, 240, 2)
    renderer.setView(view(), 'error')

    expect(canvas.width).toBe(1600)
    expect(canvas.height).toBe(480)
    expect(context.calls).toContain('setTransform:2,0,0,2,0,0')
    expect(renderer.spanAt(300, 34)).toBe('error')
  })

  it('does not paint after safe disposal', () => {
    const context = new FakeContext()
    const renderer = new TimelineRenderer(fakeCanvas(context))
    renderer.resize(800, 240)
    renderer.setView(view())
    const beforeDispose = context.calls.length

    renderer.dispose()
    renderer.panBy(5)
    renderer.zoomBy(2)
    renderer.resize(400, 200)
    renderer.setView(view())

    expect(context.calls).toHaveLength(beforeDispose)
  })
})
