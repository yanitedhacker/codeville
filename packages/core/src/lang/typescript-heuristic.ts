import type { ImportRef } from '../types.js'

/**
 * Line-scanner, not a parser. Retained for explicit fallback and SFC heuristics.
 */
const STATIC = /^\s*(?:import|export)\s[\s\S]*?from\s*['"]([^'"]+)['"]/
const BARE_IMPORT = /^\s*import\s*['"]([^'"]+)['"]/
const DYNAMIC = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const REQUIRE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g

type HeuristicKind = 'static' | 'dynamic' | 'require'
type HeuristicFact = ImportRef & {
  kind: HeuristicKind
  startLine: number
  endLine: number
  extractor: 'typescript-line-scanner'
  confidence: 'heuristic'
}

export function extractTypescriptHeuristic(text: string): ImportRef[] {
  const out: HeuristicFact[] = []
  const seen = new Set<string>()
  const lines = text.split('\n')
  let inBlock = false

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i] ?? ''
    if (inBlock) {
      const end = line.indexOf('*/')
      if (end < 0) continue
      line = line.slice(end + 2)
      inBlock = false
    }
    line = stripOpenBlock(line, (open) => {
      inBlock = open
    })
    if (!/\b(?:import|export|require)\b/.test(line)) continue

    const clauses = line.split(';')
    for (let c = 0; c < clauses.length; c++) {
      let stmt = clauses[c] ?? ''
      const last = c === clauses.length - 1
      let endLine = i
      if (last && /^\s*(?:import|export)\b/.test(stmt) && !/from\s*['"]/.test(stmt) && /[{,]\s*$/.test(stmt)) {
        for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
          stmt += ' ' + (lines[j] ?? '').trim()
          endLine = j
          if (/from\s*['"]/.test(lines[j] ?? '')) break
        }
      }

      const m = STATIC.exec(stmt) ?? BARE_IMPORT.exec(stmt)
      if (m?.[1]) push(out, seen, m[1], stmt, 'static', i + 1, endLine + 1)

      for (const [re, kind] of [[DYNAMIC, 'dynamic'], [REQUIRE, 'require']] as const) {
        re.lastIndex = 0
        let d: RegExpExecArray | null
        while ((d = re.exec(stmt))) if (d[1]) push(out, seen, d[1], stmt, kind, i + 1, endLine + 1)
      }
    }
  }
  return out
}

function stripOpenBlock(line: string, setOpen: (open: boolean) => void): string {
  let out = ''
  let i = 0
  while (i < line.length) {
    if (line[i] === '/' && line[i + 1] === '*') {
      const end = line.indexOf('*/', i + 2)
      if (end < 0) {
        setOpen(true)
        break
      }
      i = end + 2
      continue
    }
    out += line[i]
    i++
  }
  return out
}

function push(
  out: HeuristicFact[],
  seen: Set<string>,
  spec: string,
  statement: string,
  kind: HeuristicKind,
  startLine: number,
  endLine: number,
): void {
  if (seen.has(spec)) return
  seen.add(spec)
  out.push({
    spec,
    statement: normalize(statement),
    kind,
    startLine,
    endLine,
    extractor: 'typescript-line-scanner',
    confidence: 'heuristic',
  })
}

export function normalize(statement: string): string {
  const s = statement.replace(/\s+/g, ' ').trim().replace(/;+$/, '')
  return s.length > 88 ? s.slice(0, 87) + '…' : s
}
