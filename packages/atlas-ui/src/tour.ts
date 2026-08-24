import type { Atlas, AtlasLink, AtlasNode } from '@codeville/core'
import { atlasLinkKey, focusProjectionKey, type AtlasFocus } from './focus.js'

export interface TourChapter extends AtlasFocus {
  kind: 'area' | 'hubs' | 'boundary' | 'all'
}

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0)

function validLinks(atlas: Atlas): AtlasLink[] {
  const nodeIds = new Set(atlas.nodes.map((node) => node.id))
  return atlas.links.filter((link) => nodeIds.has(link.from) && nodeIds.has(link.to))
}

function chapter(kind: TourChapter['kind'], id: string, title: string, note: string, nodeIds: Iterable<string>, linkKeys: Iterable<string>): TourChapter {
  return {
    kind,
    id,
    title,
    note,
    nodeIds: [...new Set(nodeIds)].sort(compare),
    linkKeys: [...new Set(linkKeys)].sort(compare),
  }
}

function linksFor(nodes: Set<string>, links: readonly AtlasLink[], includeContainment = false): string[] {
  return links
    .filter((link) => (includeContainment || link.type !== 'containment') && nodes.has(link.from) && nodes.has(link.to))
    .map(atlasLinkKey)
}

export function buildTour(atlas: Atlas): TourChapter[] {
  const nodes = new Map(atlas.nodes.map((node) => [node.id, node]))
  const links = validLinks(atlas)
  const chapters: TourChapter[] = []

  for (const area of atlas.areas) {
    const areaNodes = new Set(atlas.nodes.filter((node) => node.area === area.id).map((node) => node.id))
    if (!areaNodes.size) continue
    const areaLinks = links.filter((link) => link.type !== 'containment' && areaNodes.has(link.from) && areaNodes.has(link.to))
    chapters.push(chapter('area', `area:${area.id}`, area.label, `${areaNodes.size} nodes in the ${area.label} area of the visible slice.`, areaNodes, areaLinks.map(atlasLinkKey)))
  }

  const localHubs = atlas.nodes
    .filter((node) => node.kind !== 'external')
    .sort((left, right) => (right.in + right.out) - (left.in + left.out) || compare(left.path, right.path) || compare(left.id, right.id))
    .slice(0, 8)
  const hubNodes = new Set(localHubs.map((node) => node.id))
  const hubLinks = links.filter((link) => link.type !== 'containment' && (hubNodes.has(link.from) || hubNodes.has(link.to)))
  for (const link of hubLinks) {
    hubNodes.add(link.from)
    hubNodes.add(link.to)
  }
  if (localHubs.length) {
    chapters.push(chapter('hubs', 'hubs', 'Dependency hubs', 'Up to 8 local nodes ranked by visible fan-in plus fan-out.', hubNodes, hubLinks.map(atlasLinkKey)))
  }

  const externalIds = new Set(atlas.nodes.filter((node) => node.kind === 'external').map((node) => node.id))
  const boundaryLinks = links.filter((link) => link.type === 'external' && (externalIds.has(link.from) || externalIds.has(link.to)))
  if (externalIds.size && boundaryLinks.length) {
    const boundaryNodes = new Set<string>()
    for (const link of boundaryLinks) {
      boundaryNodes.add(link.from)
      boundaryNodes.add(link.to)
    }
    chapters.push(chapter('boundary', 'boundary', 'External boundary', 'External packages and the local nodes connected to them in the visible slice.', boundaryNodes, boundaryLinks.map(atlasLinkKey)))
  }

  const allNodes = new Set(nodes.keys())
  chapters.push(chapter('all', 'all', 'Whole visible system', 'Every node and link in the whole visible slice.', allNodes, linksFor(allNodes, links, true)))

  const deduped: TourChapter[] = []
  for (const current of chapters) {
    const previous = deduped.at(-1)
    if (previous && current.kind !== 'all' && focusProjectionKey(previous) === focusProjectionKey(current)) continue
    deduped.push(current)
  }
  return deduped
}
