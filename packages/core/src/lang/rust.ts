import type { ImportRef } from '../types.js'
import { joinBalanced } from './balance.js'
import { normalize } from './typescript.js'

const USE_HEAD = /^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+/
const MOD = /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*;/
const AS_ALIAS = /\s+as\s+[A-Za-z_]\w*\s*$/

export function extractRust(text: string): ImportRef[] {
  const out: ImportRef[] = []
  const seen = new Set<string>()
  const lines = text.split('\n')
  const push = (spec: string, statement: string, startLine: number, endLine: number): void => {
    if (!spec || spec === '*' || seen.has(spec)) return
    if (!/^[A-Za-z_][\w]*(?:::[A-Za-z_][\w]*)*$/.test(spec)) return
    seen.add(spec)
    out.push({
      spec,
      statement: normalize(statement),
      kind: 'static',
      startLine,
      endLine,
      extractor: 'rust-line-scanner',
      confidence: 'heuristic',
    })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const start = line.trimStart()
    if (!start || start.startsWith('//') || start.startsWith('#')) continue

    const mod = MOD.exec(line)
    if (mod?.[1]) {
      push(`self::${mod[1]}`, line, i + 1, i + 1)
      continue
    }

    if (!USE_HEAD.test(line)) continue
    const useStart = i
    const joined = joinBalanced(lines, i, '{', '}', 40, '//')
    i = joined.end
    const body = joined.text.replace(USE_HEAD, '').replace(/;\s*$/, '').trim()
    for (const spec of expandRustUse(body)) push(spec, joined.text, useStart + 1, joined.end + 1)
  }
  return out
}

function expandRustUse(s: string): string[] {
  const brace = s.indexOf('{')
  if (brace < 0) {
    const item = s.replace(AS_ALIAS, '').trim()
    if (!item || item === '*' || item.endsWith('::*')) return []
    return [item]
  }
  const prefix = s.slice(0, brace).replace(/::$/, '').trim()
  let depth = 0
  let close = -1
  for (let i = brace; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') {
      depth--
      if (depth === 0) {
        close = i
        break
      }
    }
  }
  if (close < 0) return prefix ? [prefix] : []
  const out: string[] = []
  for (const part of splitTopComma(s.slice(brace + 1, close))) {
    const t = part.trim()
    if (!t) continue
    for (const exp of expandRustUse(t)) {
      if (exp === '*') continue
      if (exp === 'self') {
        if (prefix) out.push(prefix)
        continue
      }
      out.push(prefix ? `${prefix}::${exp}` : exp)
    }
  }
  return out
}

function splitTopComma(s: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === ',' && depth === 0) {
      parts.push(s.slice(start, i))
      start = i + 1
    }
  }
  parts.push(s.slice(start))
  return parts
}
