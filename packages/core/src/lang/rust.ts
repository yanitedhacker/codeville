import type { ImportRef } from '../types.js'
import { normalize } from './typescript.js'

const USE = /^\s*(?:pub\s+)?use\s+([A-Za-z_][\w:]*)/
const MOD = /^\s*(?:pub\s+)?mod\s+([A-Za-z_]\w*)\s*;/

export function extractRust(text: string): ImportRef[] {
  const out: ImportRef[] = []
  const seen = new Set<string>()
  for (const line of text.split('\n')) {
    const m = USE.exec(line) ?? MOD.exec(line)
    let spec = m?.[1]
    if (!spec) continue
    spec = spec.split('::')[0] ?? spec
    if (spec === 'self' || spec === 'super' || seen.has(spec)) continue
    seen.add(spec)
    out.push({ spec, statement: normalize(line) })
  }
  return out
}
