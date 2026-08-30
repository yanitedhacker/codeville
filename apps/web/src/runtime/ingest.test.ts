import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_RUNTIME_IMPORT_LIMITS,
  RuntimeImportError,
  type Atlas,
} from '@codeville/core'
import { ingestRuntimeFile } from './ingest.js'

const atlas: Atlas = {
  repo: { name: 'fixture', generatedAt: '', note: '' },
  stats: { nodes: 1, sourceFiles: 1, lines: 1, links: 0, packages: 0 },
  areas: [{ id: 'packages', label: 'Packages', color: '#aaa', count: 1 }],
  nodes: [{
    id: 'file:packages/core/src/runtime/index.ts',
    label: 'index.ts',
    path: 'packages/core/src/runtime/index.ts',
    kind: 'file',
    area: 'packages',
    role: 'module',
    contributes: [],
    lines: 1,
    bytes: 1,
    excerpt: [],
    in: 0,
    out: 0,
    x: 0,
    y: 0,
    h: 1,
  }],
  links: [],
  coverage: {
    exactFiles: 1,
    heuristicFiles: 0,
    unsupportedFiles: 0,
    failedFiles: 0,
    importFacts: 0,
    internalFacts: 0,
    externalFacts: 0,
    systemFacts: 0,
    unresolvedFacts: 0,
    ignoredFacts: 0,
    rolledUpFiles: 0,
    hiddenExternals: 0,
  },
}

interface IoDoubles {
  calls: Array<ReturnType<typeof vi.fn>>
}

function installIoDoubles(): IoDoubles {
  const throwing = () => {
    throw new Error('runtime import attempted external I/O')
  }
  const fetch = vi.fn(throwing)
  const XMLHttpRequest = vi.fn(throwing)
  const WebSocket = vi.fn(throwing)
  const sendBeacon = vi.fn(throwing)
  const localStorage = vi.fn(throwing)
  const sessionStorage = vi.fn(throwing)
  const Worker = vi.fn(throwing)

  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal('XMLHttpRequest', XMLHttpRequest)
  vi.stubGlobal('WebSocket', WebSocket)
  vi.stubGlobal('navigator', { sendBeacon })
  vi.stubGlobal('localStorage', localStorage)
  vi.stubGlobal('sessionStorage', sessionStorage)
  vi.stubGlobal('Worker', Worker)
  return { calls: [fetch, XMLHttpRequest, WebSocket, sendBeacon, localStorage, sessionStorage, Worker] }
}

function localFile(name: string, bytes: Uint8Array) {
  const arrayBuffer = vi.fn(async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  return {
    file: { name, size: bytes.byteLength, arrayBuffer } as unknown as File,
    arrayBuffer,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ingestRuntimeFile', () => {
  it.each([
    ['minimal-otlp.json', 1],
    ['minimal-otlp.jsonl', 2],
  ])('imports public %s locally as two traces and three spans', async (fixture, documents) => {
    const bytes = await readFile(new URL(`../../../../fixtures/runtime/${fixture}`, import.meta.url))
    const { file, arrayBuffer } = localFile(fixture, bytes)
    const io = installIoDoubles()

    const bundle = await ingestRuntimeFile(file, atlas, { sourceRoot: '/work/app' })

    expect(bundle.traces).toHaveLength(2)
    expect(bundle.spans).toHaveLength(3)
    expect(bundle.report.documents).toBe(documents)
    expect(bundle.spans.find((span) => span.spanId === '0000000000000001')?.source).toEqual({
      nodeId: 'file:packages/core/src/runtime/index.ts',
      path: 'packages/core/src/runtime/index.ts',
      recordedPath: 'packages/core/src/runtime/index.ts',
      kind: 'exact-file',
    })
    expect(arrayBuffer).toHaveBeenCalledOnce()
    for (const call of io.calls) expect(call).not.toHaveBeenCalled()
  })

  it('rejects an oversized file before it reads bytes', async () => {
    const arrayBuffer = vi.fn()
    const file = {
      name: 'too-large.json',
      size: DEFAULT_RUNTIME_IMPORT_LIMITS.maxInputBytes + 1,
      arrayBuffer,
    } as unknown as File

    await expect(ingestRuntimeFile(file, atlas)).rejects.toMatchObject({
      code: 'limit',
      limit: 'maxInputBytes',
      actual: DEFAULT_RUNTIME_IMPORT_LIMITS.maxInputBytes + 1,
    })
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('maps malformed UTF-8 to a safe syntax error before JSON parsing', async () => {
    const { file, arrayBuffer } = localFile('malformed.json', Uint8Array.of(0xc3, 0x28))

    let caught: unknown
    try {
      await ingestRuntimeFile(file, atlas)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(RuntimeImportError)
    expect(caught).toMatchObject({ code: 'syntax', message: 'Runtime trace is not valid UTF-8.' })
    expect((caught as Error).message).not.toMatch(/c3|0xc3|195|\uFFFD/i)
    expect(arrayBuffer).toHaveBeenCalledOnce()
  })
})
