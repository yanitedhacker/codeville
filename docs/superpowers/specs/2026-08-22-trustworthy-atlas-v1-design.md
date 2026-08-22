# Trustworthy Atlas v1 Design

**Status:** Ready for implementation planning

**Date:** 2026-08-22

## Goal

Make Codeville's visible graph and geometry honest enough that a developer can treat them as inspectable evidence, while preserving the existing local-first browser workflow, deterministic output, standalone HTML export, and restrained software-city aesthetic.

## Problem

The current TypeScript/JavaScript extractor is a regex line scanner. It can report syntax that only resembles an import as a dependency; Codeville's own `Pick<AtlasLink, 'from' | 'to' | 'type'>` declaration currently creates a false external package named `" | "`. The analyzer also accepts source extensions it cannot parse, conflates unresolved references with external packages, and does not expose extraction or roll-up coverage.

The current city layout receives links but does not use them. Its geometry communicates filesystem areas, not dependency topology. The UI does not distinguish those meanings, and search, keyboard access, reduced-motion behavior, and narrow viewports are incomplete.

## Product Position

Codeville remains a deterministic, local-first software city. It will not generate authoritative edges with an LLM. The differentiator is a graph whose claims can be inspected back to source evidence, plus two deliberately different projections:

- **City:** filesystem/package structure for spatial memory.
- **Dependencies:** import-derived proximity for architectural inspection.

## Decisions

### 1. Ripgrep is not a parser

Use `rg` during development for repository navigation and benchmark auditing. Do not add a runtime ripgrep dependency and do not derive production edges from regex tool calls. Browser folder and ZIP ingestion must remain fully local and cannot depend on a host binary.

### 2. Parser-grade TS/JS extraction uses Babel

Add `@babel/parser` 7.29.8 as the only new runtime dependency. It is already present transitively in `pnpm-lock.yaml`, is synchronous, works in Node and browser bundles, and preserves the synchronous `buildAtlas(files)` contract.

Parse `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, and `.cts` into an AST. Extract:

- static imports;
- bare side-effect imports;
- `export ... from` and `export * from`;
- literal dynamic imports;
- literal CommonJS `require()` calls;
- TypeScript `import x = require("x")` declarations.

Static ESM facts are `exact`. Literal `require()` facts are `heuristic` because the identifier can be shadowed without semantic scope analysis. On a Babel parse error, fall back to the current line scanner, mark the file `heuristic`, and record one parse diagnostic. Vue, Svelte, and Astro also retain the current line scanner and are explicitly reported as heuristic rather than pretending to be TS AST parses.

Python, Go, and Rust keep their current extractors in this release and are marked `heuristic`. Accepted extensions without an extractor are `unsupported`.

### 3. Facts and graph links carry evidence

Add these contracts to `packages/core/src/types.ts`:

```ts
export type ExtractionMode = 'exact' | 'heuristic' | 'unsupported' | 'failed'
export type ImportKind = 'static' | 'dynamic' | 'require' | 'reexport'
export type EvidenceConfidence = 'exact' | 'heuristic'

export interface SourceEvidence {
  path: string
  startLine: number
  endLine: number
  specifier: string
  statement: string
  extractor: string
  confidence: EvidenceConfidence
}

export interface ExtractionReport {
  mode: ExtractionMode
  extractor: string | null
  diagnostics: string[]
}

export interface ImportRef {
  spec: string
  statement: string
  kind: ImportKind
  startLine: number
  endLine: number
  extractor: string
  confidence: EvidenceConfidence
}
```

`FileRecord` receives `extraction: ExtractionReport`. `AtlasLink.samples` remains for backward compatibility and standalone payload size. `AtlasLink` additionally receives optional `evidence?: SourceEvidence[]`, `observations?: number`, and `confidence?: EvidenceConfidence` fields so older hand-authored Atlas values remain assignable. Every link produced by `buildAtlas()` populates them. Evidence is deterministic, deduplicated by path/range/specifier, and capped at 12 entries per visible link. An aggregated link is `exact` only when every contributing observation is exact.

### 4. Resolution is a single classified operation

Extend `Resolver` with:

```ts
export type ImportResolution =
  | { kind: 'internal'; path: string }
  | { kind: 'external'; name: string }
  | { kind: 'system'; name: string }
  | { kind: 'unresolved'; spec: string }
  | { kind: 'ignored'; reason: string }

