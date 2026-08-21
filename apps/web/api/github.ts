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

const SOURCE_EXT = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts',
  'py', 'pyi', 'go', 'rs', 'rb', 'java', 'kt', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp',
  'cs', 'php', 'ex', 'exs', 'scala', 'sh', 'bash', 'zsh',
  'vue', 'svelte', 'astro', 'sql', 'graphql', 'gql', 'proto',
])

const PRUNE = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|target|vendor|venv|\.venv|__pycache__|\.playwright-mcp|\.claude\/worktrees)\//

const KEEP_CONFIG = /^[^/]*\/(tsconfig(\.\w+)?\.json|jsconfig\.json|package\.json)$/

export interface GithubResult {
  repo: string
  ref: string
  files: { path: string; text: string }[]
  truncated: boolean
}

export function parseRepoInput(input: string): { owner: string; name: string; ref?: string } | null {
  const trimmed = input.trim().replace(/\.git$/, '')
  const withoutHost = trimmed.replace(/^(https?:\/\/)?(www\.)?github\.com\//, '')
  const parts = withoutHost.split('/').filter(Boolean)
  const [owner, name, kind, ...rest] = parts
  if (!owner || !name) return null
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(name)) return null
  const ref = (kind === 'tree' || kind === 'commit') && rest.length ? rest.join('/') : undefined
  return ref ? { owner, name, ref } : { owner, name }
}

export async function fetchRepo(input: string, refHint?: string): Promise<GithubResult> {
  const parsed = parseRepoInput(input)
  if (!parsed) throw new HttpError(400, `Not a GitHub repository: "${input}"`)

  const refs = refHint ? [refHint] : parsed.ref ? [parsed.ref] : ['HEAD', 'main', 'master']
  let lastStatus = 404

  for (const ref of refs) {
    const url = `https://codeload.github.com/${parsed.owner}/${parsed.name}/tar.gz/${ref}`
    const res = await fetch(url, { headers: { 'user-agent': 'codeville' } })
    if (!res.ok) {
      lastStatus = res.status
      continue
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

function extract(archive: Buffer, repo: string, ref: string): GithubResult {
  const files: { path: string; text: string }[] = []
  let total = 0
  let truncated = false

  untar(gunzipSync(archive), (entry) => {
    if (files.length >= MAX_FILES || total >= MAX_TOTAL_BYTES) {
      truncated = true
      return
    }
    // codeload prefixes every path with "<repo>-<sha>/"; strip it back to repo-relative.
    const slash = entry.name.indexOf('/')
    if (slash < 0) return
    const rel = entry.name.slice(slash + 1)
    if (!rel || PRUNE.test(rel) || entry.size > MAX_FILE_BYTES) return

    const dot = rel.lastIndexOf('.')
    const ext = dot < 0 ? '' : rel.slice(dot + 1).toLowerCase()
    if (!SOURCE_EXT.has(ext) && !KEEP_CONFIG.test(entry.name)) return

    files.push({ path: rel, text: entry.data.toString('utf8') })
    total += entry.size
  })

  return { repo, ref, files, truncated }
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
