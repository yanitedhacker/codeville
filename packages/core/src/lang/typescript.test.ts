import { describe, expect, it } from 'vitest'
import { extractDependencies, extractImports } from './index.js'

const specs = (path: string, text: string): string[] => extractImports(path, text).map((i) => i.spec)

describe('typescript imports', () => {
  it('covers every form Shoppie actually uses', () => {
    const text = [
      'import { NextRequest, NextResponse } from "next/server"',
      "import type { Session } from '@/lib/session'",
      "import 'server-only'",
      "export { pool } from './db'",
      "export * from '@/lib/types'",
      "export * as ns from './ns'",
      'const mod = await import("./heavy")',
      'const pg = require("pg")',
    ].join('\n')
    expect(specs('app/api/orders/route.ts', text)).toEqual([
      'next/server', '@/lib/session', 'server-only', './db', '@/lib/types', './ns', './heavy', 'pg',
    ])
  })

  it('follows a multi-line named import to its from clause', () => {
    const text = 'import {\n  a,\n  b,\n} from "@/lib/data"\n'
    expect(specs('x.ts', text)).toEqual(['@/lib/data'])
  })

  it('keeps the whole statement as the packet payload', () => {
    const [imp] = extractImports('x.ts', 'import { Pool }   from   "pg"')
    expect(imp?.statement).toBe('import { Pool } from "pg"')
  })

  it('deduplicates repeat specifiers by first source occurrence', () => {
    const facts = extractImports('x.ts', 'import a from "pg"\nimport b from "pg"')
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({ spec: 'pg', startLine: 1, endLine: 1 })
  })

  it('does not turn a TypeScript generic declaration into an import', () => {
    const text = "export function hitLink<T extends Pick<AtlasLink, 'from' | 'to' | 'type'>>(link: T) {}"
    expect(extractImports('iso.ts', text)).toEqual([])
  })

  it('extracts ESM, reexports, dynamic imports, require, and TS import equals', () => {
    const text = [
      "import x from './x.js'",
      "export { y } from './y.js'",
      "export * from './z.js'",
      "const lazy = import('./lazy.js')",
      "const legacy = require('legacy')",
      "import fs = require('node:fs')",
    ].join('\n')
    expect(extractImports('x.ts', text).map((fact) => [fact.spec, fact.kind, fact.confidence])).toEqual([
      ['./x.js', 'static', 'exact'],
      ['./y.js', 'reexport', 'exact'],
      ['./z.js', 'reexport', 'exact'],
      ['./lazy.js', 'dynamic', 'exact'],
      ['legacy', 'require', 'heuristic'],
      ['node:fs', 'require', 'exact'],
    ])
  })

  it('falls back explicitly on a syntax error', () => {
    const result = extractDependencies('broken.ts', "import x from './x'\nconst =")
    expect(result.imports.map((fact) => fact.spec)).toEqual(['./x'])
    expect(result.report.mode).toBe('heuristic')
    expect(result.report.extractor).toBe('typescript-line-scanner')
    expect(result.report.diagnostics).toHaveLength(1)
  })

  it('ignores identifiers that merely start with import, and commented-out imports', () => {
    const text = 'const importantThing = 1\n// import { a } from "ghost"\nimport { real } from "pg"'
    expect(specs('x.ts', text)).toEqual(['pg'])
  })

  it('reads two import clauses on one line', () => {
    expect(specs('x.ts', "import a from './a'; import b from './b'")).toEqual(['./a', './b'])
  })

  it('does not treat a block-commented import as an edge', () => {
    const text = "/*\n import dead from './dead'\n*/\nimport live from './live'\n"
    expect(specs('x.ts', text)).toEqual(['./live'])
  })
})

describe('python imports', () => {
  it('reads both statement forms', () => {
    const text = 'from collections import deque\nimport logging\nfrom .local import thing\n'
    expect(specs('app/logger.py', text)).toEqual(['collections', 'collections.deque', 'logging', '.local', '.local.thing'])
  })

  it('keeps leading dots on relative specs', () => {
    expect(specs('pkg/a.py', 'from .mod import thing\nfrom ..pkg.sub import x\n')).toEqual([
      '.mod',
      '.mod.thing',
      '..pkg.sub',
      '..pkg.sub.x',
    ])
  })
})

describe('go imports', () => {
  it('reads single and block form', () => {
    const text = 'package main\n\nimport "fmt"\n\nimport (\n\t"net/http"\n\tx "os"\n)\n'
    expect(specs('main.go', text)).toEqual(['fmt', 'net/http', 'os'])
  })
})

describe('rust imports', () => {
  it('keeps the whole path including self and super', () => {
    const text = 'use std::io::Read;\nuse self::helper;\npub use serde::Serialize;\nmod util;\n'
    expect(specs('main.rs', text)).toEqual(['std::io::Read', 'self::helper', 'serde::Serialize', 'self::util'])
  })
})

describe('unknown languages', () => {
  it('yield no edges so the file still gets a slab', () => {
    expect(specs('sql/001-init.sql', 'create table orders (id bigserial);')).toEqual([])
  })
})
