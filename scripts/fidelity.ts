import { readRepo } from '../packages/cli/src/readdir.js'
import {
  buildAtlas,
  createResolver,
  readCargoCrates,
  readGoModules,
  readTsconfigAliases,
  readWorkspacePackages,
  scan,
} from '../packages/core/src/index.js'

const root = process.argv[2] ?? process.cwd()
const { files } = await readRepo(root)
const atlas = buildAtlas(files)
const { coverage, stats } = atlas

const records = scan(files)
const index = new Set(records.map((r) => r.path))
const ts = files.find((f) => f.path === 'tsconfig.json')
const cargo = readCargoCrates(files, index)
const resolver = createResolver(records, {
  ...(ts ? readTsconfigAliases(ts.text) : {}),
  workspaces: readWorkspacePackages(files, index),
  goModules: readGoModules(files),
  cargoCrates: cargo.crates,
  cargoDeps: cargo.deps,
})

const unresolved: { path: string; startLine: number; spec: string }[] = []
for (const rec of records) {
  for (const imp of rec.imports) {
    const resolution = resolver.resolveImport(imp.spec, rec.dir, rec.path)
    if (resolution.kind !== 'unresolved') continue
    unresolved.push({ path: rec.path, startLine: imp.startLine, spec: imp.spec })
  }
}
unresolved.sort((a, b) => {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1
  if (a.startLine !== b.startLine) return a.startLine - b.startLine
  if (a.spec !== b.spec) return a.spec < b.spec ? -1 : 1
  return 0
})

const rows: [string, number][] = [
  ['source files', stats.sourceFiles],
  ['exact parser files', coverage.exactFiles],
  ['heuristic parser files', coverage.heuristicFiles],
  ['unsupported files', coverage.unsupportedFiles],
  ['import facts', coverage.importFacts],
  ['internal resolved', coverage.internalFacts],
  ['external packages', coverage.externalFacts],
  ['system imports', coverage.systemFacts],
  ['unresolved imports', coverage.unresolvedFacts],
  ['ignored imports', coverage.ignoredFacts],
  ['rolled-up files', coverage.rolledUpFiles],
  ['hidden externals', coverage.hiddenExternals],
]

const width = Math.max(...rows.map(([label]) => label.length), 'internal resolution coverage'.length)
for (const [label, value] of rows) console.log(label.padEnd(width + 2) + value)

const denom = coverage.internalFacts + coverage.unresolvedFacts
const ratio = denom === 0 ? 'n/a' : ((coverage.internalFacts / denom) * 100).toFixed(1) + '%'
console.log('internal resolution coverage'.padEnd(width + 2) + ratio)

console.log('')
console.log('unresolved facts:')
for (const fact of unresolved.slice(0, 10)) {
  console.log('   ' + fact.path + ':' + fact.startLine + '  ->  ' + fact.spec)
}
if (unresolved.length > 10) console.log('   ... ' + (unresolved.length - 10) + ' more')
