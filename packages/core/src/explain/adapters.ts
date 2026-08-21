import type { ExplainRequest, Explainer, Explanation } from './index.js'

/**
 * Node-only adapters. They are loaded lazily so `@codeville/core` stays
 * importable in the browser, where none of this can run.
 */

const SYSTEM = [
  'You explain one file in a codebase at a time.',
  'Reply with at most two sentences, under 55 words total, saying what the file DOES',
  'for the running system. Be specific about mechanism, not generic.',
  'No preamble, no markdown, no bullet points, no restating the filename.',
].join(' ')

/** Bump whenever SYSTEM or prompt() changes so cached answers are not reused. */
const PROMPT_VERSION = 'p2'

function prompt(node: ExplainRequest): string {
  return [
    `Path: ${node.path}`,
    `Detected role: ${node.role}`,
    `Size: ${node.lines} lines`,
    node.imports.length ? `Imports: ${node.imports.join(', ')}` : null,
    node.importedBy.length ? `Imported by: ${node.importedBy.join(', ')}` : null,
    '',
    node.source ? 'Source:' : 'First lines:',
    node.source ?? node.excerpt.join('\n'),
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Shells out to a CLI you have already signed into (`codex exec`, `claude -p`).
 * Your subscription pays; codeville never sees or stores a credential.
 */
export interface AdapterOptions {
  concurrency?: number
  /** Called after each node resolves, so a long run is not a silent wait. */
  onProgress?: (done: number, total: number, failed: number) => void
  /** Kill a hung CLI child after this many ms. SIGTERM, then SIGKILL one second later. */
  timeoutMs?: number
}

export function cliExplainer(command: string, opts: AdapterOptions = {}): Explainer {
  const concurrency = opts.concurrency ?? 4
  const timeoutMs = opts.timeoutMs ?? 120_000
  return {
    id: `cli:${command}`,
    fingerprint: PROMPT_VERSION,
    async explain(batch) {
      const [bin, ...preArgs] = command.split(/\s+/) as [string, ...string[]]

      const out = new Map<string, Explanation>()
      let done = 0
      let failed = 0
      await pool(batch, concurrency, async (node) => {
        try {
          const stdout = await runCli(bin, [...preArgs, `${SYSTEM}\n\n${prompt(node)}`], timeoutMs)
          const summary = clean(stdout)
          if (summary) out.set(node.id, { summary })
          else failed++
        } catch {
          // A per-node failure must not sink the whole atlas; heuristics still cover it.
          failed++
        }
        opts.onProgress?.(++done, batch.length, failed)
      })
      return out
    },
  }
}

async function runCli(bin: string, args: string[], timeoutMs: number): Promise<string> {
  const { spawn } = await import('node:child_process')
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'] })
    let stdout = ''
    child.stdout?.on('data', (buf: Buffer) => {
      stdout += buf.toString()
      if (stdout.length > 4 * 1024 * 1024) {
        stdout = stdout.slice(0, 4 * 1024 * 1024)
        child.kill('SIGKILL')
      }
    })
    let timedOut = false
    let settled = false
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), 1000)
    }, timeoutMs)
    const done = (err?: Error, value?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (killTimer !== undefined) clearTimeout(killTimer)
      if (err) reject(err)
      else resolve(value ?? '')
    }
    child.on('error', (err) => done(err))
    child.on('close', (code) => {
      if (timedOut) done(new Error('timeout'))
      else if (code === 0) done(undefined, stdout)
      else done(new Error(`exit ${code ?? 'null'}`))
    })
  })
}

export type ApiVendor = 'openai' | 'anthropic'

export function apiKeyExplainer(vendor: ApiVendor, model?: string, opts: AdapterOptions = {}): Explainer {
  const concurrency = opts.concurrency ?? 6
  const envVar = vendor === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
  return {
    id: `apikey:${vendor}`,
    fingerprint: PROMPT_VERSION,
    async explain(batch) {
      const key = process.env[envVar]
      if (!key) return new Map<string, Explanation>()

      const out = new Map<string, Explanation>()
      let done = 0
      let failed = 0
      let lastErr: string | null = null
      await pool(batch, concurrency, async (node) => {
        try {
          const summary = await callVendor(vendor, key, model, prompt(node))
          if (summary) out.set(node.id, { summary })
          else failed++
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err)
          failed++
        }
        opts.onProgress?.(++done, batch.length, failed)
      })
      if (batch.length > 0 && out.size === 0 && lastErr) throw new Error(lastErr)
      return out
    },
  }
}

async function callVendor(vendor: ApiVendor, key: string, model: string | undefined, text: string): Promise<string> {
  if (vendor === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: model ?? 'claude-sonnet-5',
        max_tokens: 200,
        system: SYSTEM,
        messages: [{ role: 'user', content: text }],
      }),
    })
    if (!res.ok) throw new Error(`anthropic ${res.status}`)
    const body = (await res.json()) as { content?: { text?: string }[] }
    return clean(body.content?.[0]?.text ?? '')
  }

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: model ?? 'gpt-5',
      instructions: SYSTEM,
      input: text,
      max_output_tokens: 300,
    }),
  })
  if (!res.ok) throw new Error(`openai ${res.status}`)
  const body = (await res.json()) as {
    output_text?: string
    output?: { content?: { text?: string }[] }[]
  }
  return clean(body.output_text ?? body.output?.[0]?.content?.[0]?.text ?? '')
}

/** `module:./my-explainer.js` — your file, your auth, our interface. */
export async function moduleExplainer(specifier: string): Promise<Explainer> {
  const { pathToFileURL } = await import('node:url')
  const { isAbsolute, resolve } = await import('node:path')
  const target = isAbsolute(specifier) ? specifier : resolve(process.cwd(), specifier)
  const mod = (await import(pathToFileURL(target).href)) as { default?: Explainer } & Partial<Explainer>
  const explainer = mod.default ?? (mod.explain ? (mod as Explainer) : null)
  if (!explainer?.explain) throw new Error(`${specifier} does not export an Explainer (needs .explain()).`)
  return explainer
}

export async function resolveExplainer(spec: string, opts: AdapterOptions = {}): Promise<Explainer> {
  if (spec === 'heuristic') return (await import('./heuristic.js')).heuristic
  if (spec.startsWith('module:')) return moduleExplainer(spec.slice(7))
  if (spec.startsWith('cli:')) return cliExplainer(spec.slice(4), opts)
  if (spec === 'codex') return cliExplainer('codex exec', opts)
  if (spec === 'claude') return cliExplainer('claude -p', opts)
  if (spec === 'openai' || spec === 'anthropic') return apiKeyExplainer(spec, undefined, opts)
  throw new Error(
    `Unknown explainer "${spec}". Use: heuristic | codex | claude | openai | anthropic | cli:<cmd> | module:<path>`,
  )
}

const MAX_SUMMARY = 700

/** Trim to a sentence boundary — a summary cut mid-word reads like a bug. */
export function clean(text: string): string {
  const flat = text
    .trim()
    .replace(/^```[\s\S]*?\n|\n```$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat.length <= MAX_SUMMARY) return flat
  const cut = flat.slice(0, MAX_SUMMARY)
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return stop > MAX_SUMMARY * 0.5 ? cut.slice(0, stop + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    for (;;) {
      const i = cursor++
      const item = items[i]
      if (item === undefined) return
      await work(item)
    }
  })
  await Promise.all(workers)
}
