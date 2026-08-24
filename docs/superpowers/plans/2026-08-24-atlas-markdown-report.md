# Atlas Markdown Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, deterministic, hostile-input-safe Markdown report generated from the same Atlas used for CLI HTML/JSON output.

**Architecture:** A pure formatter in `@codeville/core` owns canonical Markdown generation. The CLI adds `--report <path>` and writes the report after the primary output from the already-built Atlas; no web UI or serialized Atlas change is introduced.

**Tech Stack:** TypeScript 5, Vitest 3, Node 20+, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-08-24-atlas-markdown-report-design.md`

## Global Constraints

- `--report <path>` is opt-in; omitting it writes no extra file, and `ask` does not accept it.
- `renderAtlasMarkdown(atlas: Atlas): string` is pure, deterministic, and ends with exactly one newline.
- The report includes no excerpts, import statements, AI summaries, symbols, credentials, environment values, raw HTML, or clickable local paths.
- Escape `&`, `<`, `>`, and table pipes; normalize CR/LF and tabs in every hostile table cell.
- Older payloads missing coverage, confidence, observations, or evidence render without throwing.
- The primary output is written before the report; both use the same in-memory Atlas and one scan/explain pass.
- Standalone HTML remains offline and existing `embedJson`/`escapeHtml` behavior is unchanged.
- Add no runtime dependency and do not change the serialized `Atlas` contract.
- Every production behavior is implemented test-first with captured RED and GREEN evidence.

---

### Task 1: Pure deterministic Markdown formatter

**Files:**
- Create: `packages/core/src/report-markdown.ts`
- Create: `packages/core/src/report-markdown.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `Atlas`, `AtlasCoverage`, `AtlasLink`, `AtlasNode`, and `SourceEvidence` from `packages/core/src/types.ts`.
- Produces: `renderAtlasMarkdown(atlas: Atlas): string`, exported from `@codeville/core`.

- [ ] **Step 1: Write the failing formatter contract tests**

Create `packages/core/src/report-markdown.test.ts` with a hand-written Atlas fixture containing:

```ts
const atlas: Atlas = {
  repo: {
    name: 'demo <script>alert(1)</script>',
    ref: 'main|next',
    generatedAt: '2026-08-24T00:00:00.000Z',
    note: 'line one\nline | two',
  },
  stats: { nodes: 3, sourceFiles: 2, lines: 30, links: 3, packages: 1 },
  areas: [
    { id: 'src', label: 'Source | code', color: '#000', count: 2 },
    { id: 'deps', label: 'Dependencies', color: '#111', count: 1 },
  ],
  nodes: [
    { id: 'b.ts', label: 'b.ts', path: 'b.ts', kind: 'file', area: 'src', role: 'service', contributes: [], lines: 20, bytes: 20, x: 0, y: 0, h: 1, excerpt: ['secret'], in: 1, out: 1, symbols: ['doNotPrint'], summary: 'do not print' },
    { id: 'ext:npm', label: 'npm', path: 'npm', kind: 'external', area: 'deps', role: 'dependency', contributes: [], lines: 0, bytes: 0, x: 1, y: 1, h: 1, excerpt: [], in: 1, out: 0 },
    { id: 'a.ts', label: 'a.ts', path: 'a.ts', kind: 'file', area: 'src', role: 'api\tendpoint', contributes: [], lines: 10, bytes: 10, x: 2, y: 2, h: 1, excerpt: ['password'], in: 0, out: 1 },
  ],
  links: [
    { from: 'a.ts', to: 'b.ts', type: 'containment', samples: ['do not print'] },
    { from: 'b.ts', to: 'ext:npm', type: 'external', samples: ['do not print'], confidence: 'heuristic', observations: 2, evidence: [
      { path: 'b|two.ts', startLine: 4, endLine: 5, specifier: 'npm', statement: 'do not print', extractor: 'line', confidence: 'heuristic' },
      { path: 'a.ts', startLine: 2, endLine: 2, specifier: 'npm', statement: 'do not print', extractor: 'babel', confidence: 'exact' },
    ] },
    { from: 'a.ts', to: 'b.ts', type: 'import', samples: ['do not print'], confidence: 'exact', observations: 1, evidence: [] },
  ],
  coverage: { exactFiles: 1, heuristicFiles: 1, unsupportedFiles: 0, failedFiles: 0, importFacts: 3, internalFacts: 1, externalFacts: 2, systemFacts: 0, unresolvedFacts: 0, ignoredFacts: 0, rolledUpFiles: 0, hiddenExternals: 0 },
}
```

