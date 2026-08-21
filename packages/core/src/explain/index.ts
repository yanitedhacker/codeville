import type { Atlas, AtlasNode } from '../types.js'

export interface ExplainRequest {
  id: string
  path: string
  kind: AtlasNode['kind']
  role: string
  area: string
  lines: number
  in: number
  out: number
  excerpt: string[]
  /** Head of the file plus the names it declares, when the caller has the text. */
  source?: string
  /** Paths that import this node, capped for prompt size. */
  importedBy: string[]
  /** Paths this node imports, capped for prompt size. */
  imports: string[]
}

export interface Explanation {
  summary: string
}

export interface Explainer {
  id: string
  /**
   * Changes whenever the prompt does. Callers fold it into their cache key, so
   * editing the prompt invalidates old answers instead of silently reusing them.
   */
  fingerprint?: string
  explain(batch: ExplainRequest[]): Promise<Map<string, Explanation>>
}

export interface ToRequestOptions {
  /** Neighbour paths to include per direction. */
  limit?: number
  /** Raw file text by path. Only the CLI has this; the browser passes nothing. */
  sourceOf?: (path: string) => string | undefined
}

/** Everything the panel needs about a node's neighbourhood, in one pass. */
export function toRequests(atlas: Atlas, opts: ToRequestOptions = {}): ExplainRequest[] {
  const limit = opts.limit ?? 12
  const importedBy = new Map<string, string[]>()
  const imports = new Map<string, string[]>()
  const pathOf = new Map(atlas.nodes.map((n) => [n.id, n.path]))

  for (const link of atlas.links) {
    if (link.type === 'containment') continue
    push(imports, link.from, pathOf.get(link.to), limit)
    push(importedBy, link.to, pathOf.get(link.from), limit)
  }

  return atlas.nodes.map((n) => {
    const source = n.kind === 'file' ? opts.sourceOf?.(n.path) : undefined
    return {
      id: n.id,
      path: n.path,
      kind: n.kind,
      role: n.role,
      area: n.area,
      lines: n.lines,
      in: n.in,
      out: n.out,
      excerpt: n.excerpt,
      ...(source ? { source } : {}),
      importedBy: importedBy.get(n.id) ?? [],
      imports: imports.get(n.id) ?? [],
    }
  })
}

function push(map: Map<string, string[]>, key: string, value: string | undefined, limit: number): void {
  if (!value) return
  const list = map.get(key)
  if (!list) map.set(key, [value])
  else if (list.length < limit) list.push(value)
}

export function applyExplanations(atlas: Atlas, explanations: Map<string, Explanation>): Atlas {
  return {
    ...atlas,
    nodes: atlas.nodes.map((n) => {
      const found = explanations.get(n.id)
      return found ? { ...n, summary: found.summary } : n
    }),
  }
}
