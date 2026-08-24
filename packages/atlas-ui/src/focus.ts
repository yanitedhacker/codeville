import type { Atlas, AtlasLink, AtlasNode } from '@codeville/core'

export interface AtlasFocus {
  id: string
  title: string
  note: string
  nodeIds: string[]
  linkKeys: string[]
}

export type FocusDirection = 'dependencies' | 'dependents'

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export function atlasLinkKey(link: AtlasLink): string {
  return `${link.type}\0${link.from}\0${link.to}`
}

interface Edge {
  link: AtlasLink
  next: AtlasNode
}

interface Graph {
  nodes: Map<string, AtlasNode>
  outgoing: Map<string, Edge[]>
  incoming: Map<string, Edge[]>
}

function graphFor(atlas: Atlas): Graph {
  const nodes = new Map(atlas.nodes.map((node) => [node.id, node]))
  const outgoing = new Map<string, Edge[]>()
  const incoming = new Map<string, Edge[]>()
  for (const link of atlas.links) {
    if (link.type === 'containment') continue
    const from = nodes.get(link.from)
    const to = nodes.get(link.to)
    if (!from || !to) continue
    const edge = { link, next: to }
    const reverseEdge = { link, next: from }
    outgoing.set(link.from, [...(outgoing.get(link.from) ?? []), edge])
    incoming.set(link.to, [...(incoming.get(link.to) ?? []), reverseEdge])
  }
  const sortEdges = (left: Edge, right: Edge) =>
    compare(left.next.path, right.next.path) || compare(left.next.id, right.next.id) || compare(atlasLinkKey(left.link), atlasLinkKey(right.link))
  for (const edges of outgoing.values()) edges.sort(sortEdges)
  for (const edges of incoming.values()) edges.sort(sortEdges)
  return { nodes, outgoing, incoming }
}

function result(id: string, title: string, nodeIds: Iterable<string>, linkKeys: Iterable<string>): AtlasFocus {
  const nodes = [...nodeIds].sort(compare)
  const links = [...linkKeys].sort(compare)
  return {
    id,
    title,
    note: `${nodes.length} nodes in the visible slice.`,
    nodeIds: nodes,
    linkKeys: links,
  }
}

export function dependencyCone(atlas: Atlas, rootId: string, direction: FocusDirection): AtlasFocus {
  const graph = graphFor(atlas)
  const root = graph.nodes.get(rootId)
  const rootPath = root?.path ?? rootId
  const title = direction === 'dependencies' ? `Dependencies from ${rootPath}` : `Dependents of ${rootPath}`
  if (!root) return result(`cone:${direction}:${rootId}`, title, [], [])

  const queue = [rootId]
  const visited = new Set([rootId])
  const usedLinks = new Set<string>()
  const adjacency = direction === 'dependencies' ? graph.outgoing : graph.incoming
  while (queue.length) {
    const current = queue.shift()!
    for (const edge of adjacency.get(current) ?? []) {
      const nextId = edge.next.id
      usedLinks.add(atlasLinkKey(edge.link))
      if (visited.has(nextId)) continue
      visited.add(nextId)
      queue.push(nextId)
    }
  }
  return result(`cone:${direction}:${rootId}`, title, visited, usedLinks)
}

export function shortestDependencyPath(atlas: Atlas, fromId: string, toId: string): AtlasFocus | null {
  const graph = graphFor(atlas)
  const from = graph.nodes.get(fromId)
  const to = graph.nodes.get(toId)
  if (!from || !to || fromId === toId) return null

  const queue = [fromId]
  const visited = new Set([fromId])
  const previous = new Map<string, { nodeId: string; link: AtlasLink }>()
  while (queue.length) {
    const current = queue.shift()!
    for (const edge of graph.outgoing.get(current) ?? []) {
      const nextId = edge.next.id
      if (visited.has(nextId)) continue
      visited.add(nextId)
      previous.set(nextId, { nodeId: current, link: edge.link })
      if (nextId === toId) {
        const nodeIds = [toId]
        const linkKeys: string[] = []
        let cursor = toId
        while (cursor !== fromId) {
          const predecessor = previous.get(cursor)!
          nodeIds.push(predecessor.nodeId)
          linkKeys.push(atlasLinkKey(predecessor.link))
          cursor = predecessor.nodeId
        }
        return result(`path:${fromId}:${toId}`, `${from.path} → ${to.path}`, nodeIds, linkKeys)
      }
      queue.push(nextId)
    }
  }
  return null
}

export function focusProjectionKey(focus: Pick<AtlasFocus, 'nodeIds' | 'linkKeys'> | null): string {
  if (!focus) return ''
  return `${[...focus.nodeIds].sort(compare).join('\0')}\0${[...focus.linkKeys].sort(compare).join('\0')}`
}
