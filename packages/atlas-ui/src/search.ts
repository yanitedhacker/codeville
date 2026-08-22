import type { AtlasNode } from '@codeville/core'

export function searchNodes(nodes: AtlasNode[], query: string, limit = 50): AtlasNode[] {
  return rankedMatches(nodes, query).slice(0, limit)
}

export function searchMatchCount(nodes: AtlasNode[], query: string): number {
  return rankedMatches(nodes, query).length
}

function rankedMatches(nodes: AtlasNode[], query: string): AtlasNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const scored: { node: AtlasNode; score: number }[] = []
  for (const node of nodes) {
    const score = scoreNode(node, q)
    if (score != null) scored.push({ node, score })
  }
  scored.sort((a, b) => a.score - b.score || (a.node.path < b.node.path ? -1 : a.node.path > b.node.path ? 1 : 0))
  return scored.map((row) => row.node)
}

function scoreNode(node: AtlasNode, q: string): number | null {
  const label = node.label.toLowerCase()
  const path = node.path.toLowerCase()
  const role = node.role.toLowerCase()
  if (label === q) return 0
  if (isLabelPrefix(label, q)) return 1
  if (path.split('/').some((segment) => segment.startsWith(q))) return 2
  if (path.includes(q)) return 3
  if (role.includes(q)) return 4
  if ((node.symbols ?? []).some((symbol) => symbol.toLowerCase().includes(q))) return 5
  return null
}

/** "login.tsx" vs "login" is a path-segment hit, not a stronger label-prefix rank. */
function isLabelPrefix(label: string, q: string): boolean {
  if (!label.startsWith(q) || label === q) return false
  return !/^\.[^./]+$/.test(label.slice(q.length))
}
