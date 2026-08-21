import type { ImportRef } from '../types.js'
import { normalize } from './typescript.js'

const FROM = /^\s*from\s+([.\w]+)\s+import\s+(.+)$/
const PLAIN = /^\s*import\s+(.+)$/

export function extractPython(text: string): ImportRef[] {
  const out: ImportRef[] = []
  const seen = new Set<string>()
  const push = (spec: string, line: string): void => {
    if (!spec || spec === '*' || seen.has(spec)) return
    seen.add(spec)
    out.push({ spec, statement: normalize(line) })
  }

  for (const line of text.split('\n')) {
    const start = line.trimStart()
    if (!start || start.startsWith('#')) continue
    if (!/^(?:from|import)\s/.test(start)) continue

    const from = FROM.exec(line)
    if (from) {
      const base = from[1] ?? ''
      push(base, line)
      for (const raw of (from[2] ?? '').split(',')) {
        const name = importName(raw)
        if (!name) continue
        push(/^\.+$/.test(base) ? base + name : `${base}.${name}`, line)
      }
      continue
    }

    const plain = PLAIN.exec(line)
    if (plain) {
      for (const raw of (plain[1] ?? '').split(',')) {
        const name = importName(raw)
        if (name) push(name, line)
      }
    }
  }
  return out
}

function importName(raw: string): string {
  let s = raw.trim()
  const hash = s.indexOf('#')
  if (hash >= 0) s = s.slice(0, hash).trim()
  s = s.replace(/\s+as\s+\w+\s*$/i, '').trim()
  return s === '*' ? '' : s
}
