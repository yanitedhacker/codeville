/** The one contract. Analyzer writes it, renderer reads it, export inlines it. */

export type NodeKind = 'file' | 'dir' | 'external'
export type LinkType = 'import' | 'containment' | 'external'

export interface VirtualFile {
  /** Repo-relative POSIX path, no leading slash. */
  path: string
  text: string
}

export interface AtlasNode {
  id: string
  label: string
  path: string
  kind: NodeKind
  area: string
  /** Human role, e.g. "api endpoint". Drives the chip and the tooltip. */
  role: string
  contributes: string[]
  lines: number
  bytes: number
  /** Layout space. Projected to screen at render time. */
  x: number
  y: number
  /** Slab height, already scaled + clamped. */
  h: number
  /** First non-blank source lines, for SOURCE EXCERPT. */
  excerpt: string[]
  in: number
  out: number
  /** Count of rolled-up children when kind === 'dir'. */
  items?: number
  /** Outline names, capped at 60. Files only; omitted when empty. */
  symbols?: string[]
  /** Only ever written by an AI explainer adapter. Never by heuristics. */
  summary?: string
}

export interface AtlasLink {
  from: string
  to: string
  type: LinkType
  /** Literal import statements riding this edge — the inspectable data snippets. */
  samples: string[]
}

export interface AtlasArea {
  id: string
  label: string
  color: string
  count: number
}

export interface Atlas {
  repo: { name: string; ref?: string; generatedAt: string; note: string }
  stats: { nodes: number; sourceFiles: number; lines: number; links: number; packages: number }
  areas: AtlasArea[]
  nodes: AtlasNode[]
  links: AtlasLink[]
}

/** A scanned source file plus everything derived from its bytes. */
export interface FileRecord {
  path: string
  dir: string
  name: string
  ext: string
  area: string
  lines: number
  bytes: number
  excerpt: string[]
  imports: ImportRef[]
  /** Outline names, capped at 60. Omitted when the file declares none. */
  symbols?: string[]
}

export interface ImportRef {
  /** Raw specifier as written: "./foo", "@/lib/db", "aiohttp". */
  spec: string
  /** The whole statement text, trimmed. This is the packet payload. */
  statement: string
}

export interface BuildOptions {
  repoName?: string
  ref?: string
  /** Max visible nodes before directory rollup kicks in harder. */
  maxNodes?: number
  /** Directories at or beyond this depth collapse into one slab. */
  rollupDepth?: number
  /** Areas listed here always roll up to a single slab unless selected. */
  denseAreas?: string[]
  now?: () => string
}
