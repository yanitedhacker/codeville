import { describe, expect, it } from 'vitest'
import { buildAtlas } from '../atlas.js'
import type { AtlasLink, AtlasNode, VirtualFile } from '../types.js'
import { describeLink, describeSet, heuristic } from './heuristic.js'
import type { ExplainRequest } from './index.js'

const REPO: VirtualFile[] = [
  { path: 'package.json', text: '{"name":"demo"}' },
  { path: 'tsconfig.json', text: '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["./*"]}},"include":["**/*.ts"]}' },
  { path: 'middleware.ts', text: 'import { getSession } from "@/lib/session"\nexport function middleware() {}\n' },
  { path: 'lib/session.ts', text: 'import { jwtVerify } from "jose"\nimport { query } from "./db"\nexport const getSession = () => {}\n' },
  { path: 'lib/db.ts', text: 'import { Pool } from "pg"\nexport const query = () => {}\n' },
  { path: 'app/api/orders/route.ts', text: 'import { query } from "@/lib/db"\nexport async function POST() {}\n' },
  { path: 'app/page.tsx', text: 'export default function Home() { return null }\n' },
  { path: 'tests/lib/db.test.ts', text: 'import { query } from "@/lib/db"\n' },
  { path: 'node_modules/react/index.js', text: 'module.exports = {}' },
  { path: '.claude/worktrees/dup/lib/db.ts', text: 'import { Pool } from "pg"' },
]

const NOW = () => '2026-08-21T00:00:00.000Z'

const req = (over: Partial<ExplainRequest> = {}): ExplainRequest => ({
  id: 'src/a.ts',
  path: 'src/a.ts',
  kind: 'file',
  role: 'service logic',
  area: 'src',
  lines: 4,
  in: 0,
  out: 1,
  excerpt: ['export const a = 1'],
  importedBy: [],
  imports: [],
  ...over,
})

const summary = async (over: Partial<ExplainRequest> = {}): Promise<string> => {
  const node = req(over)
  const out = await heuristic.explain([node])
  return out.get(node.id)!.summary
}

const stub = (over: Partial<AtlasNode>): AtlasNode => ({
  id: 'x',
  label: 'x',
  path: 'x',
  kind: 'file',
  area: 'lib',
  role: 'service logic',
  contributes: [],
  lines: 10,
  bytes: 10,
  x: 0,
  y: 0,
  h: 1,
  excerpt: [],
  in: 0,
  out: 0,
  ...over,
})

describe('graph role lead clause', () => {
  it('leads with entry or unreferenced when in is 0, before line count', async () => {
    const text = await summary({ in: 0, out: 1, lines: 12 })
    expect(text.startsWith('Entry or unreferenced')).toBe(true)
    expect(text.indexOf('Entry or unreferenced')).toBeLessThan(text.indexOf('12'))
  })

  it('leads with foundation when many files depend on it', async () => {
    const text = await summary({ in: 3, out: 1, lines: 40 })
    expect(text.startsWith('Foundation: many files depend on it')).toBe(true)
  })

  it('leads with leaf when out is 0 and the node is imported', async () => {
    const text = await summary({ in: 1, out: 0, lines: 8 })
    expect(text.startsWith('Leaf in this slice')).toBe(true)
  })

  it('prefers entry over leaf when both in and out are 0', async () => {
    const text = await summary({ in: 0, out: 0 })
    expect(text.startsWith('Entry or unreferenced')).toBe(true)
    expect(text.startsWith('Leaf')).toBe(false)
  })
})

