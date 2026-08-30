import { spawnSync } from 'node:child_process'
import { access, chmod, mkdir, mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  DEFAULT_RUNTIME_IMPORT_LIMITS,
  MAX_FILE_BYTES,
  type RuntimeTraceBundle,
} from '@codeville/core'
import { parseArgs } from './index.js'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const JSON_TRACE = join(REPO_ROOT, 'fixtures/runtime/minimal-otlp.json')
const JSONL_TRACE = join(REPO_ROOT, 'fixtures/runtime/minimal-otlp.jsonl')

beforeAll(() => {
  const result = spawnSync('pnpm', ['-F', '@codeville/atlas-ui', 'build'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`Standalone prerequisite build failed.\n${result.stderr}${result.stdout}`)
  }
}, 120_000)

describe('parseArgs', () => {
  it('parses ask without defaulting an output file', () => {
    const args = parseArgs([
      'ask',
      '/tmp/demo-repo',
      '--atlas',
      '/tmp/atlas.json',
      '--explain',
      'claude',
      '--node',
      'lib/session.ts',
      '--fn',
      'getSession',
      '--question',
      'what does getSession return?',
    ])
    expect(args).toMatchObject({
      command: 'ask',
      explain: 'claude',
      node: 'lib/session.ts',
      fn: 'getSession',
      question: 'what does getSession return?',
    })
    expect(args && 'out' in args ? args.out : undefined).toBeUndefined()
    expect(args && args.command === 'ask' ? args.atlas?.endsWith('atlas.json') : false).toBe(true)
  })

  it('refuses ask when --node, --fn, or --question is missing', () => {
    expect(() => parseArgs(['ask', '/tmp/demo-repo', '--fn', 'getSession', '--question', 'why'])).toThrow(
      /ask needs --node, --fn, and --question/,
    )
    expect(() => parseArgs(['ask', '/tmp/demo-repo', '--node', 'a.ts', '--question', 'why'])).toThrow(
      /ask needs --node, --fn, and --question/,
    )
    expect(() => parseArgs(['ask', '/tmp/demo-repo', '--node', 'a.ts', '--fn', 'f'])).toThrow(
      /ask needs --node, --fn, and --question/,
    )
  })

  it('rejects a non-numeric --max-nodes', () => {
    expect(() => parseArgs(['.', '--max-nodes', 'abc'])).toThrow(/--max-nodes needs a positive number/)
  })

  it('rejects a non-positive --max-nodes', () => {
    expect(() => parseArgs(['.', '--max-nodes', '0'])).toThrow(/--max-nodes needs a positive number/)
  })

  it('keeps case in the default output filename', () => {
    const args = parseArgs(['/tmp/MixedCase'])
    expect(args?.command).toBe('generate')
    expect(args && args.command === 'generate' && args.out.endsWith('MixedCase-atlas.html')).toBe(true)
  })

  it('parses an opt-in report only for generate', () => {
    const args = parseArgs(['/tmp/demo-repo', '-o', '/tmp/atlas.json', '--report', '/tmp/atlas.md'])
    expect(args).toMatchObject({ command: 'generate' })
    expect(args && args.command === 'generate' ? args.report?.endsWith('/tmp/atlas.md') : false).toBe(true)
    expect(() => parseArgs(['ask', '/tmp/demo-repo', '--node', 'a.ts', '--fn', 'f', '--question', 'why', '--report', '/tmp/x.md'])).toThrow(/Unknown option --report/)
  })

  it('requires a report path', () => {
    expect(() => parseArgs(['/tmp/demo-repo', '--report'])).toThrow(/--report needs a value/)
  })

  it('parses generate trace paths and rejects invalid output combinations', () => {
    expect(parseArgs([
      '/tmp/demo-repo',
      '--trace',
      '/tmp/trace.json',
      '--trace-source-root',
      '/work/app',
    ])).toMatchObject({
      command: 'generate',
      trace: '/tmp/trace.json',
      traceSourceRoot: '/work/app',
    })
    expect(() => parseArgs([
      '/tmp/demo-repo',
      '--trace',
      '/tmp/trace.json',
      '-o',
      '/tmp/atlas.json',
    ])).toThrow(/--trace requires HTML output/)
    expect(() => parseArgs([
      '/tmp/demo-repo',
      '--trace-source-root',
      '/work/app',
    ])).toThrow(/--trace-source-root requires --trace/)
  })

  it('keeps trace flags on generate only', () => {
    expect(() => parseArgs([
      'ask',
      '/tmp/demo-repo',
      '--node',
      'a.ts',
      '--fn',
      'f',
      '--question',
      'why',
      '--trace',
      '/tmp/trace.json',
    ])).toThrow(/Unknown option --trace/)
  })
})

