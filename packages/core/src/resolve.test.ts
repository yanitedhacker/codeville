import { describe, expect, it } from 'vitest'
import { createResolver, readTsconfigAliases } from './resolve.js'
import { stripJsonc } from './jsonc.js'
import type { FileRecord } from './types.js'

const files = (...paths: string[]): FileRecord[] =>
  paths.map((path) => ({
    path,
    dir: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
    name: path.slice(path.lastIndexOf('/') + 1),
    ext: path.slice(path.lastIndexOf('.') + 1),
    area: path.split('/')[0] ?? 'root',
    lines: 1,
    bytes: 1,
    excerpt: [],
    imports: [],
  }))

// Shoppie's real tsconfig: the `@/*` -> `./*` pair next to `**/*.ts` in `include`
// is what broke the first (regex-based) comment stripper.
const SHOPPIE_TSCONFIG = `{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}`

describe('readTsconfigAliases', () => {
  it('survives a glob in include that looks like a block comment', () => {
    expect(readTsconfigAliases(SHOPPIE_TSCONFIG)).toEqual({ aliases: { '@/*': ['./*'] }, baseUrl: '.' })
  })

  it('handles real comments and trailing commas', () => {
    const text = `{
      // leading
      "compilerOptions": {
        /* block */
        "baseUrl": "src",
        "paths": { "~/*": ["lib/*"], },
      },
    }`
    expect(readTsconfigAliases(text)).toEqual({ aliases: { '~/*': ['lib/*'] }, baseUrl: 'src' })
  })

  it('does not treat a URL inside a string as a comment', () => {
    expect(stripJsonc('{"a":"https://x.dev/y"}')).toBe('{"a":"https://x.dev/y"}')
  })

  it('returns empty options for unparseable input rather than throwing', () => {
    expect(readTsconfigAliases('{ not json')).toEqual({})
  })
})

describe('resolve', () => {
  const repo = files('lib/db.ts', 'lib/index.ts', 'components/ui.tsx', 'app/api/orders/route.ts', 'lib/nested/mod.ts')
  const r = createResolver(repo, readTsconfigAliases(SHOPPIE_TSCONFIG))

  it('resolves the @/ alias to a repo path', () => {
    expect(r.resolve('@/lib/db', 'app/api/orders')).toBe('lib/db.ts')
    expect(r.resolve('@/components/ui', 'app')).toBe('components/ui.tsx')
  })

  it('resolves relative specifiers against the importing directory', () => {
    expect(r.resolve('./db', 'lib')).toBe('lib/db.ts')
    expect(r.resolve('../lib/db', 'components')).toBe('lib/db.ts')
    expect(r.resolve('./nested/mod', 'lib')).toBe('lib/nested/mod.ts')
  })

  it('falls back to a directory index file', () => {
    expect(r.resolve('@/lib', 'app')).toBe('lib/index.ts')
  })

  it('returns null for packages, and names them instead', () => {
    expect(r.resolve('next/server', 'app')).toBeNull()
    expect(r.externalName('next/server')).toBe('next')
    expect(r.externalName('@sentry/node')).toBe('@sentry/node')
    expect(r.externalName('@sentry/node/esm/x')).toBe('@sentry/node')
    expect(r.externalName('node:crypto')).toBe('crypto')
  })

  it('never reports an aliased specifier as external, even when the file is missing', () => {
    expect(r.resolve('@/lib/ghost', 'app')).toBeNull()
    expect(r.externalName('@/lib/ghost')).toBeNull()
  })

  it('resolves dotted python module paths', () => {
    const py = createResolver(files('app/logger.py', 'app/__init__.py'))
    expect(py.resolve('app.logger', 'app')).toBe('app/logger.py')
    expect(py.resolve('app', 'scripts')).toBe('app/__init__.py')
  })
})
