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

  return `${size}, ${count(node.lines, 'line')}. Role: ${node.role}. ${pull} ${push}`
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