describe('CLI', () => {
  it('exits 1 for --max-nodes abc without writing an atlas', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-cli-'))
    try {
      await writeFile(join(dir, 'a.ts'), 'export const a = 1\n')
      const out = join(dir, 'atlas.json')
      const result = spawnSync('pnpm', ['exec', 'tsx', 'packages/cli/src/index.ts', dir, '--max-nodes', 'abc', '-o', out], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      })
      expect(result.status).toBe(1)
      expect(`${result.stderr}${result.stdout}`).toMatch(/--max-nodes needs a positive number/)
      await expect(access(out)).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('mentions the size cap when every source file is oversized', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-cli-empty-'))
    try {
      await writeFile(join(dir, 'big.ts'), 'x'.repeat(MAX_FILE_BYTES + 1))
      const result = spawnSync('pnpm', ['exec', 'tsx', 'packages/cli/src/index.ts', dir, '-o', join(dir, 'atlas.json')], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      })
      expect(result.status).toBe(1)
      expect(`${result.stderr}${result.stdout}`).toMatch(/512KB cap/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('writes a paired JSON and Markdown report, and omits Markdown when not requested', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-cli-report-'))
    const dirWithoutReport = await mkdtemp(join(tmpdir(), 'cv-cli-report-'))
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name: dir.split('/').pop() }))
      await writeFile(join(dir, 'a.ts'), 'export const a = 1\n')
      const out = join(dir, 'atlas.json')
      const report = join(dir, 'atlas.md')
      const result = spawnSync('pnpm', [
        'exec', 'tsx', 'packages/cli/src/index.ts', dir,
        '-o', out,
        '--report', report,
      ], { cwd: REPO_ROOT, encoding: 'utf8' })
      expect(result.status).toBe(0)
      await expect(access(out)).resolves.toBeUndefined()
      await expect(access(report)).resolves.toBeUndefined()
      const markdown = await readFile(report, 'utf8')
      expect(JSON.parse(await readFile(out, 'utf8'))).toHaveProperty('repo')
      expect(markdown).toContain(`# ${dir.split('/').pop()} — Codeville Atlas`)
      expect(markdown).toContain('## Scope and coverage')
      expect(markdown).toContain('## Visible nodes')
      expect(markdown).toContain('This is a generated visible slice; rolled-up, hidden, unsupported, failed, and unresolved facts may not appear as individual nodes or links.')

      await writeFile(join(dirWithoutReport, 'a.ts'), 'export const a = 1\n')
      const outputWithoutReport = join(dirWithoutReport, 'atlas.json')
      const second = spawnSync('pnpm', [
        'exec', 'tsx', 'packages/cli/src/index.ts', dirWithoutReport,
        '-o', outputWithoutReport,
      ], { cwd: REPO_ROOT, encoding: 'utf8' })
      expect(second.status).toBe(0)
      await expect(access(join(dirWithoutReport, 'atlas.md'))).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(dirWithoutReport, { recursive: true, force: true })
    }
  })
})

