import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MAX_FILE_BYTES } from '@codeville/core'
import { readRepo } from './readdir.js'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

describe('readRepo', () => {
  it('sets truncated when the file cap cuts the walk short', async () => {
    const { files, truncated } = await readRepo(REPO_ROOT, 3)
    expect(files).toHaveLength(3)
    expect(truncated).toBe(true)
  })

  it('counts an oversized source file as skipped', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-readdir-'))
    try {
      await writeFile(join(dir, 'big.ts'), 'x'.repeat(MAX_FILE_BYTES + 1))
      const { files, skipped, truncated } = await readRepo(dir)
      expect(files).toHaveLength(0)
      expect(skipped).toBe(1)
      expect(truncated).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('follows an in-root file symlink and skips one that points outside', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-symlink-'))
    const outside = await mkdtemp(join(tmpdir(), 'cv-outside-'))
    try {
      await writeFile(join(dir, 'real.ts'), 'export const a = 1\n')
      await mkdir(join(dir, 'sub'))
      symlinkSync(join(dir, 'real.ts'), join(dir, 'sub', 'link.ts'))
      await writeFile(join(outside, 'secret.ts'), 'export const s = 1\n')
      symlinkSync(join(outside, 'secret.ts'), join(dir, 'escaped.ts'))
      const { files } = await readRepo(dir)
      expect(files.some((f) => f.path === 'sub/link.ts')).toBe(true)
      expect(files.some((f) => f.path === 'escaped.ts')).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('reports package.json files dropped by the manifest cap', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-manifests-'))
    try {
      await writeFile(join(dir, 'app.ts'), 'export const a = 1\n')
      for (let i = 0; i < 201; i++) {
        const id = String(i).padStart(3, '0')
        await mkdir(join(dir, `p${id}`))
        await writeFile(join(dir, `p${id}`, 'package.json'), `{"name":"@ws/p${id}"}\n`)
      }
      const { files, omittedWorkspaces } = await readRepo(dir)
      expect(omittedWorkspaces).toBe(1)
      expect(files.filter((f) => /(^|\/)package\.json$/.test(f.path))).toHaveLength(200)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reports Cargo.toml files dropped by the manifest cap', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-cargo-manifests-'))
    try {
      await writeFile(join(dir, 'lib.rs'), 'pub fn a() {}\n')
      for (let i = 0; i < 201; i++) {
        const id = String(i).padStart(3, '0')
        await mkdir(join(dir, `c${id}`))
        await writeFile(join(dir, `c${id}`, 'Cargo.toml'), `[package]\nname = "c${id}"\n`)
      }
      const { files, omittedWorkspaces, omittedCargo } = await readRepo(dir)
      expect(omittedWorkspaces).toBe(0)
      expect(omittedCargo).toBe(1)
      expect(files.filter((f) => /(^|\/)Cargo\.toml$/.test(f.path))).toHaveLength(200)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
