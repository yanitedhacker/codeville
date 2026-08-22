# How the picture is built

Everything meets at one type, `Atlas` in `packages/core/src/types.ts`. The analyzer writes it, the renderer reads it, export inlines it. Nothing else crosses that line.

```
packages/core/       analyzer — pure TS, no DOM, runs in the browser and in node
  scan.ts              files in → records out, with the ignore rules
  lang/                extractors: Babel for JS/TS, line scanners elsewhere
  resolve.ts           specifier → ImportResolution, tsconfig `paths` aware
  classify.ts          path → role ("api endpoint", "service logic", …)
  graph.ts             nodes, links, areas, rollup, evidence, coverage
  layout.ts            deterministic seeded City layout — never Math.random
  layout-dependency.ts dependency layout — import springs, weaker containment
  explain/             Explainer interface + heuristic and AI adapters
packages/atlas-ui/   renderer — canvas2d + React, also builds the export bundle
packages/cli/        the codeville command
apps/web/            Vite app: drop zone, GitHub input, export button
```

Three front doors converge on `buildAtlas(files)`:

| Input | Path | Network |
| --- | --- | --- |
| Folder drag-drop | `DataTransferItem` walk | none — entirely in your browser |
| `.zip` | `fflate` unzip | none |
| GitHub URL | `apps/web/api/github.ts` | fetches the tarball server-side |

The GitHub route exists because `codeload.github.com` serves no CORS headers. Caps and `ref` rules: [security.md](security.md).

## Extraction

