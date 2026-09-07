import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { RuntimeImportError, type RuntimeTraceBundle } from '@codeville/core'

type AnyElement = ReactElement<Record<string, any>>

const harness = vi.hoisted(() => {
  const slots: Array<{ value: unknown; deps?: unknown[] }> = []
  let cursor = 0
  const state = {
    atlasProps: null as Record<string, any> | null,
    dialogProps: null as Record<string, any> | null,
  }

  function sameDeps(left: unknown[] | undefined, right: unknown[]) {
    return left != null && left.length === right.length && right.every((value, index) => Object.is(value, left[index]))
  }

  return {
    state,
    begin() {
      cursor = 0
      state.atlasProps = null
      state.dialogProps = null
    },
    reset() {
      cursor = 0
      slots.length = 0
      state.atlasProps = null
      state.dialogProps = null
    },
    useState<T>(initial: T | (() => T)) {
      const index = cursor++
      let slot = slots[index]
      if (!slot) {
        slot = { value: typeof initial === 'function' ? (initial as () => T)() : initial }
        slots[index] = slot
      }
      return [slot.value as T, (next: T | ((current: T) => T)) => {
        slot!.value = typeof next === 'function' ? (next as (current: T) => T)(slot!.value as T) : next
      }] as const
    },
    useRef<T>(initial: T) {
      const index = cursor++
      let slot = slots[index]
      if (!slot) {
        slot = { value: { current: initial } }
        slots[index] = slot
      }
      return slot.value as { current: T }
    },
    useCallback<T extends (...args: any[]) => any>(callback: T, deps: unknown[]) {
      const index = cursor++
      let slot = slots[index]
      if (!slot || !sameDeps(slot.deps, deps)) {
        slot = { value: callback, deps: [...deps] }
        slots[index] = slot
      }
      return slot.value as T
    },
  }
})

const boundaries = vi.hoisted(() => ({
  fromDataTransfer: vi.fn(),
  ingestRuntimeFile: vi.fn(),
  exportAtlas: vi.fn(),
}))

vi.mock('react', () => ({
  useState: harness.useState,
  useRef: harness.useRef,
  useCallback: harness.useCallback,
  useEffect: vi.fn(),
}))

vi.mock('@codeville/atlas-ui', () => ({
  Atlas: (props: Record<string, any>) => {
    harness.state.atlasProps = props
    return null
  },
}))

vi.mock('./runtime/RuntimeImportDialog.js', () => ({
  RuntimeImportDialog: (props: Record<string, any>) => {
    harness.state.dialogProps = props
    return null
  },
}))

vi.mock('./runtime/ingest.js', () => ({ ingestRuntimeFile: boundaries.ingestRuntimeFile }))
vi.mock('./export.js', () => ({ exportAtlas: boundaries.exportAtlas }))
vi.mock('./ingest/index.js', () => ({
  fromDataTransfer: boundaries.fromDataTransfer,
  fromFileList: vi.fn(),
  fromGithub: vi.fn(),
}))

