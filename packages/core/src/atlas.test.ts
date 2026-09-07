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
    expect(role('src/lib/db.test.ts')).toBe('test')
    expect(role('src/components/Button.test.tsx')).toBe('test')
    expect(role('src/lib/db.ts')).toBe('service logic')
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
    expect(edge).toEqual(
      expect.objectContaining({
        confidence: 'exact',
        observations: 1,
        evidence: [
          expect.objectContaining({
            path: 'middleware.ts',
            startLine: 1,
            endLine: 1,
            extractor: 'babel',
            confidence: 'exact',
          }),
        ],
      }),
    )
  })

  it('accounts for every import fact in a resolution bucket', () => {
    const { coverage } = atlas
    expect(
      coverage.internalFacts +
        coverage.externalFacts +
        coverage.systemFacts +
        coverage.unresolvedFacts +
        coverage.ignoredFacts,
    ).toBe(coverage.importFacts)
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

  it('gives at least one linked node different dependency coordinates from city', () => {
    const linked = new Set<string>()
    for (const link of atlas.links) {
      linked.add(link.from)
      linked.add(link.to)
    }
    expect(
      atlas.nodes.some((n) => {
        const city = n.positions?.city
        const dependency = n.positions?.dependency
        if (!city || !dependency || !linked.has(n.id)) return false
        return city.x !== dependency.x || city.y !== dependency.y
      }),
    ).toBe(true)
  })

  it('records outline symbols on file nodes, capped, and omits them on packages', () => {
    const session = atlas.nodes.find((n) => n.id === 'lib/session.ts')
    expect(session?.symbols).toContain('getSession')
    expect(session?.symbols?.length).toBeLessThanOrEqual(60)
    expect(atlas.nodes.filter((n) => n.kind === 'external').every((n) => n.symbols === undefined)).toBe(true)
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

  it('keeps a deep runtime source file visible when the default node budget has room', () => {
    const built = buildAtlas(
      [{ path: 'packages/core/src/runtime/index.ts', text: 'export const runtime = true\n' }],
      { now: NOW },
    )

    expect(built.nodes).toContainEqual(
      expect.objectContaining({ path: 'packages/core/src/runtime/index.ts', kind: 'file' }),
    )
  })

  it('respects the node budget on a wide repo', () => {
    const wide: VirtualFile[] = Array.from({ length: 800 }, (_, i) => ({
      path: `src/mod${i}/index.ts`,
      text: `export const v${i} = ${i}\n`,
    }))
    const capped = buildAtlas(wide, { now: NOW, maxNodes: 60 })
    expect(capped.nodes.length).toBeLessThanOrEqual(60)
  })

  it('prefers tsconfig.json over tsconfig.build.json regardless of input order', () => {
    const files: VirtualFile[] = [
      { path: 'tsconfig.build.json', text: '{ "extends": "./tsconfig.json" }' },
      {
        path: 'tsconfig.json',
        text: '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"] } } }',
      },
      { path: 'src/a.ts', text: 'export const a = 1\n' },
      { path: 'src/b.ts', text: 'import { a } from "@/a"\nimport React from "react"\n' },
    ]
    for (const order of [files, [...files].reverse()]) {
      const built = buildAtlas(order, { now: NOW })
      expect(built.links.some((l) => l.type === 'import' && l.to === 'src/a.ts')).toBe(true)
      expect(built.nodes.some((n) => n.id === extId('@/a') || n.path === '@/a')).toBe(false)
      expect(built.nodes.filter((n) => n.kind === 'external').map((n) => n.label)).toEqual(['react'])
    }
  })

  it('follows extends through .. to a parent tsconfig', () => {
    const files: VirtualFile[] = [
      {
        path: 'tsconfig.base.json',
        text: '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"] } } }',
      },
      { path: 'apps/tsconfig.json', text: '{ "extends": "../tsconfig.base.json" }' },
      { path: 'src/a.ts', text: 'export const a = 1\n' },
      { path: 'src/b.ts', text: 'import { a } from "@/a"\nimport React from "react"\n' },
    ]
    const built = buildAtlas(files, { now: NOW })
    expect(built.links.some((l) => l.type === 'import' && l.to === 'src/a.ts')).toBe(true)
    expect(built.nodes.some((n) => n.id === extId('@/a') || n.path === '@/a')).toBe(false)
    expect(built.nodes.filter((n) => n.kind === 'external').map((n) => n.label)).toEqual(['react'])
  })

  it('folds colocated tests under src/lib into the src area', () => {
    const onlyTests: VirtualFile[] = Array.from({ length: 10 }, (_, i) => ({
      path: `src/lib/t${i}.test.ts`,
      text: `import { describe } from "vitest"\n`,
    }))
    const built = buildAtlas(onlyTests, { now: NOW })
    expect(built.repo.note).toMatch(/src/)
    expect(built.nodes.filter((n) => n.kind !== 'external')).toHaveLength(1)
    expect(built.nodes[0]?.kind).toBe('dir')
    expect(onlyTests.every((f) => role(f.path) === 'test')).toBe(true)
  })

  it('does not fold a 40/60 test/source mix under src/lib', () => {
    const mixed: VirtualFile[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ path: `src/lib/m${i}.ts`, text: `export const v${i} = ${i}\n` })),
      ...Array.from({ length: 4 }, (_, i) => ({ path: `src/lib/m${i}.test.ts`, text: `import './m${i}.js'\n` })),
    ]
    const built = buildAtlas(mixed, { now: NOW })
    expect(built.nodes.some((n) => n.path === 'src/lib/m0.ts')).toBe(true)
    expect(built.repo.note).not.toContain('rolled into single blocks')
  })

  it('reports the real package count while capping rendered externals', () => {
    const imports = Array.from({ length: 45 }, (_, i) => `import p${i} from "pkg${i}"`).join('\n')
    const built = buildAtlas([{ path: 'src/app.ts', text: `${imports}\n` }], { now: NOW })
    expect(built.stats.packages).toBe(45)
    expect(built.nodes.filter((n) => n.kind === 'external')).toHaveLength(40)
    expect(built.repo.note).toContain('40 of 45 packages shown')
  })

  it('includes externals in the node budget', () => {
    const imports = Array.from({ length: 20 }, (_, i) => `import p${i} from "pkg${i}"`).join('\n')
    const built = buildAtlas([{ path: 'src/app.ts', text: `${imports}\n` }], { now: NOW, maxNodes: 5 })
    expect(built.stats.nodes).toBeLessThanOrEqual(5)
    expect(built.nodes.length).toBeLessThanOrEqual(5)
  })

  it('does not collapse-to-one when maxNodes is NaN', () => {
    const files: VirtualFile[] = Array.from({ length: 30 }, (_, i) => ({
      path: `src/lib/m${i}.ts`,
      text: `export const v${i} = ${i}\n`,
    }))
    const built = buildAtlas(files, { now: NOW, maxNodes: Number.NaN })
    expect(built.nodes.length).toBeGreaterThan(1)
  })

  it('turns a workspace package import into a file-to-file edge', () => {
    const files: VirtualFile[] = [
      { path: 'packages/a/package.json', text: '{"name":"@ws/a","main":"./src/index.ts"}' },
      { path: 'packages/b/package.json', text: '{"name":"@ws/b","main":"./src/index.ts"}' },
      { path: 'packages/a/src/index.ts', text: 'import { x } from "@ws/b"\nexport const a = 1\n' },
      { path: 'packages/b/src/index.ts', text: 'export const x = 1\n' },
    ]
    const built = buildAtlas(files, { now: NOW })
    expect(built.links).toContainEqual(
      expect.objectContaining({ from: 'packages/a/src/index.ts', to: 'packages/b/src/index.ts', type: 'import' }),
    )
    expect(built.nodes.filter((n) => n.kind === 'external')).toHaveLength(0)
  })

  it('says when workspace package.json files were dropped by the manifest cap', () => {
    const files: VirtualFile[] = [
      { path: 'src/app.ts', text: 'import { x } from "@ws/p200"\n' },
      ...Array.from({ length: 201 }, (_, i) => {
        const id = String(i).padStart(3, '0')
        return {
          path: `packages/p${id}/package.json`,
          text: `{"name":"@ws/p${id}","main":"./index.ts"}`,
        }
      }),
      ...Array.from({ length: 201 }, (_, i) => {
        const id = String(i).padStart(3, '0')
        return { path: `packages/p${id}/index.ts`, text: 'export const x = 1\n' }
      }),
    ]
    const built = buildAtlas(files, { now: NOW, maxNodes: 500 })
    expect(built.repo.note).toContain('1 workspace package omitted')
    expect(built.nodes.some((n) => n.kind === 'external' && n.label === '@ws/p200')).toBe(true)
  })

  it('uses the omittedWorkspaces count ingest reports after capping', () => {
    const files: VirtualFile[] = [
      { path: 'src/app.ts', text: 'import { x } from "@ws/p200"\n' },
      ...Array.from({ length: 200 }, (_, i) => {
        const id = String(i).padStart(3, '0')
        return {
          path: `packages/p${id}/package.json`,
          text: `{"name":"@ws/p${id}","main":"./index.ts"}`,
        }
      }),
      ...Array.from({ length: 200 }, (_, i) => {
        const id = String(i).padStart(3, '0')
        return { path: `packages/p${id}/index.ts`, text: 'export const x = 1\n' }
      }),
    ]
    const built = buildAtlas(files, { now: NOW, maxNodes: 500, omitted: { npm: 1 } })
    expect(built.repo.note).toContain('1 workspace package omitted')
    expect(built.nodes.some((n) => n.kind === 'external' && n.label === '@ws/p200')).toBe(true)
  })

  it('says when Cargo.toml files were dropped by the manifest cap', () => {
    const files: VirtualFile[] = [
      ...Array.from({ length: 201 }, (_, i) => {
        const id = String(i).padStart(3, '0')
        const deps = i === 0 ? '\n\n[dependencies]\nc200 = { path = "../c200" }\n' : '\n'
        return {
          path: `crates/c${id}/Cargo.toml`,
          text: `[package]\nname = "c${id}"${deps}`,
        }
      }),
      ...Array.from({ length: 201 }, (_, i) => {
        const id = String(i).padStart(3, '0')
        return {
          path: `crates/c${id}/src/lib.rs`,
          text: i === 0 ? 'use c200::x;\n' : 'pub const x: i32 = 1;\n',
        }
      }),
    ]
    const built = buildAtlas(files, { now: NOW, maxNodes: 500 })
    expect(built.repo.note).toContain('1 cargo crate omitted')
    expect(built.repo.note).not.toContain('workspace package')
    expect(built.nodes.some((n) => n.kind === 'external' && n.label === 'c200')).toBe(true)
  })

  it('uses the omittedCargo count ingest reports after capping', () => {
    const files: VirtualFile[] = [
      ...Array.from({ length: 200 }, (_, i) => {
        const id = String(i).padStart(3, '0')
        const deps = i === 0 ? '\n\n[dependencies]\nc200 = { path = "../c200" }\n' : '\n'
        return {
          path: `crates/c${id}/Cargo.toml`,
          text: `[package]\nname = "c${id}"${deps}`,
        }
      }),
      ...Array.from({ length: 201 }, (_, i) => {
        const id = String(i).padStart(3, '0')
        return {
          path: `crates/c${id}/src/lib.rs`,
          text: i === 0 ? 'use c200::x;\n' : 'pub const x: i32 = 1;\n',
        }
      }),
    ]
    const built = buildAtlas(files, { now: NOW, maxNodes: 500, omitted: { cargo: 1 } })
    expect(built.repo.note).toContain('1 cargo crate omitted')
    expect(built.nodes.some((n) => n.kind === 'external' && n.label === 'c200')).toBe(true)
  })

  it('names npm and cargo omissions separately in the note', () => {
    const built = buildAtlas([{ path: 'src/lib.rs', text: 'pub fn f() {}\n' }], {
      now: NOW,
      omitted: { npm: 1, cargo: 2 },
    })
    expect(built.repo.note).toContain('1 workspace package and 2 cargo crates omitted')
  })
})
