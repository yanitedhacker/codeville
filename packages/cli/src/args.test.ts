import { spawnSync } from 'node:child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MAX_FILE_BYTES } from '@codeville/core'
import { parseArgs } from './index.js'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

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
