import { parse } from '@babel/parser'
import type { EvidenceConfidence, ExtractionResult, ImportKind, ImportRef } from '../types.js'
import { extractTypescriptHeuristic, normalize } from './typescript-heuristic.js'

export { normalize }

type SourceNode = {
  type: string
  start?: number | null
  end?: number | null
  loc?: { start: { line: number }; end: { line: number } } | null
  [key: string]: unknown
}

type PendingFact = ImportRef & { start: number }

export function extractTypescript(text: string, path = 'source.ts'): ExtractionResult {
  let ast
  try {
    ast = parse(text, {
      sourceType: 'unambiguous',
      errorRecovery: false,
      createImportExpressions: true,
      allowImportExportEverywhere: true,
      plugins: [
        'typescript',
        ...(isJsxPath(path) ? ['jsx' as const] : []),
        'decorators-legacy',
      ],
    })
  } catch (error) {
    return {
      imports: extractTypescriptHeuristic(text),
      report: {
        mode: 'heuristic',
        extractor: 'typescript-line-scanner',
        diagnostics: [messageOf(error)],
      },
    }
  }
  return {
    imports: collectFacts(ast, text),
    report: { mode: 'exact', extractor: 'babel', diagnostics: [] },
  }
}

function isJsxPath(path: string): boolean {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return ext === 'tsx' || ext === 'jsx'
}

function collectFacts(root: unknown, text: string): ImportRef[] {
  const pending: PendingFact[] = []
  walk(root, (node) => {
    const fact = recognize(node, text)
    if (fact) pending.push(fact)
  })
  pending.sort((a, b) => a.start - b.start)
  const seen = new Set<string>()
  const imports: ImportRef[] = []
  for (const fact of pending) {
    if (seen.has(fact.spec)) continue
    seen.add(fact.spec)
    imports.push({
      spec: fact.spec,
      statement: fact.statement,
      kind: fact.kind,
      startLine: fact.startLine,
      endLine: fact.endLine,
      extractor: fact.extractor,
      confidence: fact.confidence,
    })
  }
  return imports
}

function recognize(node: SourceNode, text: string): PendingFact | undefined {
  if (node.type === 'ImportDeclaration') {
    return factFromSource(node, text, node.source, 'static', 'exact')
  }
  if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
    return factFromSource(node, text, node.source, 'reexport', 'exact')
  }
  if (node.type === 'ImportExpression') {
    return factFromSource(node, text, node.source, 'dynamic', 'exact')
  }
  if (node.type === 'CallExpression') {
    const spec = literalCalleeSpec(node, 'Import')
    if (spec !== undefined) return makeFact(node, text, spec, 'dynamic', 'exact')
    if (isRequireCall(node)) {
      const required = stringLiteralValue(firstArgument(node))
      if (required !== undefined) return makeFact(node, text, required, 'require', 'heuristic')
    }
    return undefined
  }
  if (node.type === 'TSImportEqualsDeclaration') {
    const ref = node.moduleReference
    if (!isNode(ref) || ref.type !== 'TSExternalModuleReference') return undefined
    return factFromSource(node, text, ref.expression, 'require', 'exact')
  }
  return undefined
}

function factFromSource(
  node: SourceNode,
  text: string,
  source: unknown,
  kind: ImportKind,
  confidence: EvidenceConfidence,
): PendingFact | undefined {
  const spec = stringLiteralValue(source)
  if (spec === undefined) return undefined
  return makeFact(node, text, spec, kind, confidence)
}

function makeFact(
  node: SourceNode,
  text: string,
  spec: string,
  kind: ImportKind,
  confidence: EvidenceConfidence,
): PendingFact {
  const startLine = node.loc?.start.line ?? 1
  return {
    spec,
    statement: sliceStatement(text, node),
    kind,
    startLine,
    endLine: node.loc?.end.line ?? startLine,
    extractor: 'babel',
    confidence,
    start: typeof node.start === 'number' ? node.start : startLine,
  }
}

function sliceStatement(text: string, node: SourceNode): string {
  if (typeof node.start === 'number' && typeof node.end === 'number') {
    return normalize(text.slice(node.start, node.end))
  }
  return ''
}

function isRequireCall(node: SourceNode): boolean {
  return isNode(node.callee) && node.callee.type === 'Identifier' && node.callee.name === 'require'
}

function literalCalleeSpec(node: SourceNode, calleeType: string): string | undefined {
  if (!isNode(node.callee) || node.callee.type !== calleeType) return undefined
  return stringLiteralValue(firstArgument(node))
}

function firstArgument(node: SourceNode): unknown {
  return Array.isArray(node.arguments) ? node.arguments[0] : undefined
}

function stringLiteralValue(node: unknown): string | undefined {
  if (!isNode(node) || node.type !== 'StringLiteral') return undefined
  return typeof node.value === 'string' ? node.value : undefined
}

function walk(value: unknown, visit: (node: SourceNode) => void): void {
  if (!isNode(value)) return
  visit(value)
  for (const [key, child] of Object.entries(value)) {
    if (key === 'loc' || key === 'extra' || key.endsWith('Comments')) continue
    if (Array.isArray(child)) {
      for (const item of child) walk(item, visit)
    } else {
      walk(child, visit)
    }
  }
}

function isNode(value: unknown): value is SourceNode {
  return Boolean(value) && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string'
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error)
}
