import type { ImportRef } from '../types.js'
import { normalize } from './typescript.js'

export function extractGo(text: string): ImportRef[] {
  const out: ImportRef[] = []
  const seen = new Set<string>()
  const single = /^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/
  let inBlock = false
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (/^\s*import\s*\(/.test(line)) { inBlock = true; continue }
    if (inBlock && /^\s*\)/.test(line)) { inBlock = false; continue }

    const m = inBlock ? /"([^"]+)"/.exec(line) : single.exec(line)
    const spec = m?.[1]
    if (!spec || seen.has(spec)) continue
    seen.add(spec)
    out.push({
      spec,
      statement: normalize(inBlock ? `import "${spec}"` : line),
      kind: 'static',
      startLine: i + 1,
      endLine: i + 1,
      extractor: 'go-line-scanner',
      confidence: 'heuristic',
    })
  }
  return out
}
