import type { ImportRef } from '../types.js'
import { extractTypescript } from './typescript.js'
import { extractPython } from './python.js'
import { extractGo } from './go.js'
import { extractRust } from './rust.js'

const TS_EXT = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts', 'vue', 'svelte', 'astro'])

/** Unknown languages yield no edges — the file still gets a slab, just no arcs. */
export function extractImports(path: string, text: string): ImportRef[] {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  if (TS_EXT.has(ext)) return extractTypescript(text)
  if (ext === 'py' || ext === 'pyi') return extractPython(text)
  if (ext === 'go') return extractGo(text)
  if (ext === 'rs') return extractRust(text)
  return []
}

export { extractTypescript, extractPython, extractGo, extractRust }
