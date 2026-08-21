#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAtlas, sourceDigest, type Atlas, type VirtualFile } from '../../core/src/index.js'
import { applyExplanations, toRequests, type Explanation } from '../../core/src/explain/index.js'
import { heuristic } from '../../core/src/explain/heuristic.js'
import { resolveExplainer } from '../../core/src/explain/adapters.js'
import { renderStandaloneHtml } from '../../atlas-ui/src/standalone-html.js'
import { readRepo } from './readdir.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE_DIR = resolve(HERE, '../../../apps/web/public/standalone')

interface Args {
  root: string
  out: string
  explain: string
  maxNodes?: number
  exclude: string[]
  noCache: boolean
  concurrency?: number
}

const USAGE = `codeville <path-to-repo> [options]

  -o, --out <file>       output path (.html or .json)   default: <name>-atlas.html
  -e, --explain <spec>   heuristic | codex | claude | openai | anthropic
                         | cli:<command> | module:<path>   default: heuristic
      --max-nodes <n>    visible node budget before rollup   default: 220
      --exclude <paths>  comma-separated path prefixes to drop
      --no-cache         ignore the explanation cache in ~/.cache/codeville
  -j, --concurrency <n>  parallel explainer calls   default: 4 (cli) / 6 (api)
`

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv)
  if (!args) {
    process.stdout.write(USAGE)
    process.exit(argv.length ? 1 : 0)
  }

  const t0 = Date.now()
  const { files, skipped } = await readRepo(args.root)
  if (files.length === 0) throw new Error(`No source files found under ${args.root}`)
  log(`read ${files.length} files${skipped ? ` (${skipped} over the size cap)` : ''}`)

  let atlas = buildAtlas(files, {
    exclude: args.exclude,
    ...(args.maxNodes !== undefined ? { maxNodes: args.maxNodes } : {}),
  })
  log(`atlas: ${atlas.stats.nodes} nodes · ${atlas.stats.links} links · ${atlas.stats.packages} packages`)

  atlas = await explain(atlas, args, files)

  if (args.out.endsWith('.json')) {
    await write(args.out, JSON.stringify(atlas, null, 2))
  } else {
    const [js, css] = await Promise.all([
      readFile(resolve(BUNDLE_DIR, 'codeville.js'), 'utf8').catch(() => {
        throw new Error('Export bundle missing. Run: pnpm -F @codeville/atlas-ui build')
      }),
      readFile(resolve(BUNDLE_DIR, 'codeville.css'), 'utf8').catch(() => ''),
    ])
    await write(args.out, renderStandaloneHtml(atlas, js, css))
  }

  log(`wrote ${args.out} in ${Date.now() - t0}ms`)
}

