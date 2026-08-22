import { describe, expect, it } from 'vitest'
import { areaOf, excerptOf, isIgnored, isSource, scan } from './scan.js'

describe('isIgnored', () => {
  it('drops a nested worktree checkout, which would double every node', () => {
    expect(isIgnored('.claude/worktrees/exciting-saha-e4a5e7/lib/data.ts')).toBe(true)
    expect(isIgnored('lib/data.ts')).toBe(false)
  })

  it('drops vendored and generated trees', () => {
    for (const p of [
      'node_modules/react/index.js',
      'app/node_modules/x/y.ts',
      '.next/server/app/page.js',
      'dist/bundle.js',
      'coverage/lcov-report/x.js',
      '.playwright-mcp/shot.ts',
      'venv/lib/site.py',
    ]) {
      expect(isIgnored(p), p).toBe(true)
    }
  })

  it('drops lockfiles, env files, and non-source', () => {
    expect(isIgnored('package-lock.json')).toBe(true)
    expect(isIgnored('.env.development.local')).toBe(true)
    expect(isIgnored('app/.env.local')).toBe(true)
    expect(isIgnored('README.md')).toBe(true)
    expect(isIgnored('public/icon.png')).toBe(true)
  })

  it('honours caller-supplied prefixes on a whole-segment boundary', () => {
    expect(isIgnored('Future landing page/index.tsx', ['Future landing page'])).toBe(true)
    expect(isIgnored('Future landing pages/index.tsx', ['Future landing page'])).toBe(false)
  })
})

describe('isSource', () => {
  it('accepts code and schema, rejects prose and assets', () => {
    for (const p of ['a.ts', 'a.tsx', 'a.py', 'a.go', 'a.rs', 'a.sql', 'a.vue']) expect(isSource(p), p).toBe(true)
    for (const p of ['a.md', 'a.png', 'a.lock', 'Makefile']) expect(isSource(p), p).toBe(false)
  })
})

describe('areaOf', () => {
  it('uses the top-level directory, or root for loose files', () => {
    expect(areaOf('lib/data.ts')).toBe('lib')
    expect(areaOf('middleware.ts')).toBe('root')
  })
})

describe('excerptOf', () => {
  it('skips blank lines and caps the count', () => {
    expect(excerptOf('import a\n\n\nimport b\nimport c\n', 2)).toEqual(['import a', 'import b'])
  })

  it('truncates very long lines', () => {
    const [line] = excerptOf('x'.repeat(200))
    expect(line).toHaveLength(96)
    expect(line?.endsWith('…')).toBe(true)
  })
})

describe('scan', () => {
  it('records line counts, area, and imports; skips binaries', () => {
    const records = scan([
      { path: 'lib/db.ts', text: 'import { Pool } from "pg"\nexport const pool = new Pool()\n' },
      { path: 'lib/blob.ts', text: 'binary\u0000payload' },
      { path: 'node_modules/x/i.js', text: 'nope' },
    ])
    expect(records.map((r) => r.path)).toEqual(['lib/db.ts'])
    const [db] = records
    expect(db?.lines).toBe(2)
    expect(db?.area).toBe('lib')
    expect(db?.imports).toEqual([{
      spec: 'pg',
      statement: 'import { Pool } from "pg"',
      kind: 'static',
      startLine: 1,
      endLine: 1,
      extractor: 'babel',
      confidence: 'exact',
    }])
    expect(db?.extraction).toEqual({ mode: 'exact', extractor: 'babel', diagnostics: [] })
  })

  it('returns records sorted by path, so downstream output is stable', () => {
    const records = scan([
      { path: 'b.ts', text: 'x' },
      { path: 'a.ts', text: 'x' },
    ])
    expect(records.map((r) => r.path)).toEqual(['a.ts', 'b.ts'])
  })

  it('records a TypeScript file with no imports as exact', () => {
    const [file] = scan([{ path: 'empty.ts', text: 'export const x = 1\n' }])
    expect(file?.imports).toEqual([])
    expect(file?.extraction).toEqual({ mode: 'exact', extractor: 'babel', diagnostics: [] })
  })

  it('records an SFC as heuristic', () => {
    const [file] = scan([{ path: 'App.vue', text: "import x from './x'\n" }])
    expect(file?.extraction.mode).toBe('heuristic')
    expect(file?.extraction.extractor).toBe('typescript-line-scanner')
    expect(file?.imports.map((fact) => fact.spec)).toEqual(['./x'])
  })

  it('records a Java file as unsupported', () => {
    const [file] = scan([{ path: 'Main.java', text: 'import java.util.List;\nclass Main {}\n' }])
    expect(file?.imports).toEqual([])
    expect(file?.extraction).toEqual({ mode: 'unsupported', extractor: null, diagnostics: [] })
  })

  it('reports heuristic fallback with one diagnostic for malformed TypeScript', () => {
    const [file] = scan([{ path: 'broken.ts', text: "import x from './x'\nconst =\n" }])
    expect(file?.imports.map((fact) => fact.spec)).toEqual(['./x'])
    expect(file?.extraction.mode).toBe('heuristic')
    expect(file?.extraction.extractor).toBe('typescript-line-scanner')
    expect(file?.extraction.diagnostics).toHaveLength(1)
  })
})
