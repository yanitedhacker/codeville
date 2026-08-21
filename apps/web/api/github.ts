import { gunzipSync } from 'node:zlib'
import { untar } from './untar.js'

/**
 * The one server-side route. It exists because codeload.github.com serves no
 * CORS headers, so a browser cannot fetch a repo tarball on its own. Everything
 * else in codeville runs client-side.
 */

const MAX_FILES = 4000
const MAX_TOTAL_BYTES = 12 * 1024 * 1024
const MAX_FILE_BYTES = 512 * 1024
const MAX_ARCHIVE_BYTES = 90 * 1024 * 1024
/** Cap decompressed tar so a zip bomb cannot expand past this. 20MB of zeros must 413. */
const MAX_GUNZIP_BYTES = 16 * 1024 * 1024

const SOURCE_EXT = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts',
  'py', 'pyi', 'go', 'rs', 'rb', 'java', 'kt', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp',
  'cs', 'php', 'ex', 'exs', 'scala', 'sh', 'bash', 'zsh',
  'vue', 'svelte', 'astro', 'sql', 'graphql', 'gql', 'proto',
])

const PRUNE = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|target|vendor|venv|\.venv|__pycache__|\.playwright-mcp|\.claude\/worktrees)\//

const KEEP_TSCONFIG = /^(tsconfig(\.\w+)?\.json|jsconfig\.json)$/
const MAX_MANIFESTS = 200

export interface GithubResult {
  repo: string
  ref: string
  files: { path: string; text: string }[]
  truncated: boolean
}

function isRepoSegment(s: string): boolean {
  return s !== '.' && s !== '..' && /^[\w.-]+$/.test(s)
}

function isValidRef(ref: string): boolean {
  return /^[\w./-]+$/.test(ref) && !ref.split('/').some((s) => s === '.' || s === '..' || s === '')
}

