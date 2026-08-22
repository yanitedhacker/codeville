import type { ExtractionResult, ImportRef } from '../types.js'
import { extractTypescript } from './typescript.js'
import { extractTypescriptHeuristic } from './typescript-heuristic.js'
import { extractPython } from './python.js'
import { extractGo } from './go.js'
import { extractRust } from './rust.js'

const JS_TS_EXT = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts'])
const SFC_EXT = new Set(['vue', 'svelte', 'astro'])

/** Unknown languages yield no edges — the file still gets a slab, just no arcs. */
export function extractImports(path: string, text: string): ImportRef[] {
  return extractDependencies(path, text).imports
}

export function extractDependencies(path: string, text: string): ExtractionResult {
  try {
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
    if (JS_TS_EXT.has(ext)) return extractTypescript(text, path)
    if (SFC_EXT.has(ext)) {
      return {
        imports: extractTypescriptHeuristic(text),
        report: { mode: 'heuristic', extractor: 'typescript-line-scanner', diagnostics: [] },
      }
    }
    if (ext === 'py' || ext === 'pyi') {
      return {
        imports: extractPython(text),
        report: { mode: 'heuristic', extractor: 'python-line-scanner', diagnostics: [] },
      }
    }
    if (ext === 'go') {
      return {
        imports: extractGo(text),
        report: { mode: 'heuristic', extractor: 'go-line-scanner', diagnostics: [] },
      }
    }
    if (ext === 'rs') {
      return {
        imports: extractRust(text),
        report: { mode: 'heuristic', extractor: 'rust-line-scanner', diagnostics: [] },
      }
    }
    return { imports: [], report: { mode: 'unsupported', extractor: null, diagnostics: [] } }
  } catch (error) {
    return {
      imports: [],
      report: {
        mode: 'failed',
        extractor: null,
        diagnostics: [error instanceof Error && error.message ? error.message : String(error)],
      },
    }
  }
}

export { extractTypescript, extractPython, extractGo, extractRust }
