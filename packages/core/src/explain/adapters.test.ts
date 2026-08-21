import { describe, expect, it } from 'vitest'
import { applyExplanations, toRequests, type ExplainRequest } from './index.js'
import { heuristic } from './heuristic.js'
import { apiKeyExplainer, cliExplainer } from './adapters.js'
import { buildAtlas } from '../atlas.js'

const req = (over: Partial<ExplainRequest> = {}): ExplainRequest => ({
  id: 'src/a.ts',
  path: 'src/a.ts',
  kind: 'file',
  role: 'service logic',
  area: 'src',
  lines: 4,
  in: 0,
  out: 0,
  excerpt: ['export const a = 1'],
  importedBy: [],
  imports: [],
  ...over,
})

describe('apiKeyExplainer', () => {
  it('returns an empty map when the env var is missing rather than throwing', async () => {
    const prev = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      const out = await apiKeyExplainer('openai').explain([req()])
      expect(out.size).toBe(0)
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = prev
    }
  })
})

describe('cliExplainer', () => {
  it('finishes when a child ignores SIGTERM rather than hanging explain()', async () => {
    const script = 'process.on("SIGTERM",()=>{});setInterval(()=>{},1e6)'
    const explainer = cliExplainer(`${process.execPath} -e ${script}`, { timeoutMs: 200, concurrency: 1 })
    const t0 = Date.now()
    const out = await explainer.explain([req()])
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(out.size).toBe(0)
  }, 5000)
})

describe('heuristic fallback', () => {
  it('fills every node when the adapter returns nothing', async () => {
    const atlas = buildAtlas([{ path: 'src/a.ts', text: 'export const a = 1\n' }], {
      now: () => '2026-08-21T00:00:00.000Z',
    })
    const empty = new Map()
    const pending = toRequests(atlas)
    const filled = applyExplanations(atlas, empty)
    expect(filled.nodes.every((n) => !n.summary)).toBe(true)
    const withHeuristic = applyExplanations(atlas, await heuristic.explain(pending))
    expect(withHeuristic.nodes.length).toBeGreaterThan(0)
    expect(withHeuristic.nodes.every((n) => typeof n.summary === 'string' && n.summary.length > 0)).toBe(true)
  })
})
