# codeville — full-system review

You are a senior engineer reviewing **codeville**: point it at a repository and it emits an
interactive isometric atlas of that codebase as a single self-contained HTML file.

Review the whole path — process start, ingestion (folder / zip / GitHub link), analysis,
rendering, export, and every AI connector. Find what is actually broken, not what is
stylistically different from your preference.

## Stance

- **Run it before you judge it.** Do not report a bug you have not reproduced. A finding
  with no repro is a hypothesis; label it as one.
- **Every finding needs a concrete failure**: the input, the observed behaviour, the
  expected behaviour, and `file.ts:line`. "This could be cleaner" is not a finding.
- **Rank by blast radius**, not by how easy the fix looks. A silent wrong answer outranks
  a crash, because a crash gets noticed.
- **Do not restate the design back to me.** I wrote it. Tell me where it is wrong.
- Prefer `rg` over `grep` — this repo has previously contained raw NUL bytes in source,
  and `grep` reports those files as no-match with zero output.
- If you conclude something is fine, say so briefly and move on. Silence reads as "not
  checked."

## Get it running first

```bash
pnpm install
pnpm -F @codeville/atlas-ui build      # required: the CLI reads this bundle to export
pnpm test                              # 80 tests
pnpm typecheck
pnpm dev                               # http://localhost:5273

# CLI, on this repo itself
pnpm atlas . -o /tmp/self.html
open /tmp/self.html
```

Then exercise all three front doors in the browser: drag a folder onto the drop zone,
drag a `.zip`, and paste `honojs/hono` into the GitHub field.

## The contract

These are the promises the system makes. Each one, decide: **holds / broken / unproven**,
and show your evidence.

| # | Invariant | How to prove it |
|---|---|---|
| 1 | Same repo in → byte-identical atlas out | Run the CLI twice to `.json`, `diff` them (ignore `repo.generatedAt`). Then shuffle the input file order and confirm it still matches. |
| 2 | The exported `.html` makes **zero** network requests | Open it from `file://` with devtools Network open and throttling set to Offline. Anything that loads is a bug. |
| 3 | Nothing is ever written into the repo being analysed | `git status` inside the target repo after a run, including `--explain claude`. |
| 4 | codeville never handles a credential | Grep every adapter. The CLI adapters must shell out to an already-authenticated binary and read only stdout. |
| 5 | Folder and zip ingestion are 100% client-side | Drop a folder with devtools Network open. Any request is a bug. |
| 6 | The panel is fully populated with no configuration | Drop a repo with no API key set and no `--explain` flag. Every field must fill. |
| 7 | An AI adapter only *adds* prose; it never replaces a derived field | Compare a `--explain heuristic` atlas against `--explain claude` for the same repo. Only `summary` may differ. |
| 8 | A failing AI adapter degrades, never fails the build | Force failures (below) and confirm you still get a complete atlas. |

## Stage by stage

### 0 — Workspace and boot

`package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`

- Internal packages resolve through TS path aliases with no build step. Does that hold for
  every consumer — vitest, the Vite app, the standalone lib build, and `tsx` in the CLI?
  They each declare aliases separately. Can they drift?
- `@codeville/core` claims to be DOM-free and browser-safe. Verify: nothing in the
  `core` import graph reaches `node:*` at module scope. The node-only adapters use dynamic
  `import()` specifically for this — confirm the boundary is real and not accidental.
- The CLI imports core by *relative path* (`../../core/src/index.js`) rather than by
  package name. Is that deliberate or a latent break if the package is ever built?
- `apps/web/public/standalone/` is gitignored but required by the CLI's export path. Is
  the failure mode when it's missing clear and actionable?

### 1 — Ingestion

`apps/web/src/ingest/index.ts`, `apps/web/api/github.ts`, `apps/web/api/untar.ts`

**Folder drop.** `readEntries()` returns at most 100 entries per call and is pumped
recursively. Verify against a directory with >100 children — does it get all of them, and
can the recursion stack overflow on a deep tree? Note the walk is fully sequential
(`await` per file); assess whether a 5,000-file drop blocks the main thread past the point
of usability, and whether the "working" state actually paints before it starts.

**Zip.** `fflate.unzipSync` is synchronous and on the main thread. What happens with a
100MB archive? Is the filter applied before or after decompression — i.e. does the size
cap actually save any work?

**GitHub route.** This is the only server-side code in the project.
- `parseRepoInput` validates owner and name against `/^[\w.-]+$/`. **`ref` is not
  validated anywhere** before being interpolated into
  `https://codeload.github.com/${owner}/${name}/tar.gz/${ref}`. Determine the real reach:
  can a crafted `ref` traverse to a different repository, reach a non-tarball endpoint, or
  leave the codeload host? Rate it honestly — I believe it's confined to one host, but I
  want it confirmed or refuted, not assumed.