async function explain(atlas: Atlas, args: Args, files: VirtualFile[]): Promise<Atlas> {
  const text = new Map(files.map((f) => [f.path, f.text]))
  const requests = toRequests(atlas, {
    sourceOf: (path) => {
      const body = text.get(path)
      return body ? sourceDigest(body) : undefined
    },
  })
  const cachePath = cacheFor(args.root)
  const cache = args.noCache ? new Map<string, Explanation>() : await readCache(cachePath)

  // Resolve first: the explainer's fingerprint is part of every cache key, so a
  // changed prompt invalidates old answers instead of silently reusing them.
  const explainer =
    args.explain === 'heuristic'
      ? heuristic
      : await resolveExplainer(args.explain, {
          ...(args.concurrency !== undefined ? { concurrency: args.concurrency } : {}),
          onProgress: progress,
        })

  const byId = new Map(requests.map((r) => [r.id, r]))
  const keyOf = (id: string): string => {
    const node = byId.get(id)
    if (!node) throw new Error(`no explain request for ${id}`)
    // Key on exactly what the model sees, plus which prompt produced it.
    const parts = [args.explain, explainer.fingerprint ?? '', node.path, node.source ?? node.excerpt.join('\n')]
    return createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32)
  }

  const pending = requests.filter((r) => !cache.has(keyOf(r.id)))

  const reused = requests.length - pending.length
  if (pending.length) {
    // Report hits for THIS explainer, not the whole cache file, which also holds
    // entries keyed to other adapters and older prompts.
    log(`explaining ${pending.length} nodes via ${explainer.id}${reused ? ` (${reused} reused)` : ''}`)
    const fresh = await explainer.explain(pending)
    if (process.stderr.isTTY) process.stderr.write('\n')
    for (const [id, value] of fresh) cache.set(keyOf(id), value)
  }

  const resolved = new Map<string, Explanation>()
  for (const r of requests) {
    const hit = cache.get(keyOf(r.id))
    if (hit) resolved.set(r.id, hit)
  }

  // Anything the adapter skipped still gets the free, deterministic description.
  if (explainer.id !== 'heuristic') {
    const missing = requests.filter((r) => !resolved.has(r.id))
    if (missing.length) {
      log(`${missing.length} nodes fell back to heuristic prose`)
      for (const [id, value] of await heuristic.explain(missing)) resolved.set(id, value)
    }
  }

  if (!args.noCache && explainer.id !== 'heuristic') {
    await mkdir(dirname(cachePath), { recursive: true })
    await writeFile(cachePath, JSON.stringify(Object.fromEntries(cache), null, 2))
  }

  return applyExplanations(atlas, resolved)
}

/** Never write into the repo being analysed — the cache lives in the user's cache dir. */
function cacheFor(root: string): string {
  const base = process.env.XDG_CACHE_HOME || resolve(homedir(), '.cache')
  const key = createHash('sha256').update(root).digest('hex').slice(0, 16)
  return resolve(base, 'codeville', `${key}.json`)
}

async function readCache(path: string): Promise<Map<string, Explanation>> {
  try {
    return new Map(Object.entries(JSON.parse(await readFile(path, 'utf8')) as Record<string, Explanation>))
  } catch {
    return new Map()
  }
}

function parseArgs(argv: string[]): Args | null {
  let root: string | null = null
  let out: string | null = null
  let explainSpec = 'heuristic'
  let maxNodes: number | undefined
  let exclude: string[] = []
  let noCache = false
  let concurrency: number | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    const next = (): string => {
      const value = argv[++i]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      return value
    }
    if (arg === '-h' || arg === '--help') return null
    else if (arg === '-o' || arg === '--out') out = next()
    else if (arg === '-e' || arg === '--explain') explainSpec = next()
    else if (arg === '--max-nodes') maxNodes = Number(next())
    else if (arg === '--exclude') exclude = next().split(',').map((s) => s.trim()).filter(Boolean)
    else if (arg === '--no-cache') noCache = true
    else if (arg === '-j' || arg === '--concurrency') concurrency = Number(next())
    else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}`)
    else root = arg
  }

  if (!root) return null
  const abs = resolve(process.cwd(), root)
  return {
    root: abs,
    out: resolve(process.cwd(), out ?? `${abs.split('/').pop() ?? 'repo'}-atlas.html`.toLowerCase()),
    explain: explainSpec,
    ...(maxNodes !== undefined ? { maxNodes } : {}),
    exclude,
    noCache,
    ...(concurrency !== undefined && Number.isFinite(concurrency) ? { concurrency } : {}),
  }
}

async function write(path: string, body: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body, 'utf8')
}

const log = (message: string): void => {
  process.stderr.write(`codeville: ${message}\n`)
}

/** One rewritten line on a TTY, one line per decile otherwise, so CI logs stay sane. */
function progress(done: number, total: number, failed: number): void {
  const note = failed ? ` · ${failed} fell back` : ''
  if (process.stderr.isTTY) {
    process.stderr.write(`\rcodeville: explained ${done}/${total}${note}   `)
  } else if (done === total || done % Math.max(1, Math.floor(total / 10)) === 0) {
    log(`explained ${done}/${total}${note}`)
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  process.stderr.write(`codeville: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
