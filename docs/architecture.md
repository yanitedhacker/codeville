# How the picture is built

Everything meets at one type, `Atlas` in `packages/core/src/types.ts`. The analyzer writes it, the renderer reads it, export inlines it. Nothing else crosses that line.

```
packages/core/       analyzer — pure TS, no DOM, runs in the browser and in node
  scan.ts              files in → records out, with the ignore rules
  lang/                per-language import extractors (ts/js, python, go, rust)
  resolve.ts           specifier → repo path or package, tsconfig `paths` aware
  classify.ts          path → role ("api endpoint", "service logic", …)
  graph.ts             nodes, links, areas, rollup, node budget
  layout.ts            deterministic seeded layout — never Math.random
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

## Projection

Standard 30° isometric: `sx = (x - y)·cos30`, `sy = (x + y)·sin30 - z`. Painter's algorithm on `x + y` (`depthKey` in `packages/atlas-ui/src/iso.ts`). Block height is `log10(lines)`, deliberately shallow: a 5,000-line file reads about 3× a 10-line one, not 500×.

## Layout

Deterministic by construction: seeded PRNG, fixed iteration count, stable sort keys, coordinates rounded. The same repo produces a byte-identical atlas every time, which `layout.test.ts` and `atlas.test.ts` both pin. Areas get discs on a ring, files fill each disc on a phyllotaxis spiral, packages ring the outside, then a short repulsion relax runs.

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
