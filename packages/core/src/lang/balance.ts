/** Join lines until `open`/`close` balance. Line comments are ignored when counting depth. */
export function joinBalanced(
  lines: string[],
  start: number,
  open: string,
  close: string,
  cap: number,
  comment: string,
): { text: string; end: number } {
  const code = (line: string): string => {
    const i = line.indexOf(comment)
    return i < 0 ? line : line.slice(0, i)
  }
  let text = code(lines[start] ?? '')
  let depth = 0
  for (const ch of text) {
    if (ch === open) depth++
    else if (ch === close) depth--
  }
  if (depth <= 0) return { text, end: start }
  const last = Math.min(lines.length - 1, start + cap - 1)
  let i = start
  while (depth > 0 && i < last) {
    i++
    const next = code(lines[i] ?? '')
    text += '\n' + next
    for (const ch of next) {
      if (ch === open) depth++
      else if (ch === close) depth--
    }
  }
  return { text, end: i }
}
