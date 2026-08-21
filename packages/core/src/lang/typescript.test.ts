import { describe, expect, it } from 'vitest'
import { extractImports } from './index.js'

const specs = (path: string, text: string): string[] => extractImports(path, text).map((i) => i.spec)

describe('typescript imports', () => {
  it('covers every form Shoppie actually uses', () => {
    const text = [
      'import { NextRequest, NextResponse } from "next/server"',
      "import type { Session } from '@/lib/session'",
      "import 'server-only'",
      "export { pool } from './db'",
      "export * from '@/lib/types'",
      'const mod = await import("./heavy")',
      'const pg = require("pg")',
    ].join('\n')
    expect(specs('app/api/orders/route.ts', text)).toEqual([
      'next/server', '@/lib/session', 'server-only', './db', '@/lib/types', './heavy', 'pg',
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

  it('deduplicates repeat specifiers', () => {
    expect(specs('x.ts', 'import a from "pg"\nimport b from "pg"')).toEqual(['pg'])
  })

  it('ignores identifiers that merely start with import, and commented-out imports', () => {
    const text = 'const importantThing = 1\n// import { a } from "ghost"\nimport { real } from "pg"'
    expect(specs('x.ts', text)).toEqual(['pg'])
  })
})

describe('python imports', () => {
  it('reads both statement forms', () => {
    const text = 'from collections import deque\nimport logging\nfrom .local import thing\n'
    expect(specs('app/logger.py', text)).toEqual(['collections', 'logging', '.local'])
  })
})

describe('go imports', () => {
  it('reads single and block form', () => {
    const text = 'package main\n\nimport "fmt"\n\nimport (\n\t"net/http"\n\tx "os"\n)\n'
    expect(specs('main.go', text)).toEqual(['fmt', 'net/http', 'os'])
  })
})

describe('rust imports', () => {
  it('takes the crate root and skips self/super', () => {
    const text = 'use std::io::Read;\nuse self::helper;\npub use serde::Serialize;\nmod util;\n'
    expect(specs('main.rs', text)).toEqual(['std', 'serde', 'util'])
  })
})

describe('unknown languages', () => {
  it('yield no edges so the file still gets a slab', () => {
    expect(specs('sql/001-init.sql', 'create table orders (id bigserial);')).toEqual([])
  })
})
