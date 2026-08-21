import type { ImportRef } from '../types.js'

/**
 * Line-scanner, not a parser. We need specifiers and the literal statement text;
 * a full TS parse would cost 40x for edges we already resolve heuristically.
 */
const STATIC = /^\s*(?:import|export)\s[\s\S]*?from\s*['"]([^'"]+)['"]/
const BARE_IMPORT = /^\s*import\s*['"]([^'"]+)['"]/
const DYNAMIC = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const REQUIRE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g

export function extractTypescript(text: string): ImportRef[] {
  const out: ImportRef[] = []
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
      if (last && /^\s*(?:import|export)\b/.test(stmt) && !/from\s*['"]/.test(stmt) && /[{,]\s*$/.test(stmt)) {
        for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
          stmt += ' ' + (lines[j] ?? '').trim()
          if (/from\s*['"]/.test(lines[j] ?? '')) break
        }
      }

      const m = STATIC.exec(stmt) ?? BARE_IMPORT.exec(stmt)
      if (m?.[1]) push(out, seen, m[1], stmt)

      for (const re of [DYNAMIC, REQUIRE]) {
        re.lastIndex = 0
        let d: RegExpExecArray | null
        while ((d = re.exec(stmt))) if (d[1]) push(out, seen, d[1], stmt)
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

function push(out: ImportRef[], seen: Set<string>, spec: string, statement: string): void {
  if (seen.has(spec)) return
  seen.add(spec)
  out.push({ spec, statement: normalize(statement) })
}

export function normalize(statement: string): string {
  const s = statement.replace(/\s+/g, ' ').trim().replace(/;+$/, '')
  return s.length > 88 ? s.slice(0, 87) + '…' : s
}