const runtimeA = runtimeBundle('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
const runtimeB = runtimeBundle('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
const runtimeEmpty = runtimeBundle()

let App: () => unknown
let RuntimeImportDialog: (props: {
  busy: boolean
  error: string | null
  onCancel(): void
  onImport(file: File, sourceRoot?: string): void
}) => unknown

beforeAll(async () => {
  App = (await import('./App.js')).App
  RuntimeImportDialog = (
    await vi.importActual<typeof import('./runtime/RuntimeImportDialog.js')>('./runtime/RuntimeImportDialog.js')
  ).RuntimeImportDialog
})

beforeEach(() => {
  harness.reset()
  boundaries.fromDataTransfer.mockReset()
  boundaries.ingestRuntimeFile.mockReset()
  boundaries.exportAtlas.mockReset()
  boundaries.fromDataTransfer.mockResolvedValue({
    name: 'fixture',
    files: [{ path: 'src/index.ts', text: 'export const value = 1' }],
    truncated: false,
    omittedWorkspaces: 0,
    omittedCargo: 0,
  })
})

describe('App runtime import transaction', () => {
  it('keeps accepted bundle A by identity while B is pending and after B safely rejects', async () => {
    await openRepository()
    expect(buttons(harness.state.atlasProps?.footerExtra).map(buttonText)).toContain('Import OTLP trace')

    boundaries.ingestRuntimeFile.mockResolvedValueOnce(runtimeA)
    openImportDialog()
    const acceptedAtlas = harness.state.atlasProps!.atlas
    const acceptedFile = file('a.json')
    const accepted = harness.state.dialogProps!.onImport(acceptedFile, '/work/app')
    await accepted
    renderApp()

    expect(boundaries.ingestRuntimeFile).toHaveBeenNthCalledWith(
      1,
      acceptedFile,
      acceptedAtlas,
      { sourceRoot: '/work/app' },
    )
    expect(harness.state.atlasProps).toEqual(expect.objectContaining({
      runtime: runtimeA,
      initialMode: 'runtime',
      onClearRuntime: expect.any(Function),
    }))
    expect(harness.state.dialogProps).toBeNull()

    let rejectB!: (error: unknown) => void
    const pendingB = new Promise<RuntimeTraceBundle>((_resolve, reject) => { rejectB = reject })
    boundaries.ingestRuntimeFile.mockReturnValueOnce(pendingB)
    openImportDialog()
    const replacing = harness.state.dialogProps!.onImport(file('b.json'))
    renderApp()

    expect(harness.state.atlasProps?.runtime).toBe(runtimeA)
    expect(harness.state.dialogProps).toEqual(expect.objectContaining({ busy: true, error: null }))
    expect(harness.state.atlasProps?.runtime).not.toBe(runtimeB)
    clickFooter('Export HTML (includes sanitized telemetry)')
    expect(boundaries.exportAtlas).toHaveBeenLastCalledWith(acceptedAtlas, runtimeA)

    rejectB(new RuntimeImportError('syntax', 'Runtime trace input is not valid JSON.'))
    await replacing
    renderApp()

    expect(harness.state.atlasProps?.runtime).toBe(runtimeA)
    expect(harness.state.dialogProps).toEqual(expect.objectContaining({
      busy: false,
      error: 'Runtime trace input is not valid JSON.',
    }))
    expect(harness.state.atlasProps?.runtime).not.toBe(runtimeB)
    clickFooter('Export HTML (includes sanitized telemetry)')
    expect(boundaries.exportAtlas).toHaveBeenLastCalledWith(acceptedAtlas, runtimeA)
  })

  it('maps unknown failures to the fixed safe message and keeps the dialog available', async () => {
    await openRepository()
    boundaries.ingestRuntimeFile.mockRejectedValueOnce({ imported: '<hostile>' })
    openImportDialog()

    await harness.state.dialogProps!.onImport(file('unknown.json'))
    renderApp()

    expect(harness.state.atlasProps?.runtime).toBeUndefined()
    expect(harness.state.dialogProps).toEqual(expect.objectContaining({
      busy: false,
      error: 'Could not import that runtime trace.',
    }))
  })

  it('clears runtime data to the static member and keeps the import action available', async () => {
    await openRepository()
    boundaries.ingestRuntimeFile.mockResolvedValueOnce(runtimeA)
    openImportDialog()
    await harness.state.dialogProps!.onImport(file('a.json'))
    renderApp()

    harness.state.atlasProps!.onClearRuntime()
    renderApp()

    expect(harness.state.atlasProps).not.toHaveProperty('runtime')
    expect(harness.state.atlasProps).not.toHaveProperty('onClearRuntime')
    expect(harness.state.atlasProps?.initialMode).toBeUndefined()
    expect(buttons(harness.state.atlasProps?.footerExtra).map(buttonText)).toContain('Import OTLP trace')
  })

  it('releases runtime and import feedback when New repo starts the repository flow again', async () => {
    await openRepository()
    boundaries.ingestRuntimeFile.mockResolvedValueOnce(runtimeA)
    openImportDialog()
    await harness.state.dialogProps!.onImport(file('a.json'))
    renderApp()

    clickFooter('New repo')
    const drop = renderApp()
    expect(find(drop, (element) => element.props.className === 'drop-root')).toBeDefined()
    expect(harness.state.atlasProps).toBeNull()

    await importRepositoryFrom(drop)
    renderApp()
    expect(harness.state.atlasProps).not.toHaveProperty('runtime')
    expect(harness.state.dialogProps).toBeNull()
  })
})

describe('App export', () => {
  it('preserves static export and includes an accepted empty sanitized runtime bundle', async () => {
    await openRepository()
    const acceptedAtlas = harness.state.atlasProps!.atlas

    expect(buttons(harness.state.atlasProps?.footerExtra).map(buttonText)).toContain('Export html')
    clickFooter('Export html')
    expect(boundaries.exportAtlas).toHaveBeenLastCalledWith(acceptedAtlas)

    boundaries.ingestRuntimeFile.mockResolvedValueOnce(runtimeEmpty)
    openImportDialog()
    await harness.state.dialogProps!.onImport(file('empty.json'))
    renderApp()

    const labels = buttons(harness.state.atlasProps?.footerExtra).map(buttonText)
    expect(labels).toContain('Export HTML (includes sanitized telemetry)')
    expect(labels).not.toContain('Export html')
    clickFooter('Export HTML (includes sanitized telemetry)')
    expect(boundaries.exportAtlas).toHaveBeenLastCalledWith(acceptedAtlas, runtimeEmpty)
  })
})

describe('RuntimeImportDialog', () => {
  it('renders only the labeled local file and optional source-root controls with native actions', () => {
    const value = RuntimeImportDialog({
      busy: false,
      error: 'Safe import error.',
      onCancel: vi.fn(),
      onImport: vi.fn(),
    })
    const elements = walk(value)
    const fileInput = elements.find((element) => element.type === 'input' && element.props.type === 'file')
    const rootInput = elements.find((element) => element.type === 'input' && element.props.type === 'text')

    expect(fileInput?.props).toEqual(expect.objectContaining({
      id: 'cv-runtime-file',
      accept: '.json,.jsonl,application/json',
      required: true,
    }))
    expect(rootInput?.props).toEqual(expect.objectContaining({
      id: 'cv-runtime-source-root',
      name: 'sourceRoot',
    }))
    expect(text(value)).toContain('Source root recorded in the trace')
    expect(text(value)).toContain('Safe import error.')
    expect(buttons(value).map(buttonText)).toEqual(['Import', 'Cancel'])
    expect(elements.some((element) => element.type === 'input' && element.props.type === 'url')).toBe(false)
  })

  it('keeps busy and safe-error text visible and disables repeated submission', () => {
    const value = RuntimeImportDialog({
      busy: true,
      error: 'The prior safe error remains visible.',
      onCancel: vi.fn(),
      onImport: vi.fn(),
    })
    const controls = buttons(value)

    expect(controls.find((button) => buttonText(button) === 'Import')?.props.disabled).toBe(true)
    expect(text(value)).toContain('Importing runtime trace…')
    expect(text(value)).toContain('The prior safe error remains visible.')
  })

  it('marks the atlas background inert and passes the exact Import opener ref', async () => {
    await openRepository()
    clickFooter('Import OTLP trace')
    const opened = renderApp()
    const background = find(opened, (element) => element.props.className === 'cv-runtime-app-background')
    const importButton = buttons(harness.state.atlasProps?.footerExtra).find((candidate) => buttonText(candidate) === 'Import OTLP trace')

    expect(background?.props.inert).toBe(true)
    expect(background?.props['aria-hidden']).toBe(true)
    expect(importButton?.props.ref).toBeDefined()
    expect(harness.state.dialogProps?.returnFocusRef).toBe(importButton?.props.ref)
  })
})

async function openRepository() {
  await importRepositoryFrom(renderApp())
  renderApp()
  expect(harness.state.atlasProps?.atlas).toBeDefined()
}

async function importRepositoryFrom(value: unknown) {
  const drop = find(value, (element) => element.props.className === 'drop-root')
  drop!.props.onDrop({
    preventDefault() {},
    dataTransfer: { items: {} },
  })
  await new Promise((resolve) => setTimeout(resolve, 5))
}

function openImportDialog() {
  clickFooter('Import OTLP trace')
  renderApp()
  expect(harness.state.dialogProps).not.toBeNull()
}

function clickFooter(label: string) {
  const button = buttons(harness.state.atlasProps?.footerExtra).find((candidate) => buttonText(candidate) === label)
  expect(button).toBeDefined()
  button!.props.onClick()
}

function renderApp() {
  harness.begin()
  const value = App()
  realize(value)
  return value
}

function realize(value: any): void {
  if (value == null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) realize(child)
    return
  }
  if (typeof value.type === 'function') {
    realize(value.type(value.props))
    return
  }
  realize(value.props?.children)
}

function walk(value: any): AnyElement[] {
  if (value == null || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(walk)
  return [value, ...walk(value.props?.children)]
}

function find(value: unknown, predicate: (element: AnyElement) => boolean) {
  return walk(value).find(predicate)
}

function buttons(value: unknown) {
  return walk(value).filter((element) => element.type === 'button')
}

function text(value: any): string {
  if (value == null || typeof value === 'boolean') return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(text).join('')
  return text(value.props?.children)
}

function buttonText(button: AnyElement) {
  return text(button.props.children)
}

function file(name: string) {
  return { name, size: 2, arrayBuffer: async () => new ArrayBuffer(2) } as File
}

function runtimeBundle(traceId?: string): RuntimeTraceBundle {
  return {
    version: 1,
    format: 'otlp-json',
    traces: traceId === undefined ? [] : [{
      traceId,
      startTimeUnixNano: '1',
      endTimeUnixNano: '2',
      spanIds: [],
      rootSpanIds: [],
      orphanSpanIds: [],
      cycleBreakSpanIds: [],
      hotPathSpanIds: [],
      errorPaths: [],
    }],
    spans: [],
    report: {
      documents: 1,
      resourceScopeGroups: 0,
      traces: traceId === undefined ? 0 : 1,
      inputSpans: 0,
      spans: 0,
      duplicateSpans: 0,
      sampledSpans: 0,
      unsampledSpans: 0,
      redactedAttributes: 0,
      droppedAttributesCount: '0',
      droppedEventsCount: '0',
      droppedLinksCount: '0',
      unknownFieldCount: 0,
      unknownFields: [],
    },
  }
}
