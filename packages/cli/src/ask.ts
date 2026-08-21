import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAtlas, outline, sourceDigest, type Atlas, type AtlasNode } from '../../core/src/index.js'
import { toRequests } from '../../core/src/explain/index.js'
import { graphRoleLine } from '../../core/src/explain/heuristic.js'
import { ASK_FINGERPRINT, ASK_SYSTEM, askUserPrompt, heuristicAskLine, type AskPayload } from '../../core/src/explain/ask.js'
import { clean, cliBinArgs, runCli } from '../../core/src/explain/adapters.js'
import { renderStandaloneHtml } from '../../atlas-ui/src/standalone-html.js'
import { readRepo } from './readdir.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE_DIR = resolve(HERE, '../../../apps/web/public/standalone')
const ASK_TIMEOUT_MS = 120_000
const SAMPLE_CAP = 6

export interface AskArgs {
  command: 'ask'
  root: string
  node: string
  fn: string
  question: string
  explain: string
  atlas?: string
  out?: string
  exclude: string[]
  noCache: boolean
  maxNodes?: number
  concurrency?: number
}

export function resolveUnderRoot(root: string, nodePath: string): string {
  const posix = nodePath.replace(/\\/g, '/')
  if (!posix || posix.startsWith('/') || posix.split('/').includes('..')) {
    throw new Error(`node path escapes the repo: ${nodePath}`)
  }
  const rootAbs = resolve(root)
  const abs = resolve(rootAbs, posix)
  const rel = relative(rootAbs, abs)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`node path escapes the repo: ${nodePath}`)
  }
  return abs
}

export function ensureFnInOutline(source: string, fn: string, filePath: string): void {
  if (!outline(source).includes(fn)) {
    throw new Error(`${fn} is not in the outline of ${filePath}`)
  }
}

export async function runAsk(args: AskArgs): Promise<void> {
  const atlas = await loadAtlas(args)
  const node = findFileNode(atlas, args.node)
  const abs = resolveUnderRoot(args.root, node.path)
  const source = await readFile(abs, 'utf8').catch(() => {
    throw new Error(`cannot read ${node.path}`)
  })
  ensureFnInOutline(source, args.fn, node.path)

  const payload = toPayload(atlas, node, source, args.fn, args.question)
  const answer = await answerAsk(args, payload)

  process.stdout.write(`${answer}\n`)

  if (args.out) await writeAtlas(args.out, atlas)
}

function findFileNode(atlas: Atlas, spec: string): AtlasNode {
  const node = atlas.nodes.find((n) => n.kind === 'file' && (n.path === spec || n.id === spec))
  if (!node) throw new Error(`${spec} is not a file node in the atlas`)
  return node
}

async function loadAtlas(args: AskArgs): Promise<Atlas> {
  if (args.atlas) {
    const raw = await readFile(args.atlas, 'utf8')
    let atlas: Atlas
    try {
      atlas = JSON.parse(raw) as Atlas
    } catch {
      throw new Error(`${args.atlas} is not JSON (pass an atlas.json from generate)`)
    }
    if (!Array.isArray(atlas.nodes) || !Array.isArray(atlas.links)) {
      throw new Error(`${args.atlas} is not an atlas`)
    }
    return atlas
  }
  const { files, omittedWorkspaces, omittedCargo } = await readRepo(args.root)
  if (files.length === 0) throw new Error(`No source files found under ${args.root}`)
  return buildAtlas(files, {
    exclude: args.exclude,
    ...(args.maxNodes !== undefined ? { maxNodes: args.maxNodes } : {}),
    omitted: {
      ...(omittedWorkspaces ? { npm: omittedWorkspaces } : {}),
      ...(omittedCargo ? { cargo: omittedCargo } : {}),
    },
  })
}

function toPayload(atlas: Atlas, node: AtlasNode, source: string, fn: string, question: string): AskPayload {
  const req = toRequests(atlas).find((r) => r.id === node.id)
  const samples: string[] = []
  for (const link of atlas.links) {
    if (link.type === 'containment') continue
    if (link.from !== node.id && link.to !== node.id) continue
    for (const s of link.samples) {
      if (samples.length >= SAMPLE_CAP) break
      if (!samples.includes(s)) samples.push(s)
    }
    if (samples.length >= SAMPLE_CAP) break
  }
  return {
    path: node.path,
    role: node.role,
    area: node.area,
    in: node.in,
    out: node.out,
    imports: req?.imports ?? [],
    importedBy: req?.importedBy ?? [],
    samples,
    sourceDigest: sourceDigest(source),
    fn,
    question,
    graphRole: graphRoleLine(node),
  }
}

async function answerAsk(args: AskArgs, payload: AskPayload): Promise<string> {
  const fallback = heuristicAskLine(payload)
  if (args.explain === 'heuristic') return fallback

  const key = askKey(args, payload)
  const cachePath = askCacheFor(args.root)
  const cache = args.noCache ? new Map<string, string>() : await readAskCache(cachePath)
  const hit = cache.get(key)
  if (hit) return hit

  const { bin, preArgs } = cliBinArgs(args.explain)
  let stdout: string
  try {
    stdout = await runCli(bin, [...preArgs, `${ASK_SYSTEM}\n\n${askUserPrompt(payload)}`], ASK_TIMEOUT_MS)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(detail === 'timeout' ? 'timeout' : detail)
  }

  const summary = clean(stdout)
  if (!summary) return fallback

  cache.set(key, summary)
  if (!args.noCache) {
    try {
      await mkdir(dirname(cachePath), { recursive: true })
      const tmp = `${cachePath}.tmp`
      await writeFile(tmp, JSON.stringify(Object.fromEntries(cache), null, 2))
      await rename(tmp, cachePath)
    } catch (err) {
      process.stderr.write(`codeville: cache write failed (${err instanceof Error ? err.message : String(err)})\n`)
    }
  }
  return summary
}

function askKey(args: AskArgs, payload: AskPayload): string {
  const parts = [ASK_FINGERPRINT, args.explain, payload.path, payload.fn, payload.question, payload.sourceDigest]
  return createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32)
}

function askCacheFor(root: string): string {
  const base = process.env.XDG_CACHE_HOME || resolve(homedir(), '.cache')
  const key = createHash('sha256').update(root).digest('hex').slice(0, 16)
  return resolve(base, 'codeville', `ask-${key}.json`)
}

async function readAskCache(path: string): Promise<Map<string, string>> {
  try {
    return new Map(Object.entries(JSON.parse(await readFile(path, 'utf8')) as Record<string, string>))
  } catch {
    return new Map()
  }
}

async function writeAtlas(out: string, atlas: Atlas): Promise<void> {
  await mkdir(dirname(out), { recursive: true })
  if (out.endsWith('.json')) {
    await writeFile(out, JSON.stringify(atlas, null, 2), 'utf8')
    return
  }
  const [js, css] = await Promise.all([
    readFile(resolve(BUNDLE_DIR, 'codeville.js'), 'utf8').catch(() => {
      throw new Error('Export bundle missing. Run: pnpm -F @codeville/atlas-ui build')
    }),
    readFile(resolve(BUNDLE_DIR, 'codeville.css'), 'utf8').catch(() => {
      throw new Error('Export bundle missing. Run: pnpm -F @codeville/atlas-ui build')
    }),
  ])
  await writeFile(out, renderStandaloneHtml(atlas, js, css), 'utf8')
}
