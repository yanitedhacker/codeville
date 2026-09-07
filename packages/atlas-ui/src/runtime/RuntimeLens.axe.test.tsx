// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axe from 'axe-core'
import { buildAtlas, type RuntimeTraceBundle } from '@codeville/core'
import { RuntimeLens } from './RuntimeLens.js'

class AxeCanvasContext {
  fillStyle = ''
  strokeStyle = ''
  lineWidth = 1
  font = ''
  textBaseline: CanvasTextBaseline = 'alphabetic'
  textAlign: CanvasTextAlign = 'start'
  setTransform(): void {}
  clearRect(): void {}
  fillRect(): void {}
  strokeRect(): void {}
  fillText(): void {}
  save(): void {}
  restore(): void {}
  beginPath(): void {}
  rect(): void {}
  clip(): void {}
  moveTo(): void {}
  lineTo(): void {}
  stroke(): void {}
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    disconnect(): void {}
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1200,
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLCanvasElement) { return Number.parseFloat(this.style.height) || 240 },
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => new AxeCanvasContext(),
  })
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

describe('Runtime Lens automated accessibility', () => {
  it('has no axe-detectable WCAG A or AA issues except color contrast in simulated DOM', async () => {
    const atlas = buildAtlas([{ path: 'packages/core/src/runtime/index.ts', text: 'export {}\n' }], {
      now: () => '2026-08-31T00:00:00.000Z',
    })
    await act(async () => root.render(
      <RuntimeLens
        atlas={atlas}
        runtime={runtime}
        onShowStatic={vi.fn()}
        onOpenSource={vi.fn()}
        onClearRuntime={vi.fn()}
      />,
    ))

    const results = await axe.run(container, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
      rules: {
        'color-contrast': { enabled: false },
      },
    })

    expect(results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target),
    }))).toEqual([])
  })
})

const traceId = '11111111111111111111111111111111'
const spanId = '0000000000000001'
const runtime: RuntimeTraceBundle = {
  version: 1,
  format: 'otlp-json',
  traces: [{
    traceId,
    startTimeUnixNano: '100',
    endTimeUnixNano: '200',
    spanIds: [spanId],
    rootSpanIds: [spanId],
    orphanSpanIds: [],
    cycleBreakSpanIds: [],
    hotPathSpanIds: [spanId],
    errorPaths: [],
  }],
  spans: [{
    traceId,
    spanId,
    flags: 1,
    sampled: true,
    name: 'request',
    kind: 2,
    startTimeUnixNano: '100',
    endTimeUnixNano: '200',
    durationNano: '100',
    attributes: [],
    droppedAttributesCount: '0',
    events: [],
    droppedEventsCount: '0',
    links: [],
    droppedLinksCount: '0',
    status: { code: 1 },
    resource: {
      attributes: [{ key: 'service.name', value: { type: 'string', value: 'api' } }],
      droppedAttributesCount: '0',
    },
    scope: { attributes: [], droppedAttributesCount: '0' },
    relation: 'root',
  }],
  report: {
    documents: 1,
    resourceScopeGroups: 1,
    traces: 1,
    inputSpans: 1,
    spans: 1,
    duplicateSpans: 0,
    sampledSpans: 1,
    unsampledSpans: 0,
    redactedAttributes: 0,
    droppedAttributesCount: '0',
    droppedEventsCount: '0',
    droppedLinksCount: '0',
    unknownFieldCount: 0,
    unknownFields: [],
  },
}
