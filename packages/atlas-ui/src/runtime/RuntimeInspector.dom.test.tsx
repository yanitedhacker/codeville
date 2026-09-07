// @vitest-environment happy-dom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeTraceBundle } from '@codeville/core'
import { RuntimeInspector, type RuntimeInspectorTab } from './RuntimeInspector.js'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('RuntimeInspector real DOM keyboard semantics', () => {
  it('moves selection and focus with Arrow, Home, and End keys', async () => {
    await act(async () => root.render(<ControlledInspector />))
    const tab = (id: RuntimeInspectorTab) => container.querySelector<HTMLButtonElement>(`#cv-runtime-inspector-tab-${id}`)!
    const panel = container.querySelector<HTMLElement>('[role="tabpanel"]')!

    tab('span').focus()
    await press(tab('span'), 'ArrowRight')
    expect(document.activeElement).toBe(tab('resource'))
    expect(tab('resource').getAttribute('aria-selected')).toBe('true')
    expect(tab('resource').tabIndex).toBe(0)
    expect(tab('span').tabIndex).toBe(-1)
    expect(panel.getAttribute('aria-labelledby')).toBe('cv-runtime-inspector-tab-resource')

    await press(tab('resource'), 'End')
    expect(document.activeElement).toBe(tab('links'))
    expect(tab('links').getAttribute('aria-selected')).toBe('true')

    await press(tab('links'), 'Home')
    expect(document.activeElement).toBe(tab('span'))
    expect(tab('span').getAttribute('aria-selected')).toBe('true')

    await press(tab('span'), 'ArrowLeft')
    expect(document.activeElement).toBe(tab('links'))
    expect(tab('links').getAttribute('aria-selected')).toBe('true')
  })
})

async function press(target: HTMLElement, key: string): Promise<void> {
  await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))
}

function ControlledInspector() {
  const [tab, setTab] = useState<RuntimeInspectorTab>('span')
  return (
    <RuntimeInspector
      span={runtime.spans[0]!}
      trace={runtime.traces[0]!}
      bundle={runtime}
      tab={tab}
      onTab={setTab}
      onSelectSpan={vi.fn()}
      onOpenSource={vi.fn()}
    />
  )
}

const traceId = '11111111111111111111111111111111'
const runtime: RuntimeTraceBundle = {
  version: 1,
  format: 'otlp-json',
  traces: [{ traceId, startTimeUnixNano: '0', endTimeUnixNano: '1', spanIds: ['span'], rootSpanIds: ['span'], orphanSpanIds: [], cycleBreakSpanIds: [], hotPathSpanIds: ['span'], errorPaths: [] }],
  spans: [{
    traceId, spanId: 'span', flags: 1, sampled: true, name: 'span', kind: 1,
    startTimeUnixNano: '0', endTimeUnixNano: '1', durationNano: '1', attributes: [], droppedAttributesCount: '0',
    events: [], droppedEventsCount: '0', links: [], droppedLinksCount: '0', status: { code: 0 },
    resource: { attributes: [], droppedAttributesCount: '0' }, scope: { attributes: [], droppedAttributesCount: '0' }, relation: 'root',
  }],
  report: {
    documents: 1, resourceScopeGroups: 1, traces: 1, inputSpans: 1, spans: 1, duplicateSpans: 0,
    sampledSpans: 1, unsampledSpans: 0, redactedAttributes: 0, droppedAttributesCount: '0', droppedEventsCount: '0',
    droppedLinksCount: '0', unknownFieldCount: 0, unknownFields: [],
  },
}
