import { describe, expect, it } from 'vitest'
import { createResolver, readTsconfigAliases, readWorkspacePackages } from './resolve.js'
import { parseJsonc, stripJsonc } from './jsonc.js'
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

  it('strips a UTF-8 BOM before parsing', () => {
    const bom = `\uFEFF${SHOPPIE_TSCONFIG}`
    expect(readTsconfigAliases(bom)).toEqual(readTsconfigAliases(SHOPPIE_TSCONFIG))
    expect(parseJsonc('\uFEFF{"compilerOptions":{"baseUrl":"."}}')).toEqual({
      compilerOptions: { baseUrl: '.' },
    })
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

  it('returns null when a relative specifier walks off the repo root', () => {
    const edge = createResolver(files('foo.ts', 'src/utils/mod.ts'))
    expect(edge.resolve('../../../../foo', 'src/utils')).toBeNull()
    expect(edge.resolve('../foo', '')).toBeNull()
  })

  it('still resolves a relative import that lands on a root file', () => {
    const edge = createResolver(files('foo.ts', 'src/utils/mod.ts'))
    expect(edge.resolve('../../foo', 'src/utils')).toBe('foo.ts')
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

  it('resolves python relative imports via leading dots', () => {
    const py = createResolver(files('pkg/mod.py', 'pkg/sub/__init__.py', 'pkg/sub.py', 'app/main.py'))
    expect(py.resolve('.mod', 'pkg')).toBe('pkg/mod.py')
    expect(py.resolve('..pkg.sub', 'app')).toMatch(/^pkg\/sub(\.py|\/__init__\.py)$/)
    expect(py.externalName('.mod')).toBeNull()
    expect(py.externalName('..pkg.sub')).toBeNull()
  })

  it('treats an exact alias as an exact match, not a prefix', () => {
    const r = createResolver(files('src/index.ts', 'shims/react.ts'), {
      aliases: { react: ['./shims/react.ts'] },
      baseUrl: '.',
    })
    expect(r.resolve('react', 'src')).toBe('shims/react.ts')
    expect(r.externalName('react')).toBeNull()
    expect(r.externalName('react-dom')).toBe('react-dom')
    expect(r.externalName('react-router-dom')).toBe('react-router-dom')
    expect(r.externalName('reactflow')).toBe('reactflow')
    expect(r.externalName('lodash')).toBe('lodash')
  })

  it('does not let a bare "@" alias swallow scoped packages', () => {
    const at = createResolver(files('src/a.ts'), {
      aliases: { '@': ['./src'], '@/*': ['./src/*'] },
      baseUrl: '.',
    })
    expect(at.resolve('@/a', 'src')).toBe('src/a.ts')
    expect(at.externalName('@tanstack/react-query')).toBe('@tanstack/react-query')
    expect(at.externalName('@radix-ui/react-dialog')).toBe('@radix-ui/react-dialog')
    expect(at.externalName('react')).toBe('react')
  })

  it('does not let a "*" path pattern drop every package', () => {
    const star = createResolver(files('src/x.ts'), { aliases: { '*': ['src/*'] }, baseUrl: '.' })
    expect(star.externalName('react')).toBe('react')
  })

  it('rewrites a .js specifier to the TypeScript file on disk', () => {
    const r = createResolver(files('packages/core/src/types.ts', 'packages/core/src/resolve.ts'))
    expect(r.resolve('./types.js', 'packages/core/src')).toBe('packages/core/src/types.ts')
  })

  it('rewrites a .js specifier to a .tsx module', () => {
    const r = createResolver(files('apps/web/src/App.tsx', 'apps/web/src/main.tsx'))
    expect(r.resolve('./App.js', 'apps/web/src')).toBe('apps/web/src/App.tsx')
  })

  it('rewrites a directory index imported with .js', () => {
    const r = createResolver(files('apps/web/src/ingest/index.ts', 'apps/web/src/App.tsx'))
    expect(r.resolve('./ingest/index.js', 'apps/web/src')).toBe('apps/web/src/ingest/index.ts')
  })

  it('rewrites .mjs to .mts and .cjs to .cts', () => {
    const r = createResolver(files('src/worker.mts', 'src/legacy.cts'))
    expect(r.resolve('./worker.mjs', 'src')).toBe('src/worker.mts')
    expect(r.resolve('./legacy.cjs', 'src')).toBe('src/legacy.cts')
  })

  it('prefers a real .js file over a sibling .ts of the same stem', () => {
    const r = createResolver(files('src/utils.js', 'src/utils.ts'))
    expect(r.resolve('./utils.js', 'src')).toBe('src/utils.js')
  })

  it('does not treat a dotted directory name as a file extension', () => {
    const r = createResolver(files('src/config.d/index.ts'))
    expect(r.resolve('./config.d/index', 'src')).toBe('src/config.d/index.ts')
  })

  it('returns null when a rewritten specifier still has no file', () => {
    const r = createResolver(files('src/a.ts'))
    expect(r.resolve('./missing.js', 'src')).toBeNull()
  })
})

describe('workspace packages', () => {
  it('resolves a workspace name to the file named in main', () => {
    const repo = files('packages/core/src/index.ts')
    const workspaces = readWorkspacePackages(
      [{ path: 'packages/core/package.json', text: '{"name":"@acme/core","main":"./src/index.ts"}' }],
      new Set(repo.map((f) => f.path)),
    )
    const r = createResolver(repo, { workspaces })
    expect(r.resolve('@acme/core', 'app')).toBe('packages/core/src/index.ts')
  })

  it('resolves a subpath through the package exports map', () => {
    const repo = files('packages/core/src/index.ts', 'packages/core/src/util.ts')
    const workspaces = readWorkspacePackages(
      [
        {
          path: 'packages/core/package.json',
          text: '{"name":"@acme/core","exports":{"./*":"./src/*.ts"}}',
        },
      ],
      new Set(repo.map((f) => f.path)),
    )
    const r = createResolver(repo, { workspaces })
    expect(r.resolve('@acme/core/util', 'app')).toBe('packages/core/src/util.ts')
  })

  it('does not treat a workspace package as an external', () => {
    const repo = files('packages/core/src/index.ts')
    const workspaces = readWorkspacePackages(
      [{ path: 'packages/core/package.json', text: '{"name":"@acme/core","main":"./src/index.ts"}' }],
      new Set(repo.map((f) => f.path)),
    )
    const r = createResolver(repo, { workspaces })
    expect(r.externalName('@acme/core')).toBeNull()
    expect(r.externalName('react')).toBe('react')
  })

  it('ignores a manifest with no name field without throwing', () => {
    expect(() =>
      readWorkspacePackages(
        [{ path: 'package.json', text: '{"main":"./src/index.ts"}' }],
        new Set(['src/index.ts']),
      ),
    ).not.toThrow()
    expect(
      readWorkspacePackages(
        [{ path: 'package.json', text: '{"main":"./src/index.ts"}' }],
        new Set(['src/index.ts']),
      ),
    ).toEqual({})
  })

  it('skips a manifest whose entry resolves to nothing, so the specifier stays external', () => {
    const repo = files('src/app.ts')
    const workspaces = readWorkspacePackages(
      [{ path: 'packages/ghost/package.json', text: '{"name":"@acme/ghost","main":"./missing.js"}' }],
      new Set(repo.map((f) => f.path)),
    )
    expect(workspaces).toEqual({})
    const r = createResolver(repo, { workspaces })
    expect(r.resolve('@acme/ghost', 'src')).toBeNull()
    expect(r.externalName('@acme/ghost')).toBe('@acme/ghost')
  })
})