- The caps (`MAX_FILES`, `MAX_TOTAL_BYTES`, `MAX_ARCHIVE_BYTES`) — are they enforced
  *before* memory is committed, or after? `res.arrayBuffer()` buffers the entire archive
  before the size check runs. Is that a DoS on the deploy target?
- `gunzipSync` on untrusted input: what is the decompressed-size ceiling? Consider a zip
  bomb.
- `untar.ts` is a hand-written tar reader. Attack it: truncated archives, a declared size
  larger than the buffer, absolute paths, `../` in names, a pax header whose length prefix
  is malformed or negative. It must never read out of bounds or loop forever.

### 2 — Analysis

`packages/core/src/{scan,resolve,classify,graph,layout,jsonc,outline}.ts`, `src/lang/*`

- **Import extraction is regex-based, not parsed.** Map the false positives and false
  negatives on real code: imports inside template literals, block comments spanning the
  `from` clause, `export * as ns from`, `import x = require()`, re-exports, conditional
  requires. What is the actual accuracy on a repo you pick? A wrong edge is a wrong picture
  and the user cannot tell.
- **`resolve.ts`** implements a subset of module resolution. Where does it silently
  disagree with the bundler — `exports` maps, `baseUrl` without `paths`, multiple `paths`
  candidates, extensionless directory imports, monorepo cross-package specifiers? Note that
  an unresolved *aliased* specifier is deliberately dropped rather than becoming a phantom
  package; verify that logic can't drop a genuine external.
- **`jsonc.ts`** exists because a regex comment-stripper ate `"@/*"` through `"**/*.ts"`
  and silently deleted the paths map. Re-audit the replacement scanner: escapes at end of
  input, unterminated strings, a lone `/`, CRLF, BOM.
- **`classify.ts`** is an ordered first-match rule list. Find paths where the order gives
  a clearly wrong role, and check `CONTENT_HINTS` — that condition is convoluted and I am
  not confident it does what it reads like it does.
- **`graph.ts`** — the node budget. It reduces `rollupDepth` before folding whole areas.
  Prove both loops terminate for any input, including a flat repo where depth reduction
  achieves nothing. Confirm `DENSE_SHARE` (0.7) can't fold a source tree, and that
  `nextToCollapse` can't oscillate. Check `parentId`'s containment walk is O(depth) not
  O(n·depth) on a wide tree.
- **`layout.ts`** — relaxation is O(n²) per iteration × 120 iterations. At the 220-node cap
  that's ~2.9M distance checks per build. Measure it. Then reason about what happens if
  someone raises `--max-nodes` to 2000.
- Determinism is load-bearing (invariant 1). Audit for anything order- or
  environment-dependent: `Map`/`Set` iteration fed by non-deterministic input,
  `toLocaleString` under a different locale, float accumulation differing across
  architectures.

### 3 — Rendering

`packages/atlas-ui/src/{iso,renderer}.ts`, `src/panels/*`, `src/theme.css`

- **Pick-buffer hit testing** encodes node index as an RGB colour and reads it back with
  `getImageData`. Verify the round-trip survives: antialiased edges, `devicePixelRatio`
  fractional values, and more than 2^24 nodes (can that be reached?). Colour-managed
  canvases have historically perturbed low-order bits — confirm the encoding is safe on
  the browsers you can test.
- **First paint does not depend on `requestAnimationFrame`** — RAF never fires in a
  background tab, which is exactly how a downloaded HTML file gets opened. `resize()`,
  `setView()` and `nodeAt()` all call `draw()` synchronously. Check this doesn't cause
  redundant full re-renders during a drag (which sets `layersDirty` every pointermove).
  Measure frames during a sustained pan.
- **Layer invalidation.** `layersDirty` gates re-rendering three offscreen canvases. Find a
  state change that should invalidate and doesn't, or one that invalidates needlessly.
- **Painter's algorithm** sorts on `x + y` only, ignoring height and footprint. Construct a
  case where a tall block is drawn behind a short one it should occlude.
- **Memory.** Four canvases at DPR 2 on a 4K display. Are they released on `dispose()`?
  Does repeated resizing leak?
- **Panels.** `Inspect.tsx` rebuilds `byId` and filters all links on every render. At 220
  nodes / 836 links, is that fine or is it janking hover? Measure rather than assume.
- **Accessibility.** The map is canvas-only with no keyboard path. Assess honestly: is any
  of this reachable without a mouse, and does the surrounding chrome at least behave?

### 4 — Export

`packages/atlas-ui/src/standalone-html.ts`, `apps/web/src/export.ts`

- The atlas JSON is inlined into a `<script>` tag. `embedJson` escapes `<`, `>`, U+2028 and
  U+2029. **Try to break out of that script tag using content from an analysed repository**
  — file paths, source excerpts, or import statements are all attacker-controlled if I
  point codeville at a hostile repo. This is the highest-value thing to attack in the
  codebase.
