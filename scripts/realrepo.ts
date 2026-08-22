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

const root = process.argv[2]!
const lang = process.argv[3] ?? 'auto'

const { files } = await readRepo(root)
const records = scan(files)
const index = new Set(records.map((r) => r.path))
const ts = files.find((f) => f.path === 'tsconfig.json')
const goModules = readGoModules(files)
const cargo = readCargoCrates(files, index)
const resolver = createResolver(records, {
  ...(ts ? readTsconfigAliases(ts.text) : {}),
  workspaces: readWorkspacePackages(files, index),
  goModules,
  cargoCrates: cargo.crates,
  cargoDeps: cargo.deps,
})

const JS_TS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts'])

function inLang(ext: string): boolean {
  if (lang === 'auto') return true
  if (lang === 'python') return ext === 'py' || ext === 'pyi'
  if (lang === 'go') return ext === 'go'
  if (lang === 'rust') return ext === 'rs'
  return JS_TS.has(ext)
}

const totals = { internal: 0, external: 0, system: 0, unresolved: 0, ignored: 0 }
for (const rec of records) {
  if (!inLang(rec.ext)) continue
  for (const imp of rec.imports) {
    const resolution = resolver.resolveImport(imp.spec, rec.dir, rec.path)
    totals[resolution.kind]++
  }
}

const atlas = buildAtlas(files, { maxNodes: 400 })
const externals = atlas.nodes.filter((n) => n.kind === 'external').map((n) => n.label)

console.log('source files        ' + records.length)
console.log('internal            ' + totals.internal)
console.log('external            ' + totals.external)
console.log('system              ' + totals.system)
console.log('unresolved          ' + totals.unresolved)
console.log('ignored             ' + totals.ignored)
console.log('externals (' + externals.length + ')  ' + externals.slice(0, 24).join(', '))