Add four focused tests:

1. The exact section order is heading → metadata → scope → areas → nodes → links → footer, nodes render `a.ts` before `b.ts`, containment is absent, and the output ends with one newline.
2. Hostile strings render `&lt;script&gt;`, `main\|next`, `line one line \| two`, and `api endpoint`; the output contains neither raw `<script>`, `password`, `secret`, `doNotPrint`, nor import statements.
3. Evidence locations render in canonical `a.ts:2-2, b\|two.ts:4-5` order and unknown optional link fields render `unknown`.
4. Casting away `coverage` and reversing nodes/links/evidence does not throw; canonical node/link/evidence ordering is stable while explicit area order remains unchanged.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm vitest run packages/core/src/report-markdown.test.ts
```

Expected: FAIL because `./report-markdown.js` or `renderAtlasMarkdown` does not exist. Record the command, failure, and why it proves the missing formatter behavior.

- [ ] **Step 3: Implement the minimal formatter**

Create `packages/core/src/report-markdown.ts` with these focused helpers and no exported surface beyond the renderer:

```ts
import type { Atlas, AtlasCoverage, AtlasLink, AtlasNode, SourceEvidence } from './types.js'

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function cell(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
}

function evidenceLocation(evidence: SourceEvidence): string {
  return `${cell(evidence.path)}:${evidence.startLine}-${evidence.endLine}`
}

export function renderAtlasMarkdown(atlas: Atlas): string {
  // Build one string-array section at a time, using only fields allowed by the spec.
  // Read coverage through an optional legacy-compatible view.
  // Canonically sort copies of nodes, links, and evidence; never mutate atlas.
  // Join with '\n', trim only trailing blank lines, then append exactly one '\n'.
}
```

Use literal Markdown tables with these columns:

- Scope stats: `Metric | Value`
- Areas: `Area | Visible nodes`
- Nodes: `Path | Kind | Role | Area | Lines | Fan-in | Fan-out | Items`
- Links: `From | To | Type | Confidence | Observations | Evidence locations`

For legacy coverage, render one row `Coverage | unavailable`. For missing link confidence/observations/evidence render `unknown`, `unknown`, and `none` respectively. Exclude every containment link before sorting.

Add to `packages/core/src/index.ts`:

```ts
export { renderAtlasMarkdown } from './report-markdown.js'
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm vitest run packages/core/src/report-markdown.test.ts
```

Expected: all formatter tests PASS with pristine output.

- [ ] **Step 5: Run the core regression slice**

Run:

```bash
pnpm vitest run packages/core/src/report-markdown.test.ts packages/core/src/atlas.test.ts packages/core/src/hygiene.test.ts
```

Expected: PASS. Confirm the formatter did not change Atlas generation or source hygiene.

- [ ] **Step 6: Self-review and commit**

Check the diff for locale sorting, Atlas mutation, source-text fields, or raw HTML. Then:

```bash
git add packages/core/src/report-markdown.ts packages/core/src/report-markdown.test.ts packages/core/src/index.ts
git commit -m "feat: render a facts-only atlas report"
```

---

### Task 2: Opt-in CLI paired report output

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/args.test.ts`
- Modify: `README.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: `renderAtlasMarkdown(atlas)` from Task 1.
- Produces: `GenerateArgs.report?: string` and CLI syntax `--report <path>`.

- [ ] **Step 1: Write failing parser and integration tests**

In `packages/cli/src/args.test.ts`, extend the parser tests:

```ts
it('parses an opt-in report only for generate', () => {
  const args = parseArgs(['/tmp/demo-repo', '-o', '/tmp/atlas.json', '--report', '/tmp/atlas.md'])
  expect(args).toMatchObject({ command: 'generate' })
  expect(args && args.command === 'generate' ? args.report?.endsWith('/tmp/atlas.md') : false).toBe(true)
  expect(() => parseArgs(['ask', '/tmp/demo-repo', '--node', 'a.ts', '--fn', 'f', '--question', 'why', '--report', '/tmp/x.md'])).toThrow(/Unknown option --report/)
})