JS and TS files use `@babel/parser` for exact extraction when the path ends in `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, or `.cts`. The extractor walks the AST and records static imports, side-effect imports, `export ... from`, literal dynamic imports, literal `require()` calls, and `import x = require("x")`. Static ESM facts are exact. Literal `require()` facts are heuristic because the identifier can be shadowed.

When Babel cannot parse a file, the analyzer falls back to the TypeScript line scanner, marks the file `heuristic`, and records one parse diagnostic. Atlas generation does not stop.

Python, Go, Rust, Vue, Svelte, and Astro keep language-specific line scanners and are `heuristic` in v1. Accepted source extensions without an extractor are `unsupported`: the file can still become a block, but it contributes no import facts.

## Why ripgrep is not a parser

Use `rg` while you navigate the repository or audit a benchmark. Do not treat its output as an import fact. The analyzer has no runtime ripgrep dependency, and it never builds edges from a regex tool call. Browser folder and zip ingest run entirely in the page and cannot depend on a host binary.

## Import resolution

`Resolver.resolveImport(spec, fromDir, fromFile)` classifies each import fact once:

| `ImportResolution.kind` | Meaning |
| --- | --- |
| `internal` | Specifier maps to a scanned repository path |
| `external` | Specifier is a third-party package |
| `system` | Specifier is a language standard library (`node:` / Node built-ins on JS/TS, Go stdlib on `.go`, Rust `std`/`core`/`alloc`/`proc_macro`/`test` on `.rs`) |
| `unresolved` | Relative or configured-alias specifier that does not hit a file |
| `ignored` | Specifier is neither a package nor a resolvable repository path |

`resolve()` and `externalName()` remain compatibility wrappers. System and unresolved facts increment coverage and do not create external package slabs. Relative and alias misses stay `unresolved`; they never become packages.

## Evidence aggregation

Every visible import or external link carries `observations`, `confidence`, and `evidence`. Evidence is deterministic, deduplicated by path, range, and specifier, and capped at 12 items per visible link. An aggregated link is `exact` only when every contributing observation is exact. One heuristic observation makes the link heuristic. `AtlasLink.samples` stays for older consumers and standalone payload size.

## Coverage

`Atlas.coverage` counts source facts before visible-edge aggregation. The five resolution buckets sum to `importFacts`. Do not label `internalFacts / importFacts` as generic quality. Internal resolution coverage is `internalFacts / (internalFacts + unresolvedFacts)`.

| Field | Meaning |
| --- | --- |
| `exactFiles` | Source files whose extractor reported `exact` |
| `heuristicFiles` | Source files extracted by a line scanner or Babel fallback |
| `unsupportedFiles` | Accepted source files with no extractor |
| `failedFiles` | Extractor threw; the file contributes no facts |
| `importFacts` | Import statements recorded before roll-up |
| `internalFacts` | Facts resolved to a repository path |
| `externalFacts` | Facts classified as packages |
| `systemFacts` | Facts classified as standard-library imports |
| `unresolvedFacts` | Relative or alias facts that missed a file |
| `ignoredFacts` | Facts that are neither packages nor resolvable paths |
| `rolledUpFiles` | Source files folded into a directory slab |
| `hiddenExternals` | Distinct packages omitted after the external cap |

## City and dependency projections

City geometry is filesystem and package spatial memory: area discs, phyllotaxis file placement, and an outer package ring. Dependency geometry is import-derived proximity: files that import each other sit closer than files that only share a folder.

`AtlasNode.x`, `y`, and `h` remain the City defaults so older JSON still renders. `AtlasNode.positions` stores both `city` and `dependency`. The renderer reads `node.positions?.[mode]` when switching layouts (`packages/atlas-ui/src/renderer.ts`). The header exposes a City / Dependencies control (`packages/atlas-ui/src/panels/Header.tsx`). Switching rebuilds the canvas from the stored projection; it does not recompute layout.

## Projection

Standard 30° isometric: `sx = (x - y)·cos30`, `sy = (x + y)·sin30 - z`. Painter's algorithm on `x + y` (`depthKey` in `packages/atlas-ui/src/iso.ts`). Block height is `log10(lines)`, deliberately shallow: a 5,000-line file reads about 3× a 10-line one, not 500×.

## Layout

**City** — Deterministic by construction: seeded PRNG, fixed iteration count, stable sort keys, coordinates rounded. The same repo produces a byte-identical atlas every time, which `layout.test.ts` and `atlas.test.ts` both pin. Areas get discs on a ring, files fill each disc on a phyllotaxis spiral, packages ring the outside, then a short repulsion relax runs.

**Dependency** — Same determinism guarantees (`packages/core/src/layout-dependency.ts`): seeded PRNG, fixed iteration count, stable sort keys, rounded coordinates. Import and external springs pull related nodes together; containment is weaker than City. Externals sit outside the local cluster: each external is farther from the local centroid than the farthest local. After placement, locals and externals are bbox-shifted so the combined map is centered.

## Rendering

One canvas, two offscreen layers: static background (grid + arcs) and static foreground (blocks + labels). Only the packets redraw per frame. First paint and hit-testing both run synchronously rather than waiting on `requestAnimationFrame`, because RAF never fires in a background tab, which is how a downloaded `.html` gets opened.

Hit testing is analytic. `AtlasRenderer.nodeAt` maps the pointer into layout space and calls `hitNode` in `packages/atlas-ui/src/iso.ts`: walk `ordered` back to front, test the pointer against the three quads from `slabFaces` (top, left, right). First containing quad wins. A miss is `null`.

## The slice

Not every file earns a block. `node_modules`, build output, lockfiles, `.env`, and nested worktree checkouts are dropped outright. Deep directories group into one block. Areas that are overwhelmingly reference material (≥70% tests, migrations, docs, ops scripts) fold to a single block. When a repo still exceeds the node budget, codeville groups *deeper* before it sacrifices whole areas: folding `src/` to save room while a benchmarks folder stays expanded destroys the thing you came to look at. The left rail always says what was left out.

`stats.packages` is the true distinct count. At most 40 package slabs are drawn (`MAX_EXTERNALS`). The node budget (`--max-nodes`, default 220) includes those externals.

## The explainer

The panel is fully populated with zero configuration. Role, area, fan-in, fan-out, source excerpt and packet samples are all read off the graph: deterministic, offline, free.

An AI adapter only ever adds a prose `WHAT IT DOES` paragraph on top. It never replaces a field, and if it fails or skips a node, the heuristic description stands. The same heuristic pass runs in the browser, so a dropped folder and a CLI run fill the panel identically.

What an adapter gets to read is the head of the file plus the names it declares further down (`outline.ts`). For a 5,000-line module the first ten lines are all imports, which tells a model nothing; the list of its exported functions tells it almost everything.

```ts
interface Explainer {
  id: string
  explain(batch: ExplainRequest[]): Promise<Map<string, Explanation>>
}
```

Results cache to `~/.cache/codeville/<repo-hash>.json`, keyed by content hash. Nothing is ever written into the repo you point it at.

There is a source-hygiene tripwire: a stray NUL byte once made `scan()` classify codeville's own CLI as a binary and silently drop it from its own atlas. The detector was right; the source was wrong. `hygiene.test.ts` makes sure that cannot recur quietly.
