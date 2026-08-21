import type { AtlasLink, AtlasNode } from '../types.js'
import type { ExplainRequest, Explainer, Explanation } from './index.js'

/**
 * Default explainer. Reads only the graph, so it is free, offline, deterministic,
 * and always available — an AI adapter replaces this prose, never the fields.
 */
export const heuristic: Explainer = {
  id: 'heuristic',
  async explain(batch) {
    const out = new Map<string, Explanation>()
    for (const node of batch) out.set(node.id, { summary: describe(node) })
    return out
  },
}

/** Frozen names only. Unknown packages stay "external package {name}". */
const PACKAGE_GLOSSARY: Readonly<Record<string, string>> = Object.freeze({
  pg: 'Postgres',
  postgres: 'Postgres',
  jose: 'JWT',
  react: 'React',
  hono: 'HTTP framework',
  axios: 'HTTP client',
  undici: 'HTTP client',
  'node-fetch': 'HTTP client',
  'node:fs': 'filesystem',
  fs: 'filesystem',
})

const PACKAGE_TAGS: Readonly<Record<string, 'db' | 'network' | 'filesystem'>> = Object.freeze({
  pg: 'db',
  postgres: 'db',
  hono: 'network',
  axios: 'network',
  undici: 'network',
  'node-fetch': 'network',
  'node:fs': 'filesystem',
  fs: 'filesystem',
})

/** Three or more importers in this slice counts as foundation. */
const HIGH_IN = 3
const SET_NODE_CAP = 8
const SET_EDGE_CAP = 12
const SET_SAMPLE_CAP = 6

function describe(node: ExplainRequest): string {
  if (node.kind === 'external') {
    return node.in === 0
      ? `A package that nothing in this slice imports.`
      : `A third-party package, pulled in by ${count(node.in, 'file')} in this slice.`
  }

  if (node.kind === 'dir') {
    const consumers = areasOf(node.importedBy)
    const reach = consumers.length ? ` Work here is consumed by ${humanList(consumers)}.` : ''
    return `A group of ${count(node.lines, 'line')} filed under ${node.area}. Dominant role: ${node.role}.${reach}`
  }

  const size =
    node.lines > 1200 ? 'One of the largest files here' : node.lines > 400 ? 'A substantial file' : 'A small file'

  const pull =
    node.in === 0
      ? 'Nothing in this slice imports it, so it is either an entry point or unreferenced.'
      : `${count(node.in, 'other file')} import${node.in === 1 ? 's' : ''} it${
          areasOf(node.importedBy).length ? `, across ${humanList(areasOf(node.importedBy))}` : ''
        }.`

  const push = node.out === 0 ? 'It imports nothing, so it sits at the bottom of the graph.' : `It reaches for ${count(node.out, 'module')}.`

  const lead = graphRoleLead(node)
  const body = `${size}, ${count(node.lines, 'line')}. Role: ${node.role}. ${pull} ${push}`
  return `${lead ? `${lead} ` : ''}${body}${sideEffectClause(node.imports)}`
}

function graphRoleLead(node: { in: number; out: number }): string | null {
  if (node.in === 0) return 'Entry or unreferenced.'
  if (node.in >= HIGH_IN) return 'Foundation: many files depend on it.'
  if (node.out === 0) return 'Leaf in this slice.'
  return null
}

function graphRolePhrase(node: { in: number; out: number }): string | null {
  if (node.in === 0) return 'entry or unreferenced'
  if (node.in >= HIGH_IN) return 'foundation (many files depend on it)'
  if (node.out === 0) return 'leaf in this slice'
  return null
}

/** One-line city graph-role for CLI ask. Always a sentence. */
export function graphRoleLine(node: { in: number; out: number }): string {
  return graphRoleLead(node) ?? 'A connector in this slice.'
}

export function describeLink(link: AtlasLink, from: AtlasNode, to: AtlasNode): string {
  if (link.type === 'containment') {
    return `${from.path} contains ${to.path}. This is containment, not a runtime import.`
  }
  if (link.type === 'external') {
    const name = to.path
    const gloss = PACKAGE_GLOSSARY[name]
    const head = `${from.path} pulls package ${name}.`
    return gloss ? `${head} ${gloss}.` : `${head} It is an external package ${name}.`
  }
  const head = `${from.path} imports ${to.path}.`
  const samples = link.samples.filter((s) => s.length > 0)
  if (samples.length === 0) return head
  const quoted = samples.map((s) => `\`${s}\``).join('; ')
  return samples.length === 1 ? `${head} The statement is ${quoted}.` : `${head} The statements are ${quoted}.`
}

export function describeSet(nodes: readonly AtlasNode[], links: readonly AtlasLink[]): string {
  if (nodes.length === 0) return 'No blocks selected.'

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const ids = new Set(byId.keys())
  const sorted = [...nodes].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const shownNodes = sorted.slice(0, SET_NODE_CAP)
  const extraNodes = sorted.length - shownNodes.length

  const bits = shownNodes.map((n) => {
    const role = graphRolePhrase(n)
    return role ? `${n.path} (${n.role}, ${role})` : `${n.path} (${n.role})`
  })
  let text = `${count(sorted.length, 'block')}: ${bits.join('; ')}`
  if (extraNodes > 0) text += `; and ${extraNodes.toLocaleString('en-US')} more`
  text += '.'

  const induced = links
    .filter((l) => l.type !== 'containment' && ids.has(l.from) && ids.has(l.to))
    .sort(cmpLink)

  if (induced.length === 0) {
    return `${text} They share no import or external arc in this slice.${sideEffectsFrom(induced, byId)}`
  }

  const shownEdges = induced.slice(0, SET_EDGE_CAP)
  const extraEdges = induced.length - shownEdges.length
  let samplesLeft = SET_SAMPLE_CAP
  const sentences: string[] = []
  for (const edge of shownEdges) {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (!from || !to) continue
    const take = Math.min(samplesLeft, edge.samples.length)
    samplesLeft -= take
    sentences.push(describeLink({ ...edge, samples: edge.samples.slice(0, take) }, from, to))
  }
  text += ` ${sentences.join(' ')}`
  if (extraEdges > 0) text += ` and ${extraEdges.toLocaleString('en-US')} more.`
  return `${text}${sideEffectsFrom(induced, byId)}`
}

function cmpLink(a: AtlasLink, b: AtlasLink): number {
  return a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : a.type < b.type ? -1 : a.type > b.type ? 1 : 0
}

function sideEffectClause(names: readonly string[]): string {
  const tags = new Set<string>()
  for (const name of names) {
    const tag = PACKAGE_TAGS[name]
    if (tag) tags.add(tag)
  }
  if (tags.size === 0) return ''
  return ` Side effects: ${[...tags].sort().join(', ')}.`
}

function sideEffectsFrom(induced: readonly AtlasLink[], byId: Map<string, AtlasNode>): string {
  const names: string[] = []
  for (const link of induced) {
    if (link.type !== 'external') continue
    const to = byId.get(link.to)
    if (to) names.push(to.path)
  }
  return sideEffectClause(names)
}

function areasOf(paths: string[]): string[] {
  const areas = new Set<string>()
  for (const p of paths) areas.add(p.includes('/') ? (p.split('/')[0] as string) : 'root')
  return [...areas].sort().slice(0, 4)
}

function humanList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0] as string
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

const count = (n: number, noun: string): string => `${n.toLocaleString('en-US')} ${noun}${n === 1 ? '' : 's'}`
