import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { VirtualFile } from '@codeville/core'
import { MAX_FILE_BYTES, isSource } from '@codeville/core'

/** Directories never worth walking into. Pruning here, not in scan(), keeps the walk fast. */
const PRUNE = new Set([
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.turbo', '.vercel',
  'dist', 'build', 'out', 'coverage', 'target', 'vendor',
  '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache',
  '.idea', '.vscode', '.cache', '.gradle', 'Pods',
  '.playwright-mcp', '.pnpm-store', 'bower_components',
])

/** Config files scan() drops but buildAtlas() reads first (aliases, repo name). */
const KEEP_CONFIG = /^(tsconfig(\.\w+)?\.json|package\.json|jsconfig\.json)$/

export interface ReadRepoResult {
  files: VirtualFile[]
  skipped: number
  truncated: boolean
}

export async function readRepo(root: string, maxFiles = 8000): Promise<ReadRepoResult> {
  const files: VirtualFile[] = []
  let skipped = 0
  let truncated = false
  const rootReal = await realpath(root).catch(() => root)

  const insideRoot = (real: string): boolean => real === rootReal || real.startsWith(rootReal + sep)

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (files.length >= maxFiles) {
      truncated = true
      return
    }
    if (depth > 12) {
      truncated = true
      return
    }
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : 1))

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        truncated = true
        return
      }
      const full = join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        const real = await realpath(full).catch(() => null)
        if (!real || !insideRoot(real)) continue
        const info = await stat(real).catch(() => null)
        if (!info) continue
        if (info.isDirectory()) {
          if (PRUNE.has(entry.name)) continue
          await walk(full, depth + 1)
          continue
        }
        if (info.isFile()) await takeFile(full, entry.name, info.size)
        continue
      }
      if (entry.isDirectory()) {
        if (PRUNE.has(entry.name)) continue
        // A worktree checkout under .claude would double every node in the atlas.
        if (entry.name === '.claude') {
          await walkClaude(full, depth + 1)
          continue
        }
        await walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      const info = await stat(full).catch(() => null)
      if (!info) continue
      await takeFile(full, entry.name, info.size)
    }
  }

  const takeFile = async (full: string, name: string, size: number): Promise<void> => {
    const rel = relative(root, full).split(sep).join('/')
    const isConfig = KEEP_CONFIG.test(name) && rel.split('/').length <= 2
    if (!isConfig && !isSource(rel)) return
    if (size > MAX_FILE_BYTES) {
      skipped++
      return
    }
    files.push({ path: rel, text: await readFile(full, 'utf8') })
  }

  const walkClaude = async (dir: string, depth: number): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'worktrees') await walk(join(dir, entry.name), depth + 1)
    }
  }

  await walk(root, 0)
  files.sort((a, b) => (a.path < b.path ? -1 : 1))
  return { files, skipped, truncated }
}
