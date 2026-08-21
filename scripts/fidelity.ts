import { readRepo } from '../packages/cli/src/readdir.js'
import { scan, createResolver, readTsconfigAliases } from '../packages/core/src/index.js'

const root = process.argv[2] ?? process.cwd()
const { files } = await readRepo(root)
const records = scan(files)
const ts = files.find((f) => f.path === 'tsconfig.json')
const withAliases = createResolver(records, ts ? readTsconfigAliases(ts.text) : {})
const noAliases = createResolver(records, {})

let relTotal = 0
let relResolved = 0
const unresolvedRel: string[] = []
for (const f of records) {
  for (const imp of f.imports) {
    if (!imp.spec.startsWith('.')) continue
    relTotal++
    if (withAliases.resolve(imp.spec, f.dir)) relResolved++
    else unresolvedRel.push(f.path + '  ->  ' + imp.spec)
  }
}

// Workspace-internal specifiers that a repo without tsconfig paths would misread as npm packages.
const wsNames = new Set<string>()
for (const f of files) {
  if (!/(^|\/)package\.json$/.test(f.path)) continue
  try {
    const name = (JSON.parse(f.text) as { name?: string }).name
    if (name && name !== 'codeville') wsNames.add(name)
  } catch {}
}
let wsMisread = 0
for (const f of records) {
  for (const imp of f.imports) {
    if (imp.spec.startsWith('.')) continue
    const head = imp.spec.startsWith('@') ? imp.spec.split('/').slice(0, 2).join('/') : imp.spec.split('/')[0]
    if (!head || !wsNames.has(head)) continue
    if (!noAliases.resolve(imp.spec, f.dir)) wsMisread++
  }
}

const pct = relTotal ? ((relResolved / relTotal) * 100).toFixed(1) : '0.0'
console.log('source files                  ' + records.length)
console.log('package.json manifests seen   ' + files.filter((f) => /(^|\/)package\.json$/.test(f.path)).length)
console.log('workspace package names       ' + [...wsNames].sort().join(', '))
console.log('relative specifiers           ' + relTotal)
console.log('relative resolved             ' + relResolved + '  (' + pct + '%)')
console.log('workspace imports misread     ' + wsMisread)
console.log('')
console.log('unresolved relative specifiers:')
for (const line of unresolvedRel.slice(0, 10)) console.log('   ' + line)
if (unresolvedRel.length > 10) console.log('   ... ' + (unresolvedRel.length - 10) + ' more')
