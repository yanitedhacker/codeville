import { readRepo } from '../packages/cli/src/readdir.js'
import { buildAtlas, scan, createResolver, readGoModules, readWorkspacePackages, readTsconfigAliases } from '../packages/core/src/index.js'

const root = process.argv[2]!
const lang = process.argv[3] ?? 'auto'

const { files } = await readRepo(root)
const records = scan(files)
const index = new Set(records.map((r) => r.path))
const ts = files.find((f) => f.path === 'tsconfig.json')
const goModules = readGoModules(files)
const resolver = createResolver(records, {
  ...(ts ? readTsconfigAliases(ts.text) : {}),
  workspaces: readWorkspacePackages(files, index),
  goModules,
})
const topDirs = new Set(records.map((r) => (r.path.includes('/') ? r.path.split('/')[0]! : '')))

function isInternal(spec: string): boolean {
  if (spec.startsWith('.')) return true
  if (lang === 'go') return goModules.some((m) => spec === m.prefix || spec.startsWith(m.prefix + '/'))
  if (lang === 'rust') return /^(crate|self|super)::/.test(spec)
  if (lang === 'python') return topDirs.has(spec.split('.')[0]!)
  return false
}

let internal = 0
let resolved = 0
const misses = new Map<string, number>()
for (const f of records) {
  for (const imp of f.imports) {
    if (!isInternal(imp.spec)) continue
    internal++
    if (resolver.resolve(imp.spec, f.dir, f.path)) resolved++
    else misses.set(imp.spec, (misses.get(imp.spec) ?? 0) + 1)
  }
}

const atlas = buildAtlas(files, { maxNodes: 400 })
const externals = atlas.nodes.filter((n) => n.kind === 'external').map((n) => n.label)
const pct = internal ? ((resolved / internal) * 100).toFixed(1) : 'n/a'
console.log('source files        ' + records.length)
console.log('internal specifiers ' + internal)
console.log('resolved            ' + resolved + '  (' + pct + '%)')
console.log('externals (' + externals.length + ')  ' + externals.slice(0, 24).join(', '))
for (const [spec, n] of [...misses].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log('   x' + String(n).padEnd(4) + spec)
}
