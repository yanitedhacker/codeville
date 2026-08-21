import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SKIP = new Set(['node_modules', '.git', 'dist', 'atlases', 'public', '.codeville'])

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sources(full, out)
    else if (/\.(ts|tsx|css|json|md)$/.test(entry)) out.push(full)
  }
  return out
}

describe('source hygiene', () => {
  // A stray NUL byte in cli/src/index.ts made scan() classify our own CLI as
  // binary and silently drop it from its atlas. Cheap tripwire, expensive bug.
  it('has no raw NUL bytes in any tracked source file', () => {
    const offenders = sources(ROOT).filter((f) => readFileSync(f).includes(0))
    expect(offenders.map((f) => f.slice(ROOT.length))).toEqual([])
  })
})
