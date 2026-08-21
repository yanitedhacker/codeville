/**
 * Strip comments and trailing commas from JSONC.
 *
 * Must be string-aware: a regex pass turns tsconfig's `"@/*": ["./*"]` +
 * `"include": ["**\/*.ts"]` into one giant "block comment" and eats the paths map.
 */
export function stripJsonc(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  let out = ''
  let i = 0
  const n = text.length

  while (i < n) {
    const c = text[i] as string

    if (c === '"') {
      const start = i++
      while (i < n) {
        if (text[i] === '\\') i += 2
        else if (text[i] === '"') { i++; break }
        else i++
      }
      out += text.slice(start, i)
      continue
    }

    if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++
      continue
    }

    if (c === '/' && text[i + 1] === '*') {
      i += 2
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++
      i += 2
      continue
    }

    out += c
    i++
  }

  return dropTrailingCommas(out)
}

function dropTrailingCommas(text: string): string {
  let out = ''
  let i = 0
  const n = text.length

  while (i < n) {
    const c = text[i] as string

    if (c === '"') {
      const start = i++
      while (i < n) {
        if (text[i] === '\\') i += 2
        else if (text[i] === '"') { i++; break }
        else i++
      }
      out += text.slice(start, i)
      continue
    }

    if (c === ',') {
      let j = i + 1
      while (j < n && /\s/.test(text[j] as string)) j++
      if (text[j] === '}' || text[j] === ']') { i++; continue }
    }

    out += c
    i++
  }

  return out
}

export function parseJsonc<T>(text: string): T | null {
  try {
    return JSON.parse(stripJsonc(text)) as T
  } catch {
    return null
  }
}