describe('CLI runtime trace boundary', () => {
  it('documents both generate-only trace options', () => {
    const result = runCli(['--help'])

    expect(result.stdout).toContain('--trace <file>')
    expect(result.stdout).toContain('--trace-source-root <path>')
  })

  it('exports equivalent sanitized public JSON and JSONL evidence without external resources', async () => {
    const repo = await fixtureRepo('cv-cli-runtime-')
    try {
      const outputs: RuntimeTraceBundle[] = []
      for (const [fixture, suffix] of [[JSON_TRACE, 'json'], [JSONL_TRACE, 'jsonl']] as const) {
        const out = join(repo, `runtime-${suffix}.html`)
        const result = runCli([repo, '--trace', fixture, '-o', out])
        expect(result.status, `${fixture}\n${result.stderr}${result.stdout}`).toBe(0)
        expect(result.stderr).toContain('codeville: runtime: 2 traces · 3 spans')

        const html = await readFile(out, 'utf8')
        const runtime = embeddedRuntime(html)
        expect(runtime).toMatchObject({
          traces: expect.arrayContaining([expect.any(Object), expect.any(Object)]),
          spans: expect.arrayContaining([expect.any(Object), expect.any(Object), expect.any(Object)]),
          report: { traces: 2, spans: 3, redactedAttributes: 1 },
        })
        expect(runtime.traces).toHaveLength(2)
        expect(runtime.spans).toHaveLength(3)
        expect(html).not.toContain('fixture-secret')
        expect(html).toContain("connect-src 'none'")
        expect(networkCapableReferences(html)).toEqual([])
        outputs.push(runtime)
      }

      expect(outputs[1]!.traces).toEqual(outputs[0]!.traces)
      expect(outputs[1]!.spans).toEqual(outputs[0]!.spans)
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  }, 120_000)

  it('defaults exact source correlation to the analyzed repository root', async () => {
    const fixture = await fixtureRepo('cv-cli-source-root-', 'packages/core/src/runtime/index.ts')
    const repo = join(fixture, 'packages/core')
    const traceDir = await mkdtemp(join(tmpdir(), 'cv-cli-trace-root-'))
    try {
      const document = JSON.parse(await readFile(JSON_TRACE, 'utf8')) as {
        resourceSpans: Array<{
          scopeSpans: Array<{
            spans: Array<{ attributes: Array<{ key: string; value: { stringValue?: string } }> }>
          }>
        }>
      }
      const sourceAttribute = document.resourceSpans
        .flatMap((resource) => resource.scopeSpans)
        .flatMap((scope) => scope.spans)
        .flatMap((span) => span.attributes)
        .find((attribute) => attribute.key === 'code.file.path')
      sourceAttribute!.value.stringValue = join(fixture, 'packages/core/src/runtime/index.ts')
      const trace = join(traceDir, 'absolute-source.json')
      await writeFile(trace, JSON.stringify(document))
      const out = join(traceDir, 'atlas.html')

      const result = runCli([repo, '--trace', trace, '-o', out])
      expect(result.status, result.stderr).toBe(0)
      const matched = embeddedRuntime(await readFile(out, 'utf8')).spans.find((span) => span.source)
      expect(matched?.source).toMatchObject({
        path: 'src/runtime/index.ts',
        recordedPath: join(fixture, 'packages/core/src/runtime/index.ts'),
        kind: 'exact-file',
      })
    } finally {
      await rm(fixture, { recursive: true, force: true })
      await rm(traceDir, { recursive: true, force: true })
    }
  }, 120_000)

  it('rejects an unreadable sparse over-limit trace before reading it', async () => {
    const repo = await fixtureRepo('cv-cli-over-limit-')
    const traceDir = await mkdtemp(join(tmpdir(), 'cv-cli-over-limit-trace-'))
    const trace = join(traceDir, 'too-large.json')
    const out = join(traceDir, 'atlas.html')
    try {
      await writeFile(trace, '')
      await truncate(trace, DEFAULT_RUNTIME_IMPORT_LIMITS.maxInputBytes + 1)
      await chmod(trace, 0o000)

      const result = runCli([repo, '--trace', trace, '-o', out])
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(`Runtime trace exceeds maxInputBytes (${DEFAULT_RUNTIME_IMPORT_LIMITS.maxInputBytes + 1}).`)
      expect(result.stderr).not.toMatch(/EACCES|permission denied/i)
      await expect(access(out)).rejects.toThrow()
    } finally {
      await chmod(trace, 0o600).catch(() => {})
      await rm(repo, { recursive: true, force: true })
      await rm(traceDir, { recursive: true, force: true })
    }
  }, 120_000)

  it('maps malformed bytes to only the safe fatal UTF-8 error', async () => {
    const repo = await fixtureRepo('cv-cli-utf8-')
    const traceDir = await mkdtemp(join(tmpdir(), 'cv-cli-utf8-trace-'))
    const trace = join(traceDir, 'malformed.json')
    const out = join(traceDir, 'atlas.html')
    try {
      await writeFile(trace, Buffer.from([0xc3, 0x28]))
      const result = runCli([repo, '--trace', trace, '-o', out])
      const runtimeErrors = result.stderr
        .split('\n')
        .filter((line) => line.startsWith('codeville: Runtime trace'))

      expect(result.status).toBe(1)
      expect(runtimeErrors).toEqual(['codeville: Runtime trace is not valid UTF-8.'])
      expect(result.stderr).not.toContain('\ufffd')
      await expect(access(out)).rejects.toThrow()
    } finally {
      await rm(repo, { recursive: true, force: true })
      await rm(traceDir, { recursive: true, force: true })
    }
  }, 120_000)

  it('rejects trace plus Atlas JSON and leaves static JSON unchanged without trace', async () => {
    const repo = await fixtureRepo('cv-cli-json-boundary-')
    try {
      const rejected = join(repo, 'runtime-atlas.json')
      const traceResult = runCli([repo, '--trace', JSON_TRACE, '-o', rejected])
      expect(traceResult.status).toBe(1)
      expect(`${traceResult.stderr}${traceResult.stdout}`).toContain('--trace requires HTML output')
      await expect(access(rejected)).rejects.toThrow()

      const staticOut = join(repo, 'static-atlas.json')
      const staticResult = runCli([repo, '-o', staticOut])
      expect(staticResult.status, staticResult.stderr).toBe(0)
      const staticAtlas = JSON.parse(await readFile(staticOut, 'utf8')) as Record<string, unknown>
      expect(staticAtlas).toHaveProperty('repo')
      expect(staticAtlas).toHaveProperty('nodes')
      expect(staticAtlas).not.toHaveProperty('runtime')
      expect(staticAtlas).not.toHaveProperty('traces')
      expect(staticAtlas).not.toHaveProperty('spans')
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  }, 120_000)

  it('keeps runtime evidence out of the static-source Markdown report', async () => {
    const repo = await fixtureRepo('cv-cli-runtime-report-')
    try {
      const out = join(repo, 'runtime-atlas.html')
      const report = join(repo, 'runtime-atlas.md')
      const result = runCli([repo, '--trace', JSON_TRACE, '-o', out, '--report', report])
      expect(result.status, result.stderr).toBe(0)

      const markdown = await readFile(report, 'utf8')
      const exclusion = 'Runtime trace data is not included in this static-source Markdown report.'
      expect(markdown.split(exclusion)).toHaveLength(2)
      expect(markdown).toContain(`\n${exclusion}\n`)
      for (const runtimeValue of [
        '11111111111111111111111111111111',
        '22222222222222222222222222222222',
        '0000000000000001',
        'import runtime trace',
        'derive runtime views',
        'worker trace',
        'fixture error',
        'authorization',
        'fixture-secret',
        'redacted',
      ]) {
        expect(markdown).not.toContain(runtimeValue)
      }
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  }, 120_000)
})

function runCli(args: string[]) {
  return spawnSync('pnpm', ['exec', 'tsx', 'packages/cli/src/index.ts', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
}

async function fixtureRepo(prefix: string, sourcePath = 'src/index.ts'): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), prefix))
  const source = join(repo, sourcePath)
  await writeFile(join(repo, 'package.json'), JSON.stringify({ name: prefix.replace(/-$/, '') }))
  await mkdir(dirname(source), { recursive: true })
  await writeFile(source, 'export const value = 1\n')
  return repo
}

function embeddedRuntime(html: string): RuntimeTraceBundle {
  const match = /window\.__CODEVILLE_RUNTIME__=(.*?)<\/script>/s.exec(html)
  expect(match).not.toBeNull()
  return JSON.parse(match![1]!) as RuntimeTraceBundle
}

function networkCapableReferences(html: string): string[] {
  return [
    /<script\b[^>]*\bsrc\s*=/gi,
    /<link\b[^>]*\bhref\s*=/gi,
    /<(?:img|iframe|frame|source)\b[^>]*\b(?:src|srcset)\s*=\s*["']?(?:https?:)?\/\//gi,
    /@import\s+(?:url\s*\()?\s*["']?(?:https?:)?\/\//gi,
    /url\(\s*["']?(?:https?:)?\/\//gi,
  ].flatMap((pattern) => html.match(pattern) ?? [])
}