it('requires a report path', () => {
  expect(() => parseArgs(['/tmp/demo-repo', '--report'])).toThrow(/--report needs a value/)
})
```

Add an integration test that creates a temporary repo with `a.ts`, runs:

```ts
spawnSync('pnpm', [
  'exec', 'tsx', 'packages/cli/src/index.ts', dir,
  '-o', join(dir, 'atlas.json'),
  '--report', join(dir, 'atlas.md'),
], { cwd: REPO_ROOT, encoding: 'utf8' })
```

Assert exit `0`, both files exist, JSON parses, Markdown contains `# <temp-name> — Codeville Atlas`, `## Scope and coverage`, `## Visible nodes`, and the fixed generated-visible-slice footer. Add a second run without `--report` and assert no Markdown file appears.

- [ ] **Step 2: Run CLI tests and verify RED**

Run outside the IPC-restricted sandbox if `tsx` reports `listen EPERM`:

```bash
pnpm vitest run packages/cli/src/args.test.ts
```

Expected: FAIL because `--report` is unknown or the report file is not written. Record the expected feature-missing failure, not an IPC environment error.

- [ ] **Step 3: Implement parser and paired write**

In `packages/cli/src/index.ts`:

- Import `renderAtlasMarkdown` from core.
- Add `report?: string` to `GenerateArgs`.
- Add this usage line after `-o`:

```text
      --report <file>     additionally write a facts-only Markdown report
```

- Track `let report: string | undefined` in `parseArgs`.
- Parse only during `generate`:

```ts
else if (command === 'generate' && arg === '--report') report = next()
```

- Add resolved report only to the generated result:

```ts
...(report ? { report: resolve(process.cwd(), report) } : {}),
```

- After the existing primary-output write succeeds, add:

```ts
if (args.report) {
  await write(args.report, renderAtlasMarkdown(atlas))
  log(`wrote ${args.report}`)
}
```

Do not rebuild or re-explain the Atlas. Do not change `ask` parsing.

- [ ] **Step 4: Run CLI tests and verify GREEN**

Run:

```bash
pnpm vitest run packages/cli/src/args.test.ts
```

Expected: all parser and integration tests PASS with pristine output. If the sandbox denies tsx IPC, rerun the unchanged command with the approved unsandboxed test permission and record both outputs.

- [ ] **Step 5: Update user and architecture documentation**

In `README.md`, add under CLI quick start:

```bash
pnpm atlas . -o atlas.html --report atlas.md
```

State that the report is an opt-in, facts-only visible-slice snapshot and does not include source excerpts or AI prose.

In `docs/architecture.md`, add one paragraph under the shared `Atlas` contract: HTML, JSON, and Markdown consume the same analyzed Atlas; Markdown is a pure formatter and `--report` never triggers a second scan/explainer pass.

- [ ] **Step 6: Run full task verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm -F @codeville/atlas-ui build
```

Then run a smoke export after the bundle build:

```bash
pnpm atlas . -o /tmp/codeville-harvest-atlas.html --report /tmp/codeville-harvest-atlas.md
```

Verify both files are non-empty; `rg -n "https?://|fonts\.googleapis|<script[^>]+src=|fetch\(" /tmp/codeville-harvest-atlas.html` returns no matches; the Markdown includes the heading and generated visible-slice footer.

- [ ] **Step 7: Self-review and commit**

Confirm omission writes no report, `ask` rejects the option, the primary output precedes the report, and docs do not call it runtime truth. Then:

```bash
git add packages/cli/src/index.ts packages/cli/src/args.test.ts README.md docs/architecture.md
git commit -m "feat: write an opt-in atlas markdown report"
```

