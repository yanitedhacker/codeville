# codeville

Drop a repo in. Get an interactive isometric atlas of it out.

Every source file becomes a block on a plan, every import becomes an arc, and the dots
travelling those arcs are the literal import statements — click one and read it.

```bash
pnpm install
pnpm -F @codeville/atlas-ui build   # builds the single-file export bundle
pnpm dev                            # http://localhost:5273
```

Then drop a folder on the page, or paste `owner/repo`.

## The three front doors

| Input | Path | Network |
|---|---|---|
| Folder drag-drop | `DataTransferItem` walk | none — entirely in your browser |
| `.zip` | `fflate` unzip | none |
| GitHub URL | `apps/web/api/github.ts` | fetches the tarball server-side |

The GitHub route exists for one reason: `codeload.github.com` serves no CORS headers, so
a browser genuinely cannot fetch a repo tarball on its own. It is ~150 lines, has no
dependencies beyond `node:zlib`, and is the same default-export a Vercel function wants,
so it deploys unchanged.

All three converge on `buildAtlas(files)`. One analyzer, three doors.

## CLI

```bash
pnpm atlas ~/code/my-repo -o atlases/my-repo.html
pnpm atlas ~/code/my-repo --explain claude -j 10 -o atlases/my-repo.html
```

```
codeville <path-to-repo> [options]

  -o, --out <file>       output path (.html or .json)   default: <name>-atlas.html
  -e, --explain <spec>   heuristic | codex | claude | openai | anthropic
                         | cli:<command> | module:<path>   default: heuristic
      --max-nodes <n>    visible node budget before rollup   default: 220
      --exclude <paths>  comma-separated path prefixes to drop
  -j, --concurrency <n>  parallel explainer calls   default: 4 (cli) / 6 (api)
      --no-cache         ignore the explanation cache in ~/.cache/codeville
```

The `.html` output is one self-contained file (~300KB for a 400-file repo): renderer,
styles and data inlined, zero network requests. It opens offline from `file://`.

## Layout

```
packages/core/       analyzer — pure TS, no DOM, runs in the browser and in node
  scan.ts              files in -> records out, with the ignore rules
  lang/                per-language import extractors (ts/js, python, go, rust)
  resolve.ts           specifier -> repo path | package, tsconfig `paths` aware
  classify.ts          path -> role ("api endpoint", "service logic", ...)
  graph.ts             nodes, links, areas, rollup, node budget
  layout.ts            deterministic seeded layout — never Math.random
  explain/             Explainer interface + heuristic and AI adapters
packages/atlas-ui/   renderer — canvas2d + React, also builds the export bundle
packages/cli/        the codeville command
apps/web/            Vite app: drop zone, GitHub input, export button
atlases/             generated output
```

Everything meets at one type, `Atlas` in `packages/core/src/types.ts`. The analyzer writes
it, the renderer reads it, and export just inlines it. Nothing else crosses that line.

## How the picture is built

**Projection.** Standard 30° isometric, `sx = (x - y)·cos30`, `sy = (x + y)·sin30 - z`,
painter's algorithm on `x + y`. Block height is `log10(lines)`, deliberately shallow — a
5,000-line file reads about 3× a 10-line one, not 500×.

**Layout** is deterministic by construction: seeded PRNG, fixed iteration count, stable
sort keys, coordinates rounded. The same repo produces a byte-identical atlas every time,
which `layout.test.ts` and `atlas.test.ts` both pin. Areas get discs on a ring, files fill
each disc on a phyllotaxis spiral, packages ring the outside, then a short repulsion relax
runs.

**Rendering.** One canvas, three offscreen layers — static background (grid + arcs),
static foreground (blocks + labels), and a pick buffer that colours each block by index so
hit-testing is an exact `getImageData` read rather than polygon math. Only the packets
redraw per frame. First paint and hit-testing both run synchronously rather than waiting
on `requestAnimationFrame`, because RAF never fires in a background tab — which is exactly
how a downloaded `.html` gets opened.

**The slice.** Not every file earns a block. `node_modules`, build output, lockfiles,
`.env`, and nested worktree checkouts are dropped outright. Deep directories group into
one block. Areas that are overwhelmingly reference material (≥70% tests, migrations, docs,
ops scripts) fold to a single block. When a repo still exceeds the node budget, codeville
groups *deeper* before it sacrifices whole areas — folding `src/` to save room while a
benchmarks folder stays expanded destroys the thing you came to look at. The left rail
always says what was left out.

## The explainer

The panel is fully populated with zero configuration. Role, area, fan-in, fan-out, source
excerpt and packet samples are all read off the graph — deterministic, offline, free.

An AI adapter only ever *adds* a prose `WHAT IT DOES` paragraph on top. It never replaces
a field, and if it fails or skips a node, the heuristic description stands. The same
heuristic pass runs in the browser, so a dropped folder and a CLI run fill the panel
identically.

What an adapter gets to read is the head of the file plus the names it declares further
down (`outline.ts`). For a 5,000-line module the first ten lines are all imports, which
tells a model nothing; the list of its ~95 exported functions tells it almost everything.

```ts
interface Explainer {
  id: string
  explain(batch: ExplainRequest[]): Promise<Map<string, Explanation>>
}
```

| `--explain` | Auth | Runs in |
|---|---|---|
| `heuristic` | none | browser + node (default) |
| `codex` / `claude` / `cli:<cmd>` | a CLI **you already signed into** | node |
| `openai` / `anthropic` | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | node |
| `module:<path>` | your file, your auth | node |

Results cache to `~/.cache/codeville/<repo-hash>.json`, keyed by content hash, so re-runs
are free and atlases stay reproducible. Nothing is ever written into the repo you point it
at.

**On subscription auth:** the `cli` adapter is how you ride a ChatGPT or Claude
subscription instead of paying per token — codeville shells out to your own authenticated
CLI and never handles a credential. There is deliberately no built-in "sign in with
ChatGPT": doing that from a third-party app means impersonating the Codex client against
an undocumented private endpoint. It is against OpenAI's terms and it breaks the week they
rotate anything. `module:<path>` is the slot if you want to own that decision yourself.

## Tests

```bash
pnpm test        # 76 tests
pnpm typecheck
```

Covering the ignore rules (including nested worktree checkouts, which would otherwise
double every node), import extraction per language, `tsconfig` alias resolution, role
classification, rollup and budget behaviour, layout determinism, and the projection math.

There is also a source-hygiene tripwire: a stray NUL byte once made `scan()` classify
codeville's own CLI as a binary and silently drop it from its own atlas. The detector was
right; the source was wrong. `hygiene.test.ts` makes sure that cannot recur quietly.
