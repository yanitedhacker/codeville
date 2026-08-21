/**
 * Names a file declares, pulled with a line scanner.
 *
 * For a 5,000-line file the first ten lines are all imports, which tells an
 * explainer nothing. The list of exported symbols tells it almost everything.
 */
const PATTERNS: RegExp[] = [
  // TS / JS
  /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/,
  /^\s*export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
  /^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/,
  /^\s*export\s+(?:type|interface|enum)\s+([A-Za-z_$][\w$]*)/,
  // Python
  /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/,
  /^\s*class\s+([A-Za-z_]\w*)/,
  // Go
  /^\s*func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)/,
  // Rust
  /^\s*pub\s+(?:async\s+)?fn\s+([A-Za-z_]\w*)/,
  /^\s*pub\s+(?:struct|enum|trait)\s+([A-Za-z_]\w*)/,
  // SQL
  /^\s*create\s+(?:or\s+replace\s+)?(?:table|view|index|function|type)\s+(?:if\s+not\s+exists\s+)?["\w.]*?([A-Za-z_]\w*)/i,
]

/** `export { a, b as c }` — take the exported name, not the local one. */
const EXPORT_LIST = /^\s*export\s*\{([^}]*)\}/

export function outline(text: string, limit = 60): string[] {
  const names: string[] = []
  const seen = new Set<string>()

  const add = (name: string): void => {
    if (!name || seen.has(name) || names.length >= limit) return
    seen.add(name)
    names.push(name)
  }

  for (const line of text.split('\n')) {
    if (names.length >= limit) break

    const list = EXPORT_LIST.exec(line)
    if (list?.[1]) {
      for (const part of list[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim()
        if (name && name !== 'default') add(name)
      }
      continue
    }

    for (const re of PATTERNS) {
      const m = re.exec(line)
      if (m?.[1]) {
        add(m[1])
        break
      }
    }
  }

  return names
}

export const MAX_SOURCE_CHARS = 4000

/**
 * What an explainer actually gets to read: the head of the file, plus the names
 * it declares further down.
 */
export function sourceDigest(text: string, maxChars = MAX_SOURCE_CHARS): string {
  let cut = maxChars
  if (text.length > maxChars) {
    const last = text.charCodeAt(maxChars - 1)
    if (last >= 0xd800 && last <= 0xdbff) cut = maxChars - 1
  }
  const head = text.length > maxChars ? `${text.slice(0, cut)}\n… (truncated)` : text
  if (text.length <= maxChars) return head
  const names = outline(text)
  return names.length ? `${head}\n\n/* also declares: ${names.join(', ')} */` : head
}
