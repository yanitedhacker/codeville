import type { FileRecord, VirtualFile } from './types.js'
import { extractImports } from './lang/index.js'
import { outline } from './outline.js'

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.turbo', '.vercel',
  'dist', 'build', 'out', 'coverage', 'target', 'vendor',
  '.venv', 'venv', 'env', '__pycache__', '.pytest_cache', '.mypy_cache',
  '.idea', '.vscode', '.cache', '.parcel-cache', '.gradle', 'Pods',
  '.playwright-mcp', '.pnpm-store', 'bower_components',
])

/** Path fragments that mean "a whole second copy of the repo lives under here". */
const NESTED_CHECKOUT = [/(^|\/)\.claude\/worktrees\//, /(^|\/)\.git\//]

const IGNORED_FILES = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock',
  'poetry.lock', 'Cargo.lock', 'composer.lock', 'Gemfile.lock',
  '.DS_Store', 'tsconfig.tsbuildinfo',
])

const SOURCE_EXT = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts',
  'py', 'pyi', 'go', 'rs', 'rb', 'java', 'kt', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp',
  'cs', 'php', 'ex', 'exs', 'scala', 'sh', 'bash', 'zsh',
  'vue', 'svelte', 'astro', 'sql', 'graphql', 'gql', 'proto',
])

export const MAX_FILE_BYTES = 512 * 1024

export interface ScanOptions {
  /** Extra path prefixes to drop, e.g. "Future landing page/". */
  exclude?: string[]
}

export function isIgnored(path: string, exclude: string[] = []): boolean {
  if (NESTED_CHECKOUT.some((re) => re.test(path))) return true
  for (const prefix of exclude) {
    const p = prefix.replace(/\/+$/, '')
    if (path === p || path.startsWith(p + '/')) return true
  }
  const segments = path.split('/')
  const file = segments[segments.length - 1] ?? ''
  if (IGNORED_FILES.has(file)) return true
  if (file.startsWith('.env')) return true
  if (segments.slice(0, -1).some((s) => IGNORED_DIRS.has(s))) return true
  if (!isSource(path)) return true
  return false
}

export function isSource(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return false
  return SOURCE_EXT.has(path.slice(dot + 1).toLowerCase())
}

/** A NUL byte in the first 8KB means we were handed a binary, whatever the extension claims. */
function isBinary(text: string): boolean {
  const n = Math.min(text.length, 8192)
  for (let i = 0; i < n; i++) if (text.charCodeAt(i) === 0) return true
  return false
}

export function areaOf(path: string): string {
  const i = path.indexOf('/')
  return i < 0 ? 'root' : path.slice(0, i)
}

export function scan(files: VirtualFile[], opts: ScanOptions = {}): FileRecord[] {
  const out: FileRecord[] = []
  for (const f of files) {
    const path = f.path.replace(/^\.?\//, '').replace(/\\/g, '/')
    if (!path || isIgnored(path, opts.exclude)) continue
    const bytes = f.text.length
    if (bytes > MAX_FILE_BYTES || isBinary(f.text)) continue

    const slash = path.lastIndexOf('/')
    const name = path.slice(slash + 1)
    const dot = name.lastIndexOf('.')
    const symbols = outline(f.text)
    out.push({
      path,
      dir: slash < 0 ? '' : path.slice(0, slash),
      name,
      ext: dot < 0 ? '' : name.slice(dot + 1).toLowerCase(),
      area: areaOf(path),
      lines: countLines(f.text),
      bytes,
      excerpt: excerptOf(f.text),
      imports: extractImports(path, f.text),
      ...(symbols.length ? { symbols } : {}),
    })
  }
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return out
}

function countLines(text: string): number {
  if (text.length === 0) return 0
  let n = 1
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++
  return text.endsWith('\n') ? n - 1 : n
}

/** First 10 non-blank lines — matches the SOURCE EXCERPT / LINE 1 block in the reference. */
export function excerptOf(text: string, limit = 10): string[] {
  const out: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\t/g, '  ').trimEnd()
    if (!line.trim()) continue
    out.push(line.length > 96 ? line.slice(0, 95) + '…' : line)
    if (out.length >= limit) break
  }
  return out
}