resolveImport(spec: string, fromDir: string, fromFile?: string): ImportResolution
```

Keep `resolve()` and `externalName()` as compatibility wrappers for existing callers and tests. `buildGraph()` must call `resolveImport()` once per import fact instead of resolving the same specifier repeatedly.

Classify `node:` imports as `system`. Classify unprefixed Node built-ins only for JS/TS-family source files, Go standard-library paths only for Go files, and `std`, `core`, `alloc`, `proc_macro`, and `test` roots only for Rust files. Do not apply Node built-in names to Python imports. Classify relative or configured-alias misses as `unresolved`, never as packages. System and unresolved imports are counted in coverage but do not create external package slabs in this release.

### 5. Coverage is a first-class Atlas contract

Add:

```ts
export interface AtlasCoverage {
  exactFiles: number
  heuristicFiles: number
  unsupportedFiles: number
  failedFiles: number
  importFacts: number
  internalFacts: number
  externalFacts: number
  systemFacts: number
  unresolvedFacts: number
  ignoredFacts: number
  rolledUpFiles: number
  hiddenExternals: number
}
```

Add `coverage: AtlasCoverage` to `Atlas`. Counts describe source facts before visible-edge aggregation, and the five resolution buckets must sum to `importFacts`. The UI must never label `internalFacts / importFacts` as generic “accuracy”; `internalFacts / (internalFacts + unresolvedFacts)` is internal resolution coverage.

### 6. Keep City coordinates and add deterministic Dependency coordinates

Add:

```ts
export type LayoutMode = 'city' | 'dependency'
export interface AtlasPosition { x: number; y: number }
```

`AtlasNode.x`, `y`, and `h` remain the City defaults for backward compatibility. Add optional `positions?: Record<LayoutMode, AtlasPosition>` so older Atlas JSON remains renderable; every node produced by `buildAtlas()` populates both positions. The renderer falls back to x/y when positions is absent.

Rename the existing implementation to `layoutCity` while keeping `layout` as an exported alias. Add `layoutDependency` in a focused new module. It must:

- be deterministic for the same nodes, links, and seed;
- initialize from stable, seeded positions;
- use import/external links as spring attraction;
- use containment links as weaker attraction;
- repel overlapping nodes;
- keep external nodes outside the local graph;
- use fixed iterations and rounded output;
- remain bounded at the existing 220-node default.

No Graphology or community-detection dependency is added in v1. A force layout that demonstrably uses dependency links is sufficient; explicit Louvain/Leiden communities remain a follow-up.

### 7. The UI exposes meaning and uncertainty

Add a City/Dependencies layout control. Switching changes renderer coordinates, rebuilds static layers and packets, fits the new projection, and preserves the selected node when possible.

The system map shows a compact coverage block containing exact, heuristic, unsupported, unresolved, rolled-up, and hidden-external counts. Selecting an arc shows its confidence, observation count, and evidence source locations before the sample text.

Search becomes navigation: the input has a label, shows a result count and at most 50 matching node buttons, and focusing a result selects and centers it. Results match path, label, role, and symbols.

### 8. Accessibility and responsive behavior are release requirements

- Give the canvas an accessible name and keyboard focus.
- Add keyboard pan, zoom, reset, and help text.
- Provide the searchable node list as the semantic alternative to canvas-only selection.
- Default packet flow to paused when `prefers-reduced-motion: reduce` is active.
- Preserve the system map below 860 px as a compact horizontal section instead of hiding it.
- At 390 px, header actions must wrap or scroll without clipping, Reset must remain reachable, controls must be at least 44 CSS px high, and primary text must be at least 11 CSS px.
- Desktop visual language and colors remain unchanged except for evidence/confidence affordances.

## Compatibility

- `buildAtlas(files)` remains synchronous.
- Folder, ZIP, GitHub, CLI JSON, and standalone HTML paths continue to share the same `Atlas` contract.
- Existing `AtlasNode.x/y/h`, `AtlasLink.samples`, `Resolver.resolve()`, and `Resolver.externalName()` remain valid.
- Existing JSON consumers receive additive fields only.
- Generated output remains deterministic for a fixed `now()`.

## Non-goals

- Call graphs, inheritance, routes, ORM/data-flow edges, or framework adapters.
- Tree-sitter adoption for every language.
- LLM-generated or LLM-corrected graph edges.
- Louvain/Leiden community detection.
- WebGL rendering or increasing the visible-node budget.
- Incremental caching, watch mode, Web Workers, hosted deployment, `npx` packaging, saved sessions, or PR-diff overlays.
- Replacing the city visual design.

## Acceptance Criteria

1. The known `Pick<AtlasLink, 'from' | 'to' | 'type'>` declaration produces no import fact and no `" | "` package.
2. The parser fixture corpus has 100% expected-spec recall and zero unexpected specs for its committed cases.
3. A syntax-error fixture falls back without aborting atlas generation, reports one parse diagnostic, and increments `heuristicFiles`.
4. Configured-alias and relative misses increment `unresolvedFacts`; they never create external slabs.
5. Node built-ins increment `systemFacts`; they never create external slabs.
6. Every visible import/external link has at least one evidence item, an observation count, and deterministic confidence.
7. The same inputs produce byte-identical Atlas JSON in both layout modes.
8. Dependency-linked nodes are measurably closer than the same unlinked control nodes in a committed layout test.
9. Search selecting a result focuses that node; City/Dependencies switches coordinates and preserves selection.
10. At 390×844, no header action is clipped and the system map remains reachable.
11. Reduced-motion users start with packet flow paused.
12. `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm -F @codeville/atlas-ui build`, `pnpm fidelity .`, and `pnpm realrepo . auto` pass.
