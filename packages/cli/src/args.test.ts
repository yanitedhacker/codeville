import { spawnSync } from 'node:child_process'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MAX_FILE_BYTES } from '@codeville/core'
import { parseArgs } from './index.js'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

describe('parseArgs', () => {
  it('rejects a non-numeric --max-nodes', () => {
    expect(() => parseArgs(['.', '--max-nodes', 'abc'])).toThrow(/--max-nodes needs a positive number/)
  })

  it('rejects a non-positive --max-nodes', () => {
    expect(() => parseArgs(['.', '--max-nodes', '0'])).toThrow(/--max-nodes needs a positive number/)
  })

  it('keeps case in the default output filename', () => {
    const args = parseArgs(['/tmp/MixedCase'])
    expect(args?.out.endsWith('MixedCase-atlas.html')).toBe(true)
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
})
