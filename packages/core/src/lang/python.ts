import type { ImportRef } from '../types.js'
import { joinBalanced } from './balance.js'
import { normalize } from './typescript.js'

const FROM = /^\s*from\s+([.\w]+)\s+import\s+(.+)$/
const PLAIN = /^\s*import\s+(.+)$/

export function extractPython(text: string): ImportRef[] {
  const out: ImportRef[] = []
  const seen = new Set<string>()
  const push = (spec: string, line: string, startLine: number, endLine: number): void => {
    if (!spec || spec === '*' || spec === '(' || spec === ')' || seen.has(spec)) return
    seen.add(spec)
    out.push({
      spec,
      statement: normalize(line),
      kind: 'static',
      startLine,
      endLine,
      extractor: 'python-line-scanner',
      confidence: 'heuristic',
    })
  }

  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const start = line.trimStart()
    if (!start || start.startsWith('#')) continue
    if (!/^(?:from|import)\s/.test(start)) continue

    if (/^\s*from\s/.test(line)) {
      const fromStart = i
      const joined = joinBalanced(lines, i, '(', ')', 40, '#')
      i = joined.end
      const flat = joined.text.replace(/\s+/g, ' ')
      const from = FROM.exec(flat)
      if (from) {
        const base = from[1] ?? ''
        push(base, flat, fromStart + 1, joined.end + 1)
        let names = from[2] ?? ''
        if (names.includes('(')) names = names.replace(/[()]/g, ' ')
        for (const raw of names.split(',')) {
          const name = importName(raw)
          if (!name) continue
          push(/^\.+$/.test(base) ? base + name : `${base}.${name}`, flat, fromStart + 1, joined.end + 1)
        }
        continue
      }
    }

    const plain = PLAIN.exec(line)
    if (plain) {
      for (const raw of (plain[1] ?? '').split(',')) {
        const name = importName(raw)
        if (name) push(name, line, i + 1, i + 1)
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
  if (s === '*' || s === '(' || s === ')') return ''
  return s
}

