import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ensureFnInOutline, resolveUnderRoot } from './ask.js'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

describe('resolveUnderRoot', () => {
  const root = '/tmp/codeville-ask-root'

  it('joins a repo-relative file path', () => {
    expect(resolveUnderRoot(root, 'lib/session.ts')).toBe(join(root, 'lib/session.ts'))
  })

  it('rejects .. segments and absolute paths', () => {
    expect(() => resolveUnderRoot(root, '../secret.ts')).toThrow(/escapes/)
    expect(() => resolveUnderRoot(root, 'lib/../../etc/passwd')).toThrow(/escapes/)
    expect(() => resolveUnderRoot(root, '/etc/passwd')).toThrow(/escapes/)
  })
})

describe('ensureFnInOutline', () => {
  it('refuses a name the file does not declare', () => {
    expect(() => ensureFnInOutline('export const getSession = () => {}\n', 'getSeshun', 'lib/session.ts')).toThrow(
      /getSeshun is not in the outline of lib\/session\.ts/,
    )
  })

  it('accepts a name outline finds', () => {
    expect(() => ensureFnInOutline('export const getSession = () => {}\n', 'getSession', 'lib/session.ts')).not.toThrow()
  })
})

describe('CLI ask', () => {
  it('exits 1 when --fn is not in the file outline and does not write HTML', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-ask-'))
    try {
      await mkdir(join(dir, 'lib'))
      await writeFile(join(dir, 'lib/session.ts'), 'export const getSession = () => {}\n')
      const out = join(dir, 'atlas.html')
      const result = spawnSync(
        'pnpm',
        [
          'exec',
          'tsx',
          'packages/cli/src/index.ts',
          'ask',
          dir,
          '--node',
          'lib/session.ts',
          '--fn',
          'getSeshun',
          '--question',
          'what does this return?',
          '--explain',
          'heuristic',
          '-o',
          out,
        ],
        { cwd: REPO_ROOT, encoding: 'utf8' },
      )
      expect(result.status).toBe(1)
      expect(`${result.stderr}${result.stdout}`).toMatch(/getSeshun is not in the outline/)
      await expect(access(out)).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('prints a heuristic answer without writing HTML', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-ask-h-'))
    try {
      await mkdir(join(dir, 'lib'))
      await writeFile(join(dir, 'lib/session.ts'), 'export const getSession = () => {}\n')
      const result = spawnSync(
        'pnpm',
        [
          'exec',
          'tsx',
          'packages/cli/src/index.ts',
          'ask',
          dir,
          '--node',
          'lib/session.ts',
          '--fn',
          'getSession',
          '--question',
          'what does this return?',
          '--explain',
          'heuristic',
        ],
        { cwd: REPO_ROOT, encoding: 'utf8' },
      )
      expect(result.status).toBe(0)
      expect(result.stdout).toMatch(/getSession/)
      expect(result.stdout.toLowerCase()).toContain('heuristic')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('exits 1 when the explainer binary is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-ask-bin-'))
    try {
      await mkdir(join(dir, 'lib'))
      await writeFile(join(dir, 'lib/session.ts'), 'export const getSession = () => {}\n')
      const result = spawnSync(
        'pnpm',
        [
          'exec',
          'tsx',
          'packages/cli/src/index.ts',
          'ask',
          dir,
          '--node',
          'lib/session.ts',
          '--fn',
          'getSession',
          '--question',
          'what does this return?',
          '--explain',
          'cli:codeville-no-such-ask-bin',
        ],
        { cwd: REPO_ROOT, encoding: 'utf8' },
      )
      expect(result.status).toBe(1)
      expect(`${result.stderr}${result.stdout}`).not.toMatch(/getSession is not in the outline/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
