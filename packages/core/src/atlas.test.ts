import { describe, expect, it } from 'vitest'
import { buildAtlas } from './atlas.js'
import { classify, modalRole } from './classify.js'
import { dirId, extId } from './graph.js'
import type { VirtualFile } from './types.js'

const role = (path: string): string => classify({ path } as never).label

describe('classify', () => {
  it('reads a Next.js App Router tree the way a person would', () => {
    expect(role('app/api/orders/route.ts')).toBe('api endpoint')
    expect(role('app/staff/page.tsx')).toBe('screen / route')
    expect(role('app/layout.tsx')).toBe('layout shell')
    expect(role('app/error.tsx')).toBe('route boundary')
    expect(role('middleware.ts')).toBe('request gate')
    expect(role('instrumentation.ts')).toBe('boot hook')
    expect(role('components/bill-edit-form.tsx')).toBe('ui component')
    expect(role('hooks/use-sse.ts')).toBe('react hook')
    expect(role('lib/data.ts')).toBe('service logic')
    expect(role('sql/063-add-packing.sql')).toBe('schema migration')
    expect(role('tests/lib/billing.test.ts')).toBe('test')
    expect(role('scripts/apply-migration.mjs')).toBe('ops script')
    expect(role('next.config.mjs')).toBe('build config')
  })

  it('falls back to a generic role rather than guessing', () => {
    expect(role('weird/thing.ts')).toBe('source module')
  })
})

describe('modalRole', () => {
  it('promotes a directory of routes to a route surface', () => {
    expect(modalRole(['api endpoint', 'api endpoint', 'service logic']).label).toBe('route surface')
  })

  it('breaks ties deterministically by name', () => {
    expect(modalRole(['b role', 'a role']).label).toBe(modalRole(['a role', 'b role']).label)
  })
})

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

describe('buildAtlas', () => {
  const atlas = buildAtlas(REPO, { now: NOW })

  it('excludes vendored trees and duplicate worktree checkouts from the counts', () => {
    expect(atlas.stats.sourceFiles).toBe(6)
    expect(atlas.nodes.some((n) => n.path.includes('node_modules'))).toBe(false)
    expect(atlas.nodes.some((n) => n.path.includes('worktrees'))).toBe(false)
  })

  it('names the repo from package.json', () => {
    expect(atlas.repo.name).toBe('demo')
  })

  it('resolves aliased imports into real edges, not phantom packages', () => {
    const imports = atlas.links.filter((l) => l.type === 'import')
    expect(imports).toContainEqual(
      expect.objectContaining({ from: 'middleware.ts', to: 'lib/session.ts', type: 'import' }),
    )
    expect(atlas.nodes.some((n) => n.id === extId('@/lib'))).toBe(false)
  })

  it('carries the literal import statement on the edge as the packet payload', () => {
    const edge = atlas.links.find((l) => l.from === 'middleware.ts' && l.to === 'lib/session.ts')
    expect(edge?.samples).toContain('import { getSession } from "@/lib/session"')
  })

  it('counts fan-in and fan-out without letting containment inflate them', () => {
    const db = atlas.nodes.find((n) => n.id === 'lib/db.ts')
    expect(db?.in).toBe(3) // session, the orders route, the rolled-up tests slab
    expect(db?.out).toBe(1) // pg
  })

  it('rolls a test area into one slab and reports it in the note', () => {
    const tests = atlas.nodes.find((n) => n.id === dirId('tests'))
    expect(tests?.kind).toBe('dir')
    expect(atlas.nodes.some((n) => n.path === 'tests/lib/db.test.ts')).toBe(false)
    expect(atlas.repo.note).toContain('tests')
  })

  it('gives every node a finite position and a bounded height', () => {
    for (const n of atlas.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true)
      expect(n.h).toBeGreaterThan(0)
      expect(n.h).toBeLessThanOrEqual(1.4)
    }
  })

  it('is deterministic: same input, byte-identical atlas', () => {
    const a = JSON.stringify(buildAtlas(REPO, { now: NOW }))
    const b = JSON.stringify(buildAtlas(REPO, { now: NOW }))
    expect(a).toBe(b)
  })

  it('is order-independent: shuffled input yields the same atlas', () => {
    const shuffled = [...REPO].reverse()
    expect(JSON.stringify(buildAtlas(shuffled, { now: NOW }))).toBe(JSON.stringify(buildAtlas(REPO, { now: NOW })))
  })

  it('does not fold a source tree just because it colocates its tests', () => {
    // hono/src keeps `x.ts` next to `x.test.ts`; a modal-role rule collapsed the
    // whole library into one block. Only a supermajority of test files may fold it.
    const colocated: VirtualFile[] = [
      ...Array.from({ length: 12 }, (_, i) => ({ path: `src/mod${i}.ts`, text: `export const v${i} = ${i}\n` })),
      ...Array.from({ length: 10 }, (_, i) => ({ path: `src/mod${i}.test.ts`, text: `import './mod${i}.js'\n` })),
    ]
    const built = buildAtlas(colocated, { now: NOW })
    expect(built.nodes.some((n) => n.path === 'src/mod0.ts')).toBe(true)
    expect(built.repo.note).not.toContain('rolled into single blocks')
  })

  it('folds an area that really is all reference material', () => {
    const allTests: VirtualFile[] = [
      { path: 'src/app.ts', text: 'export const app = 1\n' },
      ...Array.from({ length: 9 }, (_, i) => ({ path: `tests/a${i}.test.ts`, text: `import '../src/app.js'\n` })),
    ]
    const built = buildAtlas(allTests, { now: NOW })
    expect(built.nodes.some((n) => n.path.startsWith('tests/a'))).toBe(false)
    expect(built.nodes.find((n) => n.id === dirId('tests'))?.items).toBe(9)
  })

  it('sacrifices reference areas before source when the node budget bites', () => {
    const mixed: VirtualFile[] = [
      ...Array.from({ length: 30 }, (_, i) => ({ path: `src/m${i}.ts`, text: `export const v = ${i}\n` })),
      ...Array.from({ length: 30 }, (_, i) => ({ path: `benchmarks/b${i}.test.ts`, text: `import '../src/m0.js'\n` })),
    ]
    const built = buildAtlas(mixed, { now: NOW, maxNodes: 40 })
    expect(built.nodes.some((n) => n.path === 'src/m0.ts')).toBe(true)
    expect(built.nodes.some((n) => n.path.startsWith('benchmarks/b'))).toBe(false)
  })

  it('respects the node budget on a wide repo', () => {
    const wide: VirtualFile[] = Array.from({ length: 800 }, (_, i) => ({
      path: `src/mod${i}/index.ts`,
      text: `export const v${i} = ${i}\n`,
    }))
    const capped = buildAtlas(wide, { now: NOW, maxNodes: 60 })
    expect(capped.nodes.length).toBeLessThanOrEqual(60)
  })
})
