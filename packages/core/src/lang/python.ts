import type { ImportRef } from '../types.js'
import { normalize } from './typescript.js'

const FROM = /^\s*from\s+([.\w]+)\s+import\b/
const PLAIN = /^\s*import\s+([\w.]+)/

export function extractPython(text: string): ImportRef[] {
  const out: ImportRef[] = []
  const seen = new Set<string>()
  for (const line of text.split('\n')) {
    if (!/^\s*(?:from|import)\s/.test(line)) continue
    const m = FROM.exec(line) ?? PLAIN.exec(line)
    const spec = m?.[1]
    if (!spec || seen.has(spec)) continue
    seen.add(spec)
    out.push({ spec, statement: normalize(line) })
  }
  return out
}
