import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAtlas, importOtlpTraceJson, type RuntimeTraceBundle } from '@codeville/core'

const hooks = vi.hoisted(() => {
  const slots: unknown[] = []
  let cursor = 0
  return {
    begin() {
      cursor = 0
    },
    reset() {
      cursor = 0
      slots.length = 0
    },
    useState<T>(initial: T | (() => T)) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial
      return [slots[index] as T, (next: T | ((current: T) => T)) => {
        slots[index] = typeof next === 'function' ? (next as (current: T) => T)(slots[index] as T) : next
      }] as const
    },
  }
})

const root = vi.hoisted(() => ({ render: vi.fn() }))

vi.mock('react', () => ({ useState: hooks.useState }))
vi.mock('react-dom/client', () => ({ createRoot: () => root }))
vi.mock('./Atlas.js', () => ({ Atlas: () => null }))

const atlas = buildAtlas([{ path: 'src/index.ts', text: 'export const value = 1\n' }], { repoName: 'fixture' })
const runtimeA = emptyRuntime()
const runtimeB = { ...emptyRuntime(), report: { ...emptyRuntime().report, documents: 2 } }

beforeEach(() => {
  hooks.reset()
  root.render.mockReset()
  vi.resetModules()
})

describe('standalone owner', () => {
  it('reads runtime at component initialization and clears both owners back to static Atlas', async () => {
    installDocument(atlas, runtimeA, {})
    const { StandaloneAtlas } = await import('./standalone.js')

    window.__CODEVILLE_RUNTIME__ = runtimeB
    hooks.begin()
    const runtimeMember = StandaloneAtlas({ atlas })
    expect(runtimeMember.props).toEqual(expect.objectContaining({
      atlas,
      runtime: runtimeB,
      initialMode: 'runtime',
      onClearRuntime: expect.any(Function),
      caption: 'Local source atlas / read-only projection',
    }))

    runtimeMember.props.onClearRuntime()
    expect(window.__CODEVILLE_RUNTIME__).toBeUndefined()

    hooks.begin()
    const staticMember = StandaloneAtlas({ atlas })
    expect(staticMember.props).toEqual(expect.objectContaining({ atlas, caption: 'Local source atlas / read-only projection' }))
    expect(staticMember.props).not.toHaveProperty('runtime')
    expect(staticMember.props).not.toHaveProperty('initialMode')
    expect(staticMember.props).not.toHaveProperty('onClearRuntime')
  })

  it('keeps the missing Atlas and missing root failures', async () => {
    installDocument(undefined, undefined, {})
    await expect(import('./standalone.js')).rejects.toThrow('codeville: no atlas payload found in this document')

    vi.resetModules()
    installDocument(atlas, undefined, null)
    await expect(import('./standalone.js')).rejects.toThrow('codeville: no #root element to mount into')
  })
})

function emptyRuntime(): RuntimeTraceBundle {
  return importOtlpTraceJson('{"resourceSpans":[]}')
}

function installDocument(
  payload: typeof atlas | undefined,
  runtime: RuntimeTraceBundle | undefined,
  mount: object | null,
): void {
  vi.stubGlobal('window', {
    __CODEVILLE_ATLAS__: payload,
    __CODEVILLE_RUNTIME__: runtime,
  })
  vi.stubGlobal('document', {
    getElementById: (id: string) => id === 'root' ? mount : null,
  })
}
