/** Flag fragment for pasting after `codeville ask <path-to-repo>`. Never a full argv. */

export function chosenAskFn(symbols: readonly string[], typed: string): string | undefined {
  if (!typed || !symbols.includes(typed)) return undefined
  return typed
}

export function askFlagFragment(path: string, fn?: string): string {
  const node = `--node ${quoteZsh(path)}`
  if (!fn) return node
  return `${node} --fn ${fn}`
}

/** Quote only when a human would need quotes in zsh (whitespace in the path). */
function quoteZsh(path: string): string {
  if (!/\s/.test(path)) return path
  return `'${path.replace(/'/g, `'\\''`)}'`
}
