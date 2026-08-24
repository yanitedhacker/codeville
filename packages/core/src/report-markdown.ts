import type { Atlas, AtlasCoverage, AtlasLink, AtlasNode, SourceEvidence } from './types.js'

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function cell(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|')
    .replace(/[\[\]()]/g, '\\$&')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
}

function evidenceLocation(evidence: SourceEvidence): string {
  return `${String(evidence.path)}:${evidence.startLine}-${evidence.endLine}`
}

function evidenceText(link: AtlasLink): string {
  if (!link.evidence || link.evidence.length === 0) return 'none'
  return [...link.evidence]
    .sort((a, b) => compare(a.path, b.path) || a.startLine - b.startLine || a.endLine - b.endLine || compare(a.specifier, b.specifier) || compare(a.extractor, b.extractor))
    .map(evidenceLocation)
    .join(', ')
}

function table(headers: string[], rows: string[][]): string[] {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.join(' | ')} |`),
  ]
}

export function renderAtlasMarkdown(atlas: Atlas): string {
  const legacy = atlas as Atlas & { coverage?: AtlasCoverage }
  const coverage = legacy.coverage
  const lines: string[] = []

  lines.push(`# ${cell(atlas.repo.name)} — Codeville Atlas`, '', '## Snapshot metadata', '')
  if (atlas.repo.ref !== undefined) lines.push(`- Ref: ${cell(atlas.repo.ref)}`)
  lines.push(`- Generated: ${cell(atlas.repo.generatedAt)}`, `- Note: ${cell(atlas.repo.note)}`, '')

  lines.push('## Scope and coverage', '')
  const scopeRows = [
    ['Nodes', atlas.stats.nodes], ['Source files', atlas.stats.sourceFiles], ['Lines', atlas.stats.lines],
    ['Links', atlas.stats.links], ['Packages', atlas.stats.packages],
  ]
  if (coverage) {
    scopeRows.push(
      ['Exact files', coverage.exactFiles], ['Heuristic files', coverage.heuristicFiles], ['Unsupported files', coverage.unsupportedFiles],
      ['Failed files', coverage.failedFiles], ['Import facts', coverage.importFacts], ['Internal facts', coverage.internalFacts],
      ['External facts', coverage.externalFacts], ['System facts', coverage.systemFacts], ['Unresolved facts', coverage.unresolvedFacts],
      ['Ignored facts', coverage.ignoredFacts], ['Rolled-up files', coverage.rolledUpFiles], ['Hidden externals', coverage.hiddenExternals],
    )
  } else scopeRows.push(['Coverage', 'unavailable'])
  lines.push(...table(['Metric', 'Value'], scopeRows.map(([name, value]) => [cell(name), cell(value)])), '')

  lines.push('## Areas', '')
  lines.push(...table(['Area', 'Visible nodes'], atlas.areas.map(area => [cell(area.label), cell(area.count)])), '')

  const nodes = [...atlas.nodes].sort((a, b) => compare(a.path, b.path) || compare(a.id, b.id))
  lines.push('## Visible nodes', '')
  lines.push(...table(['Path', 'Kind', 'Role', 'Area', 'Lines', 'Fan-in', 'Fan-out', 'Items'], nodes.map((node: AtlasNode) => [
    cell(node.path), cell(node.kind), cell(node.role), cell(node.area), cell(node.lines), cell(node.in), cell(node.out), cell(node.items),
  ])), '')

  const nodePaths = new Map(atlas.nodes.map(node => [node.id, node.path]))
  const links = atlas.links.filter(link => link.type !== 'containment').map(link => ({
    link,
    from: nodePaths.get(link.from) ?? link.from,
    to: nodePaths.get(link.to) ?? link.to,
  })).sort((a, b) => {
    const aFields = [a.from, a.to, a.link.type, a.link.confidence ?? 'unknown', String(a.link.observations ?? 'unknown'), evidenceText(a.link)]
    const bFields = [b.from, b.to, b.link.type, b.link.confidence ?? 'unknown', String(b.link.observations ?? 'unknown'), evidenceText(b.link)]
    for (let index = 0; index < aFields.length; index += 1) {
      const result = compare(aFields[index] ?? '', bFields[index] ?? '')
      if (result !== 0) return result
    }
    return 0
  })
  lines.push('## Visible dependency links', '')
  lines.push(...table(['From', 'To', 'Type', 'Confidence', 'Observations', 'Evidence locations'], links.map(({ link, from, to }: { link: AtlasLink; from: string; to: string }) => {
    const evidence = evidenceText(link)
    return [cell(from), cell(to), cell(link.type), cell(link.confidence ?? 'unknown'), cell(link.observations ?? 'unknown'), cell(evidence)]
  })), '')

  lines.push('## Generated report', '', 'This is a generated visible slice; rolled-up, hidden, unsupported, failed, and unresolved facts may not appear as individual nodes or links. Edit the repository and regenerate rather than editing this report.')
  return `${lines.join('\n').replace(/\n+$/, '')}\n`
}
