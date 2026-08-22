/** Node 20 public built-ins. Sorted so the set is deterministic and reviewable. */
const NODE_BUILTINS = new Set(
  [
    'assert',
    'async_hooks',
    'buffer',
    'child_process',
    'cluster',
    'console',
    'constants',
    'crypto',
    'dgram',
    'diagnostics_channel',
    'dns',
    'domain',
    'events',
    'fs',
    'http',
    'http2',
    'https',
    'inspector',
    'module',
    'net',
    'os',
    'path',
    'perf_hooks',
    'process',
    'punycode',
    'querystring',
    'readline',
    'repl',
    'stream',
    'string_decoder',
    'sys',
    'test',
    'timers',
    'tls',
    'trace_events',
    'tty',
    'url',
    'util',
    'v8',
    'vm',
    'wasi',
    'worker_threads',
    'zlib',
  ].slice().sort(),
)

const NODE_SOURCE_EXT = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  'mts',
  'cts',
  'vue',
  'svelte',
  'astro',
])

const RUST_STD = new Set(['std', 'core', 'alloc', 'proc_macro', 'test'])

function fileExt(path: string): string {
  const slash = path.lastIndexOf('/')
  const name = slash < 0 ? path : path.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

function firstPathSegment(spec: string): string {
  return spec.split('/')[0] ?? ''
}

function nodeBuiltinName(spec: string): string | null {
  const head = firstPathSegment(spec)
  return NODE_BUILTINS.has(head) ? head : null
}

/** Normalized system module name, or null when the specifier is not a language stdlib. */
export function classifySystemImport(spec: string, fromFile?: string): string | null {
  if (spec.startsWith('node:')) {
    const rest = spec.slice('node:'.length)
    const head = firstPathSegment(rest)
    return head || null
  }

  const ext = fromFile ? fileExt(fromFile) : ''

  if (fromFile && NODE_SOURCE_EXT.has(ext)) {
    return nodeBuiltinName(spec)
  }

  if (fromFile?.endsWith('.go')) {
    const head = firstPathSegment(spec)
    if (head && !head.includes('.')) return head
  }

  if (fromFile?.endsWith('.rs')) {
    const head = spec.includes('::') ? (spec.split('::')[0] ?? '') : spec
    if (RUST_STD.has(head)) return head
  }

  return null
}