- Confirm the same for `escapeHtml` on `repo.name`, which comes from `package.json`.
- The export swaps React for Preact via build alias while the dev app uses real React.
  Same components, two runtimes. Find behavioural divergence — `useCallback` identity,
  effect ordering, event delegation, `StrictMode` double-invoke.
- Is there an upper bound on export size? A large repo's excerpts could produce a file
  no browser wants to parse.

### 5 — AI connectors

`packages/core/src/explain/{index,heuristic,adapters}.ts`, cache in `packages/cli/src/index.ts`

- **The interface.** `Explainer` is `{ id, fingerprint?, explain(batch) }`. Is that enough
  to write a real third-party adapter — no cancellation, no per-item error channel, no
  streaming? Say what's missing.
- **`cliExplainer`** spawns via `execFile` (no shell) with the prompt as a single argv
  entry. Confirm no shell interpolation is reachable, then check: argv length limits on a
  large prompt, the 120s timeout, `maxBuffer` overflow behaviour, and whether a hung child
  is actually killed or leaks a process.
- **Prompt injection.** The prompt is built from repository content — path, imports, and
  up to 4KB of source. A hostile repo can address the model directly. The output becomes a
  `summary` rendered in the panel. Trace the full path and determine the worst realistic
  outcome. Then check `clean()` — is 700 chars and a sentence-boundary trim sufficient
  sanitisation for something that lands in the DOM?
- **`apiKeyExplainer`** reads `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`. Confirm keys cannot
  reach the atlas, the cache, logs, or an error message. Check the error paths — a 401 and
  a 429 currently look identical to the user (both become a silent heuristic fallback).
  Is that acceptable?
- **`moduleExplainer`** dynamically imports an arbitrary user-supplied path. That is
  intended, but document the trust boundary clearly.
- **The cache.** Keyed on `sha256(explainSpec, fingerprint, path, sourceDigest)` and stored
  at `~/.cache/codeville/<sha256(root)>.json`. Verify: a changed prompt invalidates (that's
  what `fingerprint` is for), a changed file invalidates, two different repos cannot
  collide, and a corrupt or partially-written cache file degrades rather than crashes. Is
  the write atomic? Two concurrent CLI runs on the same repo — what happens?
- **`sourceDigest` / `outline`** decides what the model sees. Check the truncation boundary
  can't split a multi-byte character, and that `outline`'s regex set doesn't
  catastrophically backtrack on adversarial input.
- **Fallback.** When an adapter returns nothing for a node, heuristic prose fills in. Prove
  a partial failure yields a complete atlas with no visual discontinuity.

## Known-thin areas — go deeper, don't just rediscover

I already know these are approximations. Tell me where they break *in practice*, with a
real repo, not that they exist:

1. Regex import extraction instead of a parser.
2. Heuristic path-based role classification.
3. The node budget and rollup heuristics — tuned on two repos (a Next.js app and hono).
4. `MAX_EXTERNALS = 40` and the excerpt cap of 10 lines silently drop information.
5. No CI, no lint config, no E2E test. The browser interaction path is verified only by
   hand.
6. Only TS/JS, Python, Go and Rust get import edges. Everything else renders as an
   unconnected block.

## Adversarial inputs — actually run these

- An empty directory. A directory with one file. A single 10MB file.
- A repo with a symlink cycle; a symlink pointing outside the root.
- Filenames with spaces, unicode, RTL overrides, `../` sequences, 255-char names.
- A file with CRLF; a UTF-16 file; a file with a BOM; a file containing a NUL byte.
- A `tsconfig.json` with circular `extends`, or `paths` mapping to `../../` outside root.
- Two files that import each other; a file that imports itself.
- A repo where every file is a test (should fold); one where 60% are tests (must not fold).
- A private GitHub repo, a nonexistent one, a valid one with a bad `ref`.
- Kill the network mid-GitHub-fetch.
- `--explain claude` with the `claude` binary absent, unauthenticated, and hanging forever.
- `--max-nodes 1` and `--max-nodes 100000`.

## Report format

Group by severity. For each finding:

```
[CRITICAL|HIGH|MEDIUM|LOW]  <one-line claim>
  where:     path/to/file.ts:LINE
  repro:     exact command or click sequence
  observed:  what happened
  expected:  what should have happened
  why:       the consequence, in one sentence
  fix:       the smallest correct change
```

Severity means: **CRITICAL** = data loss, RCE/XSS, or a silently wrong atlas the user
would trust. **HIGH** = a documented invariant is broken. **MEDIUM** = wrong under
realistic-but-uncommon input. **LOW** = correct but fragile.

End with:

1. The single change that would most improve reliability.
2. Anything you were unable to verify, and what you'd need to verify it.
3. Which of the 8 contract invariants you proved, disproved, or left unproven.
