import { describe, expect, it } from 'vitest'
import type { Atlas } from './types.js'
import { renderAtlasMarkdown } from './report-markdown.js'

const atlas: Atlas = {
  repo: { name: 'demo <script>alert(1)</script>', ref: 'main|next', generatedAt: '2026-08-24T00:00:00.000Z', note: 'line one\nline | two' },
  stats: { nodes: 3, sourceFiles: 2, lines: 30, links: 3, packages: 1 },
  areas: [{ id: 'src', label: 'Source | code', color: '#000', count: 2 }, { id: 'deps', label: 'Dependencies', color: '#111', count: 1 }],
  nodes: [
    { id: 'b.ts', label: 'b.ts', path: 'b.ts', kind: 'file', area: 'src', role: 'service', contributes: [], lines: 20, bytes: 20, x: 0, y: 0, h: 1, excerpt: ['secret'], in: 1, out: 1, symbols: ['doNotPrint'], summary: 'do not print' },
    { id: 'ext:npm', label: 'npm', path: 'npm', kind: 'external', area: 'deps', role: 'dependency', contributes: [], lines: 0, bytes: 0, x: 1, y: 1, h: 1, excerpt: [], in: 1, out: 0 },
    { id: 'a.ts', label: 'a.ts', path: 'a.ts', kind: 'file', area: 'src', role: 'api\tendpoint', contributes: [], lines: 10, bytes: 10, x: 2, y: 2, h: 1, excerpt: ['password'], in: 0, out: 1 },
  ],
  links: [
    { from: 'a.ts', to: 'b.ts', type: 'containment', samples: ['do not print'] },
    { from: 'b.ts', to: 'ext:npm', type: 'external', samples: ['do not print'], confidence: 'heuristic', observations: 2, evidence: [
      { path: 'b|two.ts', startLine: 4, endLine: 5, specifier: 'npm', statement: 'do not print', extractor: 'line', confidence: 'heuristic' },
      { path: 'a.ts', startLine: 2, endLine: 2, specifier: 'npm', statement: 'do not print', extractor: 'babel', confidence: 'exact' },
    ] },
    { from: 'a.ts', to: 'b.ts', type: 'import', samples: ['do not print'], confidence: 'exact', observations: 1, evidence: [] },
  ],
  coverage: { exactFiles: 1, heuristicFiles: 1, unsupportedFiles: 0, failedFiles: 0, importFacts: 3, internalFacts: 1, externalFacts: 2, systemFacts: 0, unresolvedFacts: 0, ignoredFacts: 0, rolledUpFiles: 0, hiddenExternals: 0 },
}

describe('renderAtlasMarkdown', () => {
  it('renders sections in contract order and canonical node/link order', () => {
    const output = renderAtlasMarkdown(atlas)
    const sections = ['# ', '## Snapshot metadata', '## Scope and coverage', '## Areas', '## Visible nodes', '## Visible dependency links', '## Generated report']
    expect(sections.map(section => output.indexOf(section))).toEqual([...sections].sort((a, b) => output.indexOf(a) - output.indexOf(b)).map(section => output.indexOf(section)))
    expect(output.indexOf('| a.ts |')).toBeLessThan(output.indexOf('| b.ts |'))
    expect(output).not.toContain('containment')
    expect(output.endsWith('\n')).toBe(true)
    expect(output.endsWith('\n\n')).toBe(false)
  })

  it('escapes hostile values and excludes source text and summaries', () => {
    const output = renderAtlasMarkdown(atlas)
    expect(output).toContain('&lt;script&gt;')
    expect(output).toContain('main\\|next')
    expect(output).toContain('line one line \\| two')
    expect(output).toContain('api endpoint')
    for (const value of ['<script>', 'password', 'secret', 'doNotPrint', 'do not print']) expect(output).not.toContain(value)
  })

  it('renders canonical evidence locations and unknown optional values', () => {
    const output = renderAtlasMarkdown(atlas)
    expect(output).toContain('a.ts:2-2, b\\|two.ts:4-5')
    expect(output).toContain('| a.ts | b.ts | import | exact | 1 | none |')
    expect(output).toContain('| b.ts | npm | external | heuristic | 2 | a.ts:2-2, b\\|two.ts:4-5 |')
  })

  it('accepts legacy payloads and remains stable under reversed input', () => {
    const legacy = { ...atlas, coverage: undefined, nodes: [...atlas.nodes].reverse(), links: [...atlas.links].reverse().map(link => ({ ...link, evidence: link.evidence && [...link.evidence].reverse() })) } as unknown as Atlas
    expect(() => renderAtlasMarkdown(legacy)).not.toThrow()
    const canonical = renderAtlasMarkdown(atlas)
    const reversed = renderAtlasMarkdown(legacy)
    expect(reversed).toBe(canonical.replace(/\| Exact files \| 1 \|[\s\S]*?\| Hidden externals \| 0 \|\n/, '| Coverage | unavailable |\n'))
    expect(reversed.indexOf('| Source \\| code |')).toBeLessThan(reversed.indexOf('| Dependencies |'))
  })
})
