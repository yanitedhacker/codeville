import { unzipSync, strFromU8 } from 'fflate'
import { isSource, type VirtualFile } from '@codeville/core'

const MAX_FILES = 6000
const MAX_FILE_BYTES = 512 * 1024

const PRUNE = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|target|vendor|venv|\.venv|__pycache__|\.playwright-mcp|\.claude\/worktrees)\//
const KEEP_TSCONFIG = /(^|\/)(tsconfig(\.\w+)?\.json|jsconfig\.json)$/
const KEEP_PKG = /(^|\/)package\.json$/
const KEEP_CARGO = /(^|\/)Cargo\.toml$/
const KEEP_DEEP = /(^|\/)(package\.json|go\.mod|Cargo\.toml)$/
const MAX_MANIFESTS = 200

/** Config files scan() drops but buildAtlas() reads first, so keep them near the root. */
function wanted(path: string): boolean {
  if (PRUNE.test(path)) return false
  if (isSource(path)) return true
  if (KEEP_DEEP.test(path)) return true
  return KEEP_TSCONFIG.test(path) && path.split('/').length <= 2
}

function capNamed(files: VirtualFile[], re: RegExp, max = MAX_MANIFESTS): number {
  const pkgs = files.filter((f) => re.test(f.path)).sort((a, b) => (a.path < b.path ? -1 : 1))
  if (pkgs.length <= max) return 0
  const keep = new Set(pkgs.slice(0, max).map((f) => f.path))
  for (let i = files.length - 1; i >= 0; i--) {
    const f = files[i]
    if (f && re.test(f.path) && !keep.has(f.path)) files.splice(i, 1)
  }
  return pkgs.length - max
}

function capManifests(files: VirtualFile[]): { omittedWorkspaces: number; omittedCargo: number } {
  return {
    omittedWorkspaces: capNamed(files, KEEP_PKG),
    omittedCargo: capNamed(files, KEEP_CARGO),
  }
}

export interface Ingested {
  name: string
  files: VirtualFile[]
  truncated: boolean
  omittedWorkspaces: number
  omittedCargo: number
}

/** Folder drop: walk the DataTransfer entry tree. Never touches the network. */
export async function fromDataTransfer(items: DataTransferItemList): Promise<Ingested> {
  const roots: FileSystemEntry[] = []
  for (const item of Array.from(items)) {
    const entry = item.webkitGetAsEntry?.()
    if (entry) roots.push(entry)
  }
  if (roots.length === 0) throw new Error('Nothing readable was dropped.')

  const single = roots.length === 1 ? roots[0] : undefined
  if (single?.isFile) {
    const file = await fileOf(single as FileSystemFileEntry)
    if (/\.zip$/i.test(file.name)) return fromZip(file)
  }

  const files: VirtualFile[] = []
  let truncated = false

  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (files.length >= MAX_FILES) {
      truncated = true
      return
    }
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory) {
      if (PRUNE.test(`${path}/`)) return
      for (const child of await readEntries(entry as FileSystemDirectoryEntry)) await walk(child, path)
      return
    }
    if (!wanted(path)) return
    const file = await fileOf(entry as FileSystemFileEntry)
    if (file.size > MAX_FILE_BYTES) return
    files.push({ path, text: await file.text() })
  }

  // Dropping a folder gives one root entry; strip its name so paths are repo-relative.
  const stripRoot = roots.length === 1 && roots[0]?.isDirectory
  for (const root of roots) {
    if (stripRoot) {
      for (const child of await readEntries(root as FileSystemDirectoryEntry)) await walk(child, '')
    } else {
      await walk(root, '')
    }
  }

  if (files.length === 0) throw new Error('No source files found in that folder.')
  const omitted = capManifests(files)
  return { name: roots[0]?.name ?? 'repository', files, truncated, ...omitted }
}

/** `<input type="file" webkitdirectory>` fallback for browsers without entry APIs. */
export async function fromFileList(list: FileList): Promise<Ingested> {
  const all = Array.from(list)
  const zip = all.length === 1 && /\.zip$/i.test(all[0]?.name ?? '') ? all[0] : null
  if (zip) return fromZip(zip)

  const files: VirtualFile[] = []
  let truncated = false
  let root = 'repository'

  for (const file of all) {
    const raw = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const segments = raw.split('/')
    if (segments.length > 1 && segments[0]) root = segments[0]
    const path = segments.length > 1 ? segments.slice(1).join('/') : raw
    if (!wanted(path) || file.size > MAX_FILE_BYTES) continue
    if (files.length >= MAX_FILES) {
      truncated = true
      break
    }
    files.push({ path, text: await file.text() })
  }

  if (files.length === 0) throw new Error('No source files found in that selection.')
  const omitted = capManifests(files)
  return { name: root, files, truncated, ...omitted }
}

export async function fromZip(blob: File): Promise<Ingested> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const entries = unzipSync(bytes, {
    filter: (f) => {
      const rel = stripArchiveRoot(f.name)
      return !f.name.endsWith('/') && wanted(rel) && f.originalSize <= MAX_FILE_BYTES
    },
  })

  const files: VirtualFile[] = []
  let truncated = false
  for (const [name, data] of Object.entries(entries)) {
    if (files.length >= MAX_FILES) {
      truncated = true
      break
    }
    files.push({ path: stripArchiveRoot(name), text: strFromU8(data) })
  }

  if (files.length === 0) throw new Error('No source files found in that archive.')
  const omitted = capManifests(files)
  return { name: blob.name.replace(/\.zip$/i, ''), files, truncated, ...omitted }
}

export async function fromGithub(input: string): Promise<Ingested> {
  const res = await fetch(`/api/github?repo=${encodeURIComponent(input)}`)
  const body = (await res.json()) as {
    error?: string
    repo?: string
    files?: VirtualFile[]
    truncated?: boolean
    omittedWorkspaces?: number
    omittedCargo?: number
  }
  if (!res.ok) throw new Error(body.error ?? `GitHub fetch failed (${res.status})`)
  if (!body.files?.length) throw new Error('That repository has no readable source files.')
  return {
    name: body.repo ?? input,
    files: body.files,
    truncated: body.truncated ?? false,
    omittedWorkspaces: body.omittedWorkspaces ?? 0,
    omittedCargo: body.omittedCargo ?? 0,
  }
}

/** GitHub archives nest everything under `<repo>-<sha>/`; drop that first segment. */
function stripArchiveRoot(name: string): string {
  const slash = name.indexOf('/')
  return slash < 0 ? name : name.slice(slash + 1)
}

function readEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = dir.createReader()
    const all: FileSystemEntry[] = []
    // readEntries() returns at most 100 per call; keep reading until it returns none.
    const pump = (): void =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(all)
        all.push(...batch)
        pump()
      }, reject)
    pump()
  })
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}