describe('describeLink', () => {
  it('quotes the import sample and never calls it containment', () => {
    const atlas = buildAtlas(REPO, { now: NOW })
    const from = atlas.nodes.find((n) => n.id === 'middleware.ts')!
    const to = atlas.nodes.find((n) => n.id === 'lib/session.ts')!
    const edge = atlas.links.find((l) => l.from === from.id && l.to === to.id && l.type === 'import')!
    const text = describeLink(edge, from, to)
    expect(text).toContain('middleware.ts imports lib/session.ts')
    expect(text).toContain('`import { getSession } from "@/lib/session"`')
    expect(text.toLowerCase()).not.toContain('containment')
    expect(text).not.toMatch(/\bcalls\b|\buses\b|\binvokes\b/)
  })

  it('says containment is not a runtime import', () => {
    const parent = stub({ id: 'lib', path: 'lib', kind: 'dir', role: 'service logic' })
    const child = stub({ id: 'lib/session.ts', path: 'lib/session.ts' })
    const edge: AtlasLink = { from: parent.id, to: child.id, type: 'containment', samples: [] }
    const text = describeLink(edge, parent, child)
    expect(text.toLowerCase()).toContain('containment')
    expect(text.toLowerCase()).toContain('not a runtime import')
    expect(text).not.toMatch(/\bimports\b/)
  })

  it('names a known package from the glossary and leaves unknown keys unnamed', () => {
    const from = stub({ id: 'lib/session.ts', path: 'lib/session.ts' })
    const jose = stub({ id: 'ext:jose', path: 'jose', kind: 'external', role: 'external dependency' })
    const known: AtlasLink = { from: from.id, to: jose.id, type: 'external', samples: ['import { jwtVerify } from "jose"'] }
    expect(describeLink(known, from, jose)).toContain('JWT')

    const mystery = stub({ id: 'ext:xyzzy', path: 'xyzzy', kind: 'external', role: 'external dependency' })
    const unknown: AtlasLink = { from: from.id, to: mystery.id, type: 'external', samples: [] }
    const text = describeLink(unknown, from, mystery)
    expect(text).toContain('external package xyzzy')
    expect(text).not.toContain('JWT')
    expect(text.toLowerCase()).not.toMatch(/magic|guess|probably/)
  })
})

describe('describeSet', () => {
  it('is deterministic and mentions both roles plus the getSession import', () => {
    const atlas = buildAtlas(REPO, { now: NOW })
    const middleware = atlas.nodes.find((n) => n.id === 'middleware.ts')!
    const session = atlas.nodes.find((n) => n.id === 'lib/session.ts')!
    const a = describeSet([session, middleware], atlas.links)
    const b = describeSet([middleware, session], atlas.links)
    expect(a).toBe(b)
    expect(a).toContain('request gate')
    expect(a).toContain('service logic')
    expect(a).toContain('`import { getSession } from "@/lib/session"`')
    expect(a).not.toMatch(/\bcalls\b|\buses\b|\binvokes\b/)
  })

  it('caps nodes, edges, and samples then says how many were omitted', () => {
    const nodes = Array.from({ length: 10 }, (_, i) =>
      stub({ id: `f${String(i).padStart(2, '0')}.ts`, path: `f${String(i).padStart(2, '0')}.ts`, role: 'source module' }),
    )
    const links: AtlasLink[] = []
    for (let i = 0; i < 9; i++) {
      for (let j = i + 1; j < i + 3 && j < 10; j++) {
        links.push({
          from: nodes[i]!.id,
          to: nodes[j]!.id,
          type: 'import',
          samples: [`import { x } from "./f${String(j).padStart(2, '0')}"`],
        })
      }
    }
    expect(links.length).toBeGreaterThan(12)
    const text = describeSet(nodes, links)
    expect(text).toContain('and 2 more')
    const extraEdges = links.length - 12
    expect(text).toContain(`and ${extraEdges.toLocaleString('en-US')} more`)
    const sampleCount = (text.match(/`import \{ x \}/g) ?? []).length
    expect(sampleCount).toBeLessThanOrEqual(6)
  })

  it('says when the selected blocks share no import or external arc', () => {
    const a = stub({ id: 'a.ts', path: 'a.ts', role: 'screen / route' })
    const b = stub({ id: 'b.ts', path: 'b.ts', role: 'test' })
    const text = describeSet([a, b], [{ from: 'dir', to: 'a.ts', type: 'containment', samples: [] }])
    expect(text).toContain('share no import')
    expect(text).toContain('a.ts')
    expect(text).toContain('b.ts')
  })
})
