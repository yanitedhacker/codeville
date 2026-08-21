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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (!/\b(?:import|export|require)\b/.test(line)) continue

    // Multi-line named imports: join forward until the `from '...'` lands.
    let stmt = line
    if (/^\s*(?:import|export)\b/.test(line) && !/from\s*['"]/.test(line) && /[{,]\s*$/.test(line)) {
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
      while ((d = re.exec(line))) if (d[1]) push(out, seen, d[1], line)
    }
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