export function parseRepoInput(input: string): { owner: string; name: string; ref?: string } | null {
  const trimmed = input.trim().replace(/\.git$/, '')
  const withoutHost = trimmed.replace(/^(https?:\/\/)?(www\.)?github\.com\//, '')
  const parts = withoutHost.split('/').filter(Boolean)
  const [owner, name, kind, ...rest] = parts
  if (!owner || !name) return null
  if (!isRepoSegment(owner) || !isRepoSegment(name)) return null
  const ref = (kind === 'tree' || kind === 'commit') && rest.length ? rest.join('/') : undefined
  if (ref !== undefined) {
    if (!isValidRef(ref)) return null
  }
  return ref ? { owner, name, ref } : { owner, name }
}

export function codeloadUrl(owner: string, name: string, ref: string): URL {
  const url = new URL(`https://codeload.github.com/${owner}/${name}/tar.gz/${ref}`)
  const prefix = `/${owner}/${name}/tar.gz/`
  if (url.hostname !== 'codeload.github.com' || !url.pathname.startsWith(prefix)) {
    throw new HttpError(400, `Invalid GitHub ref "${ref}"`)
  }
  return url
}

export async function fetchRepo(input: string, refHint?: string): Promise<GithubResult> {
  const parsed = parseRepoInput(input)
  if (!parsed) throw new HttpError(400, `Not a GitHub repository: "${input}"`)

  const refs = refHint ? [refHint] : parsed.ref ? [parsed.ref] : ['HEAD', 'main', 'master']
  let lastStatus = 404

  for (const ref of refs) {
    if (!isValidRef(ref)) throw new HttpError(400, `Invalid GitHub ref "${ref}"`)
    const url = codeloadUrl(parsed.owner, parsed.name, ref)
    const res = await fetch(url, { headers: { 'user-agent': 'codeville' } })
    if (!res.ok) {
      lastStatus = res.status
      continue
    }
    const announced = Number(res.headers.get('content-length'))
    if (Number.isFinite(announced) && announced > MAX_ARCHIVE_BYTES) {
      throw new HttpError(413, `${parsed.owner}/${parsed.name} is larger than codeville reads (90MB archive cap).`)
    }
    const archive = Buffer.from(await res.arrayBuffer())
    if (archive.byteLength > MAX_ARCHIVE_BYTES) {
      throw new HttpError(413, `${parsed.owner}/${parsed.name} is larger than codeville reads (90MB archive cap).`)
    }
    return extract(archive, `${parsed.owner}/${parsed.name}`, ref)
  }

  throw new HttpError(
    lastStatus === 404 ? 404 : 502,
    lastStatus === 404
      ? `Could not find ${parsed.owner}/${parsed.name} (or it is private).`
      : `GitHub returned ${lastStatus} for ${parsed.owner}/${parsed.name}.`,
  )
}

export function extract(archive: Buffer, repo: string, ref: string): GithubResult {
  const files: { path: string; text: string }[] = []
  let total = 0
  let truncated = false

  untar(gunzipArchive(archive), (entry) => {
    // codeload prefixes every path with "<repo>-<sha>/"; strip it back to repo-relative.
    const slash = entry.name.indexOf('/')
    if (slash < 0) return
    const rel = entry.name.slice(slash + 1)
    if (!rel || PRUNE.test(rel) || entry.size > MAX_FILE_BYTES) return

    const dot = rel.lastIndexOf('.')
    const ext = dot < 0 ? '' : rel.slice(dot + 1).toLowerCase()
    const base = rel.slice(rel.lastIndexOf('/') + 1)
    const depth = rel.split('/').length
    const keepTs = KEEP_TSCONFIG.test(base) && depth <= 2
    const keepPkg = base === 'package.json' || base === 'go.mod' || base === 'Cargo.toml'
    if (!SOURCE_EXT.has(ext) && !keepTs && !keepPkg) return

    if (files.length >= MAX_FILES || total + entry.size > MAX_TOTAL_BYTES) {
      truncated = true
      return
    }

    files.push({ path: rel, text: entry.data.toString('utf8') })
    total += entry.size
  })

  return { repo, ref, files: capManifests(files, MAX_MANIFESTS), truncated }
}

function capByBasename<T extends { path: string }>(files: T[], basename: string, max: number): T[] {
  const is = (p: string): boolean => p === basename || p.endsWith('/' + basename)
  const pkgs = files.filter((f) => is(f.path)).sort((a, b) => (a.path < b.path ? -1 : 1))
  if (pkgs.length <= max) return files
  const keep = new Set(pkgs.slice(0, max).map((f) => f.path))
  return files.filter((f) => !is(f.path) || keep.has(f.path))
}

function capManifests<T extends { path: string }>(files: T[], max: number): T[] {
  return capByBasename(capByBasename(files, 'package.json', max), 'Cargo.toml', max)
}

export function gunzipArchive(archive: Buffer, maxOutputLength = MAX_GUNZIP_BYTES): Buffer {
  try {
    return gunzipSync(archive, { maxOutputLength })
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined
    if (code === 'ERR_BUFFER_TOO_LARGE') {
      throw new HttpError(413, 'Decompressed archive exceeds codeville\'s size cap.')
    }
    throw err
  }
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/** Node-style handler: works as Vite dev middleware and as a Vercel function unchanged. */
export default async function handler(
  req: { url?: string },
  res: {
    statusCode: number
    setHeader(k: string, v: string): void
    end(body?: string): void
  },
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const repo = url.searchParams.get('repo')
  res.setHeader('content-type', 'application/json; charset=utf-8')

  if (!repo) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'Pass ?repo=owner/name' }))
    return
  }

  try {
    const result = await fetchRepo(repo, url.searchParams.get('ref') ?? undefined)
    res.statusCode = 200
    res.end(JSON.stringify(result))
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500
    res.statusCode = status
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown failure' }))
  }
}
