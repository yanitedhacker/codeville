# Trustworthy Atlas v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace misleading TypeScript/JavaScript import scanning and filesystem-only geometry with an evidence-backed graph, honest coverage reporting, a dependency-derived layout, and an accessible responsive inspection workflow.

**Architecture:** Preserve buildAtlas(files) as the synchronous, deterministic boundary used by Node, the browser, JSON, and standalone HTML. Add a Babel-backed TS/JS extractor behind the existing language dispatcher, classify every import resolution once, carry evidence and coverage into Atlas, compute City and Dependency positions in core, and let the canvas renderer switch between those stored projections.

**Tech Stack:** TypeScript 5.8, pnpm 10, Vitest 3, @babel/parser 7.29.8, React 19, Canvas 2D, Vite 7.

**Spec:** docs/superpowers/specs/2026-08-22-trustworthy-atlas-v1-design.md

## Global Constraints

- Node remains >=20.19 and pnpm remains 10.12.1.
- Add exactly one runtime dependency: @babel/parser 7.29.8 in packages/core/package.json.
- Do not add ripgrep, Graphology, Tree-sitter, a Web Worker, Playwright, or an LLM graph dependency.
- buildAtlas(files) remains synchronous and deterministic.
- Existing AtlasNode.x/y/h, AtlasLink.samples, Resolver.resolve(), and Resolver.externalName() remain compatible.
- Folder, ZIP, GitHub, CLI, JSON, and standalone HTML continue to consume one Atlas contract.
- Do not touch or commit .mission-grade/.
- Do not change the default visible-node budget of 220 or the external-node cap of 40.
- Do not implement anything listed under Non-goals in the spec.
- Use rg or rg --files for repository discovery. Runtime graph facts must come from parsers and resolvers, never rg output.
- Use test-driven changes and one focused commit per task.
- Do not push, open a PR, or modify unrelated working-tree changes.

---

## Grok 4.6 Launch Prompt

Paste this into Grok Build with model grok-4.6 and reasoning effort high. Use xhigh only if Task 5 or a final regression remains unresolved after one evidence-driven debugging pass.

    /goal Implement Trustworthy Atlas v1 in this repository. Read AGENTS.md, docs/architecture.md, docs/superpowers/specs/2026-08-22-trustworthy-atlas-v1-design.md, and docs/superpowers/plans/2026-08-22-grok-4-6-trustworthy-atlas-v1.md before editing. Execute the plan in order and keep its checkboxes current. Use rg for discovery, but never use regex or rg output as authoritative parser facts. Preserve .mission-grade/ and all unrelated user changes. Work test-first, make one focused commit after each task, and do not push. Read-only reconnaissance may run in parallel; all writes touching packages/core/src/types.ts, graph.ts, atlas.ts, or renderer.ts must be sequential. At any unexpected failure, stop editing, record the observed command and error, inspect the smallest relevant surface, revise the current step, and only then continue. Do not declare completion until every final verification command passes and the 390x844, 820x900, and 1280x720 UI checks are recorded. Return a concise ledger of commits, tests, coverage numbers, bundle size, and any acceptance criterion that did not pass.

### Why this prompt fits Grok 4.6

The official Grok 4.6 model card reports strong long-horizon IDE work and visual project performance, with high as the default reasoning effort and additional gains at xhigh. It also reports materially lower success on terminal-only and mergeability benchmarks than on Cursor-style tasks. The prompt therefore gives the model one sustained goal while constraining it with exact interfaces, TDD gates, small commits, and explicit terminal/UI verification.

Official references:

- https://media.x.ai/v1/website/card-4p6-4cd2dc57.pdf
- https://docs.x.ai/developers/grok-4-6
- https://x.ai/news/grok-build-cli
- https://x.ai/news/introducing-goal

## File Map

### Files created

- packages/core/src/lang/typescript-heuristic.ts: current line scanner retained only for explicit fallback and SFC heuristics.
- packages/core/src/lang/system.ts: deterministic Node built-in classification without Node-only runtime imports.
- packages/core/src/layout-dependency.ts: fixed-iteration deterministic dependency force layout.
- packages/atlas-ui/src/search.ts: pure node search and ranking.
- packages/atlas-ui/src/search.test.ts: search ordering and cap tests.
- packages/atlas-ui/src/keyboard.ts: pure key-to-renderer-command mapping and reduced-motion default helper.
- packages/atlas-ui/src/keyboard.test.ts: accessibility command tests.

### Files modified

- packages/core/package.json: direct @babel/parser dependency.
- pnpm-lock.yaml: direct dependency importer update.
- packages/core/src/types.ts: extraction, evidence, coverage, position, and layout contracts.
- packages/core/src/lang/typescript.ts: Babel AST extraction.
- packages/core/src/lang/python.ts: required provenance on heuristic Python facts.
- packages/core/src/lang/go.ts: required provenance on heuristic Go facts.
- packages/core/src/lang/rust.ts: required provenance on heuristic Rust facts.
- packages/core/src/lang/index.ts: ExtractionResult dispatcher and compatibility wrapper.
- packages/core/src/lang/typescript.test.ts: parser precision and fallback corpus.
- packages/core/src/scan.ts: attach ExtractionReport to every FileRecord.
- packages/core/src/scan.test.ts: exact, heuristic, unsupported, and fallback accounting.
- packages/core/src/resolve.ts: resolveImport discriminated result.
- packages/core/src/resolve.test.ts: internal, external, system, unresolved, and ignored cases.
- packages/core/src/graph.ts: resolve each fact once; aggregate evidence and coverage.
- packages/core/src/atlas.ts: expose coverage and both position sets.
- packages/core/src/atlas.test.ts: end-to-end truth-contract assertions.
- packages/core/src/fidelity.test.ts: no false external and exact graph evidence.
- packages/core/src/layout.ts: export layoutCity and retain layout alias.
- packages/core/src/layout.test.ts: City compatibility and position contract.
- packages/core/src/index.ts: export new contracts and layout functions.
- scripts/fidelity.ts: print extraction and resolution coverage separately.
- scripts/realrepo.ts: use resolveImport and report classified facts.
- packages/atlas-ui/src/renderer.ts: switch stored layouts; keyboard pan/zoom methods.
- packages/atlas-ui/src/Atlas.tsx: layout state, accessible canvas, search selection, reduced motion.
- packages/atlas-ui/src/panels/Header.tsx: layout control and non-clipping actions.
- packages/atlas-ui/src/panels/SystemMap.tsx: labeled search, results, and coverage block.
- packages/atlas-ui/src/panels/Inspect.tsx: confidence, observations, and source evidence.
- packages/atlas-ui/src/theme.css: coverage/search styles, focus states, touch targets, and narrow layout.
- apps/web/src/App.tsx: accurate landing copy.
- README.md: accurate product claim and coverage explanation.
- docs/architecture.md: parser, evidence, coverage, and dual-layout architecture.

## Execution Preflight

- [ ] Read AGENTS.md, the spec, this plan, and docs/architecture.md completely.
- [ ] Run git status --short --branch. Preserve .mission-grade/ and any unrelated change.
- [ ] If currently on main, create yanitedhacker/trustworthy-atlas-v1 with git switch -c yanitedhacker/trustworthy-atlas-v1. If that branch exists, switch to it without resetting files.
- [ ] If the spec and plan are untracked, commit only those two files:

    git add docs/superpowers/specs/2026-08-22-trustworthy-atlas-v1-design.md docs/superpowers/plans/2026-08-22-grok-4-6-trustworthy-atlas-v1.md
    git commit -m "docs: plan trustworthy atlas v1"

- [ ] Establish a baseline:

    pnpm test
    pnpm typecheck
    pnpm build

Expected: all baseline commands pass. If a command fails, stop before implementation, determine whether the failure exists on main, and record the evidence. Do not edit product code to mask a sandbox IPC error.

## Task 1: Parser-backed extraction and explicit extraction reports

**Files:**

- Create: packages/core/src/lang/typescript-heuristic.ts
- Modify: packages/core/package.json
- Modify: pnpm-lock.yaml
- Modify: packages/core/src/types.ts
- Modify: packages/core/src/lang/typescript.ts
- Modify: packages/core/src/lang/python.ts
- Modify: packages/core/src/lang/go.ts
- Modify: packages/core/src/lang/rust.ts
- Modify: packages/core/src/lang/index.ts
- Modify: packages/core/src/lang/typescript.test.ts
- Modify: packages/core/src/scan.ts
- Modify: packages/core/src/scan.test.ts

**Interfaces:**

- Consumes: VirtualFile and the existing synchronous scan(files) path.
- Produces: ExtractionResult, ExtractionReport, enriched ImportRef, and FileRecord.extraction for Tasks 2–4.

- [ ] **Step 1: Add the parser dependency**

Run:

    pnpm --filter @codeville/core add --save-exact @babel/parser@7.29.8

Expected: packages/core/package.json lists @babel/parser under dependencies and pnpm-lock.yaml records it as a direct core importer. No second new package appears in the core dependency list.

- [ ] **Step 2: Move the current scanner without changing behavior**

Copy the implementation currently in packages/core/src/lang/typescript.ts into packages/core/src/lang/typescript-heuristic.ts. Rename its public function:

    export function extractTypescriptHeuristic(text: string): ImportRef[]

Keep normalize() exported from typescript-heuristic.ts. Re-export it from typescript.ts so the existing Python, Go, and Rust imports remain source-compatible and no circular import is introduced.

Give every pushed fact these values in addition to spec and statement:

    kind: 'static'
    startLine: i + 1
    endLine: i + 1
    extractor: 'typescript-line-scanner'
    confidence: 'heuristic'

When the scanner recognizes dynamic import or require, set kind to dynamic or require respectively. Multi-line static imports use the first and last consumed line.

- [ ] **Step 3: Add the failing parser precision tests**

Add these tests to packages/core/src/lang/typescript.test.ts:

    it('does not turn a TypeScript generic declaration into an import', () => {
      const text = "export function hitLink<T extends Pick<AtlasLink, 'from' | 'to' | 'type'>>(link: T) {}"
      expect(extractImports('iso.ts', text)).toEqual([])
    })

    it('extracts ESM, reexports, dynamic imports, require, and TS import equals', () => {
      const text = [
        "import x from './x.js'",
        "export { y } from './y.js'",
        "export * from './z.js'",
        "const lazy = import('./lazy.js')",
        "const legacy = require('legacy')",
        "import fs = require('node:fs')",
      ].join('\n')
      expect(extractImports('x.ts', text).map((fact) => [fact.spec, fact.kind, fact.confidence])).toEqual([
        ['./x.js', 'static', 'exact'],
        ['./y.js', 'reexport', 'exact'],
        ['./z.js', 'reexport', 'exact'],
        ['./lazy.js', 'dynamic', 'exact'],
        ['legacy', 'require', 'heuristic'],
        ['node:fs', 'require', 'exact'],
      ])
    })

    it('falls back explicitly on a syntax error', () => {
      const result = extractDependencies('broken.ts', "import x from './x'\nconst =")
      expect(result.imports.map((fact) => fact.spec)).toEqual(['./x'])
      expect(result.report.mode).toBe('heuristic')
      expect(result.report.extractor).toBe('typescript-line-scanner')
      expect(result.report.diagnostics).toHaveLength(1)
    })

Also change the old repeat-specifier test to keep deterministic first-evidence behavior rather than testing an undocumented parser implementation detail:

    it('deduplicates repeat specifiers by first source occurrence', () => {
      const facts = extractImports('x.ts', 'import a from "pg"\nimport b from "pg"')
      expect(facts).toHaveLength(1)
      expect(facts[0]).toMatchObject({ spec: 'pg', startLine: 1, endLine: 1 })
    })

- [ ] **Step 4: Run the parser tests and verify they fail**

Run:

    pnpm vitest run packages/core/src/lang/typescript.test.ts

Expected: FAIL because extractDependencies and the enriched ImportRef contract do not exist and the generic declaration is still misread.

- [ ] **Step 5: Add extraction contracts**

Add the exact types from the spec to packages/core/src/types.ts. Add:

    export interface ExtractionResult {
      imports: ImportRef[]
      report: ExtractionReport
    }

Add this required field to FileRecord:

    extraction: ExtractionReport

- [ ] **Step 6: Implement the Babel extractor**

Keep packages/core/src/lang/typescript.ts focused. Export extractTypescript(text: string, path = 'source.ts'): ExtractionResult so the old one-argument call remains valid and the dispatcher can provide the real path. Parse with:

    parse(text, {
      sourceType: 'unambiguous',
      errorRecovery: false,
      createImportExpressions: true,
      allowImportExportEverywhere: true,
      plugins: [
        'typescript',
        ...(isJsxPath(path) ? ['jsx' as const] : []),
        'decorators-legacy',
      ],
    })

Walk the AST deterministically in source order. Recognize ImportDeclaration, ExportNamedDeclaration with source, ExportAllDeclaration, ImportExpression, dynamic CallExpression whose callee type is Import, literal require CallExpression, and TSImportEqualsDeclaration with TSExternalModuleReference. Accept only StringLiteral arguments. Do not accept template literals, concatenation, identifiers, comments, strings, ImportType, or type names.

Construct line ranges from node.loc. Normalize source slices with the existing normalize() behavior. Deduplicate by spec, keeping the earliest source occurrence. Mark static, reexport, dynamic, and TS import-equals facts exact; mark ordinary require calls heuristic.

On parse failure, return extractTypescriptHeuristic(text) with one diagnostic containing only the parser error message, not a stack trace.
Use babel as the extractor value on exact reports and facts. Use typescript-line-scanner on fallback and SFC facts.

- [ ] **Step 7: Add the language dispatcher**

In packages/core/src/lang/index.ts export:

    export function extractDependencies(path: string, text: string): ExtractionResult

Rules:

- JS/TS extensions call the Babel extractor.
- vue, svelte, and astro call the heuristic scanner with mode heuristic.
- py/pyi, go, and rs call their provenance-enriched extractors and report mode heuristic.
- Other accepted source extensions return no imports and report mode unsupported.
- Keep extractImports(path, text) as a compatibility wrapper returning extractDependencies(path, text).imports.

Update python.ts, go.ts, and rust.ts so they construct the required ImportRef fields directly. Use static kind, python-line-scanner, go-line-scanner, or rust-line-scanner as the extractor, heuristic confidence, and the actual 1-based first/last lines already tracked by their loops and joinBalanced results. Their existing specifier and statement behavior must remain unchanged.

Wrap language dispatch in one catch. An unexpected extractor exception returns no facts and a failed report with the error message. Babel syntax errors do not reach this catch because the TypeScript extractor performs its specified heuristic fallback.

- [ ] **Step 8: Attach extraction reports during scan**

Call extractDependencies once per file in scan.ts and assign both imports and extraction from its result. Add scan tests proving:

- a TS file with no imports is exact;
- an SFC is heuristic;
- a Java file is unsupported;
- a malformed TS file reports heuristic fallback with one diagnostic.

- [ ] **Step 9: Run focused and full core tests**

Run:

    pnpm vitest run packages/core/src/lang/typescript.test.ts packages/core/src/scan.test.ts
    pnpm typecheck

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

    git add packages/core/package.json pnpm-lock.yaml packages/core/src/types.ts packages/core/src/lang/typescript.ts packages/core/src/lang/typescript-heuristic.ts packages/core/src/lang/python.ts packages/core/src/lang/go.ts packages/core/src/lang/rust.ts packages/core/src/lang/index.ts packages/core/src/lang/typescript.test.ts packages/core/src/scan.ts packages/core/src/scan.test.ts
    git commit -m "feat: parse TypeScript imports with source evidence"

## Task 2: Classified resolution outcomes and system imports

**Files:**

- Create: packages/core/src/lang/system.ts
- Modify: packages/core/src/resolve.ts
- Modify: packages/core/src/resolve.test.ts
- Modify: packages/core/src/index.ts

**Interfaces:**

- Consumes: ResolverOptions and ImportRef.spec from Task 1.
- Produces: Resolver.resolveImport(spec, fromDir, fromFile) returning ImportResolution for Task 3.

- [ ] **Step 1: Add failing classification tests**

Add to packages/core/src/resolve.test.ts:

    it('classifies internal, external, system, and unresolved imports', () => {
      const records = scan([
        { path: 'src/a.ts', text: 'export const a = 1' },
        { path: 'src/main.ts', text: '' },
      ])
      const resolver = createResolver(records, { aliases: { '@/*': ['./src/*'] } })
      expect(resolver.resolveImport('./a', 'src', 'src/main.ts')).toEqual({ kind: 'internal', path: 'src/a.ts' })
      expect(resolver.resolveImport('react', 'src', 'src/main.ts')).toEqual({ kind: 'external', name: 'react' })
      expect(resolver.resolveImport('node:path', 'src', 'src/main.ts')).toEqual({ kind: 'system', name: 'path' })
      expect(resolver.resolveImport('fs', 'src', 'src/main.ts')).toEqual({ kind: 'system', name: 'fs' })
      expect(resolver.resolveImport('./missing', 'src', 'src/main.ts')).toEqual({ kind: 'unresolved', spec: './missing' })
      expect(resolver.resolveImport('@/missing', 'src', 'src/main.ts')).toEqual({ kind: 'unresolved', spec: '@/missing' })
    })

- [ ] **Step 2: Run the resolver test and verify failure**

Run:

    pnpm vitest run packages/core/src/resolve.test.ts

Expected: FAIL because resolveImport does not exist.

- [ ] **Step 3: Add deterministic Node built-in classification**

Create packages/core/src/lang/system.ts. Export classifySystemImport(spec, fromFile), returning the normalized system name or null. Store a sorted static set covering Node 20 public built-ins, including assert, async_hooks, buffer, child_process, cluster, console, constants, crypto, dgram, diagnostics_channel, dns, domain, events, fs, http, http2, https, inspector, module, net, os, path, perf_hooks, process, punycode, querystring, readline, repl, stream, string_decoder, sys, test, timers, tls, trace_events, tty, url, util, v8, vm, wasi, worker_threads, and zlib. Treat built-in subpaths such as fs/promises and assert/strict by their first path segment.

Rules:

- a node: prefix is system regardless of extension;
- unprefixed Node names are system only for js, jsx, ts, tsx, mjs, cjs, mts, cts, vue, svelte, or astro source paths;
- a Go import whose first path segment contains no dot is system only for a .go source path, after internal module resolution has failed;
- a Rust path rooted at std, core, alloc, proc_macro, or test is system only for a .rs source path;
- Python names are never classified with the Node set.

Do not import node:module because core runs in the browser.

- [ ] **Step 4: Implement one classified resolver operation**

Export the discriminated ImportResolution type from resolve.ts. Refactor the existing resolve body into a closure named resolveInternal and the externalName body into externalFor. Return:

    resolve: resolveInternal,
    externalName: externalFor,
    resolveImport(spec, fromDir, fromFile) {
      const internal = resolveInternal(spec, fromDir, fromFile)
      if (internal) return { kind: 'internal', path: internal }
      const system = classifySystemImport(spec, fromFile)
      if (system) return { kind: 'system', name: system }
      if (spec.startsWith('.') || spec.startsWith('/') || aliases.some(([pattern]) => matchesAlias(spec, pattern))) {
        return { kind: 'unresolved', spec }
      }
      const external = externalFor(spec, fromFile)
      return external
        ? { kind: 'external', name: external }
        : { kind: 'ignored', reason: 'not a package or resolvable repository path' }
    }

Preserve current Rust, Python, Go, workspace, and tsconfig behavior inside resolveInternal and externalFor.

- [ ] **Step 5: Export and verify**

Export ImportResolution and classifySystemImport from packages/core/src/index.ts. Add resolver tests proving a Python import named path remains external, while Go net/http and Rust std::io::Read are system. Run:

    pnpm vitest run packages/core/src/resolve.test.ts packages/core/src/lang/resolve-langs.test.ts
    pnpm typecheck

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

    git add packages/core/src/lang/system.ts packages/core/src/resolve.ts packages/core/src/resolve.test.ts packages/core/src/index.ts
    git commit -m "feat: classify import resolution outcomes"

## Task 3: Evidence-backed graph links and coverage accounting

**Files:**

- Modify: packages/core/src/types.ts
- Modify: packages/core/src/graph.ts
- Modify: packages/core/src/atlas.ts
- Modify: packages/core/src/atlas.test.ts
- Modify: packages/core/src/fidelity.test.ts

**Interfaces:**

- Consumes: FileRecord.extraction, enriched ImportRef, and Resolver.resolveImport from Tasks 1–2.
- Produces: Atlas.coverage and evidence-bearing AtlasLink for Tasks 4, 6, and 7.

- [ ] **Step 1: Add failing end-to-end truth-contract tests**

Add a fixture to packages/core/src/fidelity.test.ts containing:

    {
      path: 'packages/app/src/generic.ts',
      text: "export function hitLink<T extends Pick<AtlasLink, 'from' | 'to' | 'type'>>(link: T) {}",
    },
    {
      path: 'packages/app/src/system.ts',
      text: "import fs from 'node:fs'\nimport path from 'path'\nimport x from './missing.js'",
    }

Assert:

    expect(atlas.nodes.some((node) => node.kind === 'external' && node.label === ' | ')).toBe(false)
    expect(atlas.nodes.some((node) => node.kind === 'external' && ['fs', 'path'].includes(node.label))).toBe(false)
    expect(atlas.coverage.systemFacts).toBe(2)
    expect(atlas.coverage.unresolvedFacts).toBe(1)
    expect(atlas.links.filter((link) => link.type !== 'containment').every((link) => (link.evidence?.length ?? 0) > 0)).toBe(true)

Also assert the middleware-to-session edge in atlas.test.ts has:

    confidence: 'exact'
    observations: 1
    evidence: [
      expect.objectContaining({
        path: 'middleware.ts',
        startLine: 1,
        endLine: 1,
        extractor: 'babel',
        confidence: 'exact',
      }),
    ]

- [ ] **Step 2: Run the fidelity tests and verify failure**

Run:

    pnpm vitest run packages/core/src/fidelity.test.ts packages/core/src/atlas.test.ts

Expected: FAIL because Atlas.coverage and link evidence do not exist.

- [ ] **Step 3: Add Atlas coverage and position-neutral link contracts**

Add AtlasCoverage and SourceEvidence exactly as defined in the spec. Add optional observations, confidence, and evidence fields to AtlasLink, and optional positions to AtlasNode. buildAtlas-generated values must always populate them; optionality exists only for backward compatibility with older JSON and hand-authored test values. Keep samples unchanged.

- [ ] **Step 4: Resolve facts once**

At the start of buildGraph(), create a stable array in file-path and source-line order:

    interface ResolvedFact {
      file: FileRecord
      ref: ImportRef
      resolution: ImportResolution
    }

Populate it with one resolver.resolveImport call per ImportRef. Replace every later resolver.resolve and resolver.externalName loop with this array.

- [ ] **Step 5: Aggregate evidence deterministically**

Change addEdge to consume a ResolvedFact. For import/external links:

- increment observations for every contributing fact;
- append sample text using the existing six-sample cap;
- append SourceEvidence using a 12-item cap;
- deduplicate evidence by path, startLine, endLine, specifier;
- downgrade link confidence to heuristic if any contributing fact is heuristic.

Containment links receive observations 0, evidence [], confidence exact.

- [ ] **Step 6: Calculate coverage before visible aggregation**

Calculate:

- exactFiles, heuristicFiles, unsupportedFiles, and failedFiles from FileRecord.extraction.mode;
- importFacts as resolvedFacts.length;
- internalFacts, externalFacts, systemFacts, unresolvedFacts, and ignoredFacts from resolution.kind;
- rolledUpFiles as the number of source files mapped by groupOf;
- hiddenExternals as externalHits.size minus the number of external slabs created.

Add coverage to GraphResult and Atlas. Do not change Atlas.stats.links semantics.
Assert in atlas.test.ts that internalFacts + externalFacts + systemFacts + unresolvedFacts + ignoredFacts equals importFacts.

- [ ] **Step 7: Run graph tests**

Run:

    pnpm vitest run packages/core/src/fidelity.test.ts packages/core/src/atlas.test.ts packages/core/src/resolve.test.ts
    pnpm typecheck

Expected: PASS, including no false package named " | ".

- [ ] **Step 8: Commit**

Run:

    git add packages/core/src/types.ts packages/core/src/graph.ts packages/core/src/atlas.ts packages/core/src/atlas.test.ts packages/core/src/fidelity.test.ts
    git commit -m "feat: expose graph evidence and coverage"

## Task 4: Fidelity reporting and honest product claims

**Files:**

- Modify: scripts/fidelity.ts
- Modify: scripts/realrepo.ts
- Modify: apps/web/src/App.tsx
- Modify: README.md
- Modify: docs/architecture.md

**Interfaces:**

- Consumes: Atlas.coverage and Resolver.resolveImport.
- Produces: developer-facing benchmark output and accurate user-facing claims.

- [ ] **Step 1: Rewrite fidelity output around classified facts**

Build an Atlas in scripts/fidelity.ts and print these exact labels:

    source files
    exact parser files
    heuristic parser files
    unsupported files
    import facts
    internal resolved
    external packages
    system imports
    unresolved imports
    ignored imports
    rolled-up files
    hidden externals

Continue printing the first ten unresolved facts as:

    path:startLine  ->  spec

Name the ratio internalFacts divided by internalFacts plus unresolvedFacts "internal resolution coverage". Never print it as accuracy.

- [ ] **Step 2: Update the real-repository probe**

Use resolver.resolveImport once per fact in scripts/realrepo.ts. Print classified totals and external node labels. Keep the language argument behavior.

- [ ] **Step 3: Make the landing and README claims accurate**

Replace "Every source file becomes a block, every import becomes an arc" with:

    Supported source files become blocks; parser-confirmed and heuristic imports become inspectable arcs. The atlas reports unsupported files, unresolved imports, and roll-ups instead of hiding them.

In README.md explain exact versus heuristic extraction and name the currently exact JS/TS extensions. State that Python, Go, Rust, Vue, Svelte, and Astro extraction is heuristic in v1.

- [ ] **Step 4: Update architecture documentation**

Document:

- Babel exact extraction and fallback;
- why rg is not a parser;
- ImportResolution;
- evidence aggregation;
- coverage field meanings;
- City versus Dependency projections.

- [ ] **Step 5: Verify reporting**

Run:

    pnpm fidelity .
    pnpm realrepo . auto
    pnpm typecheck

Expected:

- no external named " | ";
- exact parser files is greater than zero;
- unresolved imports list includes deliberate missing fixtures but not Node built-ins;
- commands exit zero.

- [ ] **Step 6: Commit**

Run:

    git add scripts/fidelity.ts scripts/realrepo.ts apps/web/src/App.tsx README.md docs/architecture.md
    git commit -m "docs: report atlas coverage accurately"

## Task 5: Deterministic dependency-derived layout

**Files:**

- Create: packages/core/src/layout-dependency.ts
- Modify: packages/core/src/types.ts
- Modify: packages/core/src/layout.ts
- Modify: packages/core/src/layout.test.ts
- Modify: packages/core/src/atlas.ts
- Modify: packages/core/src/atlas.test.ts
- Modify: packages/core/src/index.ts

**Interfaces:**

- Consumes: visible graph nodes and AtlasLink[] from Task 3.
- Produces: layoutCity(), layoutDependency(), LayoutMode, AtlasPosition, and AtlasNode.positions for Task 6.

- [ ] **Step 1: Add failing dependency-layout tests**

In layout.test.ts add:

    it('places linked nodes closer than an unlinked control pair', () => {
      const nodes = [
        node('a', 'src'),
        node('b', 'src'),
        node('c', 'src'),
        node('d', 'src'),
      ]
      const links = [
        { from: 'a', to: 'b', type: 'import' as const, samples: [], evidence: [], observations: 1, confidence: 'exact' as const },
        { from: 'b', to: 'c', type: 'import' as const, samples: [], evidence: [], observations: 1, confidence: 'exact' as const },
      ]
      const city = layoutCity(nodes, links, [{ id: 'src', label: 'src', color: '#000', count: 4 }], 17)
      const dependency = layoutDependency(city, links, 17)
      const byId = new Map(dependency.map((item) => [item.id, item]))
      const distance = (left: string, right: string) => {
        const a = byId.get(left)!
        const b = byId.get(right)!
        return Math.hypot(a.x - b.x, a.y - b.y)
      }
      expect((distance('a', 'b') + distance('b', 'c')) / 2).toBeLessThan(distance('a', 'd'))
    })

Also test deterministic output, no caller mutation, finite coordinates, and external mean radius greater than local mean radius.

- [ ] **Step 2: Run layout tests and verify failure**

Run:

    pnpm vitest run packages/core/src/layout.test.ts

Expected: FAIL because layoutCity and layoutDependency are not exported.

- [ ] **Step 3: Preserve City layout compatibility**

Rename the current function implementation to layoutCity. Export:

    export const layout = layoutCity

All existing layout tests must continue passing byte-for-byte.

- [ ] **Step 4: Implement dependency force layout**

Create layout-dependency.ts with these fixed constants:

    const ITERATIONS = 180
    const MAX_STEP = 0.22
    const REPULSION = 0.18
    const IMPORT_SPRING = 0.045
    const CONTAINMENT_SPRING = 0.012
    const IMPORT_LENGTH = 2.2
    const CONTAINMENT_LENGTH = 3.6

Algorithm:

1. Clone nodes sorted by id.
2. Initialize local coordinates from 35% of City x/y plus seeded jitter in [-0.15, 0.15].
3. Initialize external nodes on a deterministic outer ring.
4. For each fixed iteration, calculate pairwise inverse-square repulsion for local nodes.
5. Apply spring attraction for links whose endpoints exist. Import and external links use IMPORT_SPRING and IMPORT_LENGTH; containment uses the weaker constants.
6. Clamp each node's movement per axis to MAX_STEP and cool linearly to zero.
7. Re-place external nodes on a ring outside the maximum local radius, ordered by id; do not let local forces pull them through the graph.
8. Recenter local plus external coordinates and round to three decimals.
9. Preserve every node field and height.

At the 220-node default this is fewer than nine million simple pair interactions and needs no new dependency.

- [ ] **Step 5: Store both projections additively**

Add:

    export type LayoutMode = 'city' | 'dependency'

    export interface AtlasPosition {
      x: number
      y: number
    }

    positions?: Record<LayoutMode, AtlasPosition>

to AtlasNode. In buildAtlas:

1. compute city with layoutCity;
2. compute dependency with layoutDependency(city, graph.links, seed);
3. join by node id;
4. retain x/y/h from City;
5. assign positions.city and positions.dependency.

Throw an internal error if either layout omits a node id; this is a code invariant, not user input.

- [ ] **Step 6: Verify both layouts**

Run:

    pnpm vitest run packages/core/src/layout.test.ts packages/core/src/atlas.test.ts
    pnpm typecheck

Expected: PASS. The existing deterministic Atlas test remains byte-identical across repeated builds, and the Dependency coordinates differ from City for at least one linked node.

- [ ] **Step 7: Commit**

Run:

    git add packages/core/src/layout-dependency.ts packages/core/src/types.ts packages/core/src/layout.ts packages/core/src/layout.test.ts packages/core/src/atlas.ts packages/core/src/atlas.test.ts packages/core/src/index.ts
    git commit -m "feat: add dependency-derived atlas layout"

## Task 6: Layout switching, evidence inspection, and navigable search

**Files:**

- Create: packages/atlas-ui/src/search.ts
- Create: packages/atlas-ui/src/search.test.ts
- Modify: packages/atlas-ui/src/renderer.ts
- Modify: packages/atlas-ui/src/Atlas.tsx
- Modify: packages/atlas-ui/src/panels/Header.tsx
- Modify: packages/atlas-ui/src/panels/SystemMap.tsx
- Modify: packages/atlas-ui/src/panels/Inspect.tsx
- Modify: packages/atlas-ui/src/theme.css

**Interfaces:**

- Consumes: AtlasNode.positions, Atlas.coverage, and AtlasLink evidence from Tasks 3 and 5.
- Produces: City/Dependencies control, evidence inspector, coverage panel, and select-to-focus search.

- [ ] **Step 1: Add pure search tests**

Create search.test.ts:

    import { describe, expect, it } from 'vitest'
    import { searchNodes } from './search.js'

    const make = (id: string, role: string, symbols: string[] = []) => ({
      id,
      label: id.split('/').pop()!,
      path: id,
      kind: 'file' as const,
      area: 'src',
      role,
      contributes: [],
      lines: 1,
      bytes: 1,
      excerpt: [],
      in: 0,
      out: 0,
      x: 0,
      y: 0,
      h: 0.1,
      positions: { city: { x: 0, y: 0 }, dependency: { x: 0, y: 0 } },
      symbols,
    })

    describe('searchNodes', () => {
      const nodes = [
        make('src/auth/session.ts', 'service logic', ['getSession']),
        make('app/api/login/route.ts', 'api endpoint', ['POST']),
        make('src/components/Login.tsx', 'ui component', ['Login']),
      ]

      it('ranks path and label matches before role and symbol matches', () => {
        expect(searchNodes(nodes, 'login').map((node) => node.path)).toEqual([
          'app/api/login/route.ts',
          'src/components/Login.tsx',
        ])
      })

      it('matches roles and symbols and caps output', () => {
        expect(searchNodes(nodes, 'session', 1)).toHaveLength(1)
        expect(searchNodes(nodes, 'api').map((node) => node.path)).toEqual(['app/api/login/route.ts'])
      })
    })

- [ ] **Step 2: Run search tests and verify failure**

Run:

    pnpm vitest run packages/atlas-ui/src/search.test.ts

Expected: FAIL because searchNodes does not exist.

- [ ] **Step 3: Implement deterministic search**

Implement:

    export function searchNodes(nodes: AtlasNode[], query: string, limit = 50): AtlasNode[]

Normalize with trim and lowercase. Score exact label 0, label prefix 1, path segment prefix 2, path substring 3, role substring 4, and symbol substring 5. Sort by score, then path. Return no results for an empty query.

- [ ] **Step 4: Add renderer layout switching**

Add private layoutMode and activeNodes fields initialized to city and an empty array. Add:

    setLayout(mode: LayoutMode): void

It must map atlas.nodes to display clones whose x/y come from node.positions?.[mode] and fall back to node.x/node.y for older Atlas JSON, assign activeNodes, rebuild nodeById, ordered, packets, and labels, then fit and synchronously draw. Change fit(), drawGrid(), and label selection to read activeNodes rather than atlas.nodes so every coordinate-dependent operation uses the selected projection. Keep atlas.nodes immutable metadata. Preserve selected ids in ViewState.

Factor ingest so setAtlas and setLayout share one display-node rebuild path.

- [ ] **Step 5: Add the layout control**

Atlas owns layoutMode state. Header receives layoutMode and onLayout. Render two pressed-state buttons labeled City and Dependencies. On change:

1. update state;
2. call renderer.setLayout;
3. retain selected and selectedLink state;
4. show stage help text "Filesystem projection" or "Dependency projection".

- [ ] **Step 6: Turn filter into navigation**

SystemMap receives onSelect. Give the input:

    aria-label="Search files, roles, and symbols"

Below it, when filter is non-empty, render the result count and at most 50 button results from searchNodes. Selecting a result calls the existing selectFromList path, which selects and focuses the node. Keep area buttons and filtering behavior.

- [ ] **Step 7: Render coverage and evidence**

In SystemMap render exact, heuristic, unsupported, unresolved, rolled-up, and hidden-external counts with plain labels. If there are no import facts, show "No import facts extracted" instead of dividing by zero.

In Inspect LinkIdentity and SampleBlock show, using empty evidence and unknown confidence fallbacks for older Atlas JSON:

- Exact or Heuristic confidence chip;
- observation count;
- each evidence path:startLine-endLine;
- extractor name;
- statement.

Containment links show "Structural projection; no source import evidence."

- [ ] **Step 8: Style without changing the desktop visual language**

Add focused styles for search results, coverage rows, pressed layout buttons, evidence locations, and visible :focus-visible outlines. Keep the existing palette tokens and desktop grid sizes.

- [ ] **Step 9: Verify focused UI logic**

Run:

    pnpm vitest run packages/atlas-ui/src/search.test.ts packages/atlas-ui/src/iso.test.ts packages/atlas-ui/src/panels/ask-flags.test.ts
    pnpm typecheck
    pnpm -F @codeville/atlas-ui build

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

    git add packages/atlas-ui/src/search.ts packages/atlas-ui/src/search.test.ts packages/atlas-ui/src/renderer.ts packages/atlas-ui/src/Atlas.tsx packages/atlas-ui/src/panels/Header.tsx packages/atlas-ui/src/panels/SystemMap.tsx packages/atlas-ui/src/panels/Inspect.tsx packages/atlas-ui/src/theme.css
    git commit -m "feat: inspect graph truth across atlas layouts"

## Task 7: Keyboard, reduced motion, and narrow-view accessibility

**Files:**

- Create: packages/atlas-ui/src/keyboard.ts
- Create: packages/atlas-ui/src/keyboard.test.ts
- Modify: packages/atlas-ui/src/renderer.ts
- Modify: packages/atlas-ui/src/Atlas.tsx
- Modify: packages/atlas-ui/src/panels/Header.tsx
- Modify: packages/atlas-ui/src/theme.css

**Interfaces:**

- Consumes: renderer layout switching and React selection from Task 6.
- Produces: keyboard-operable canvas controls, a semantic search alternative, reduced-motion default, and usable 390 px layout.

- [ ] **Step 1: Add failing keyboard helper tests**

Create keyboard.test.ts:

    import { describe, expect, it } from 'vitest'
    import { canvasCommand, startsFlowing } from './keyboard.js'

    describe('canvas keyboard controls', () => {
      it('maps navigation keys to explicit commands', () => {
        expect(canvasCommand('ArrowLeft')).toEqual({ kind: 'pan', x: 48, y: 0 })
        expect(canvasCommand('ArrowUp')).toEqual({ kind: 'pan', x: 0, y: 48 })
        expect(canvasCommand('+')).toEqual({ kind: 'zoom', factor: 1.2 })
        expect(canvasCommand('-')).toEqual({ kind: 'zoom', factor: 1 / 1.2 })
        expect(canvasCommand('0')).toEqual({ kind: 'reset' })
        expect(canvasCommand('x')).toBeNull()
      })

      it('pauses flow for reduced-motion users', () => {
        expect(startsFlowing(true)).toBe(false)
        expect(startsFlowing(false)).toBe(true)
      })
    })

- [ ] **Step 2: Run the helper test and verify failure**

Run:

    pnpm vitest run packages/atlas-ui/src/keyboard.test.ts

Expected: FAIL because keyboard.ts does not exist.

- [ ] **Step 3: Implement pure helpers**

Export CanvasCommand, canvasCommand(key), and startsFlowing(prefersReducedMotion). Use the exact mappings in the test. Escape and unrecognized keys return null.

- [ ] **Step 4: Add public renderer controls**

Add:

    panBy(screenX: number, screenY: number): void
    zoomBy(factor: number): void

panBy updates camX/camY, marks layers dirty, and draws. zoomBy clamps to the existing 0.18–8 range around the viewport center, marks dirty, and draws. Reuse zoomBy from wheel handling where practical without changing cursor-anchored wheel behavior.

- [ ] **Step 5: Make canvas semantics and keys explicit**

Set:

    role="img"
    tabIndex={0}
    aria-label="Interactive codebase map. Use arrow keys to pan, plus and minus to zoom, and zero to reset. Use the system map search for an accessible file list."

Handle keydown through canvasCommand, prevent default only for recognized commands, and call renderer panBy, zoomBy, or resetView.

Initialize flowing with:

    startsFlowing(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

Keep the pause button available.

- [ ] **Step 6: Fix narrow viewport structure**

At max-width 860 px:

- keep cv-rail displayed;
- use grid rows header, rail, stage, inspect, footer;
- make cv-root vertically scrollable and keep horizontal overflow hidden;
- size the rail between 150 px and 190 px and make its results/areas scroll internally;
- remove its right border and add a bottom border;
- cap inspect at 340 px and let the page scroll rather than clipping the stage;
- allow header to wrap into repository and action rows;
- hide nonessential stats below 620 px;
- make cv-actions horizontally scrollable if needed;
- keep Reset reachable.

At max-width 480 px:

- set primary buttons and area/search result buttons to min-height 44px;
- set cv-label and button text to at least 10px;
- set body/list text to at least 11px;
- wrap cv-actions across rows with overflow visible so City, Dependencies, Pause, Trace, and Reset all start inside the viewport;
- keep the stage at least 280px high;
- allow the footer to wrap or hide the nonessential caption before clipping actions.

Add :focus-visible outlines using a 2px ink outline and 2px offset.

- [ ] **Step 7: Verify logic and builds**

Run:

    pnpm vitest run packages/atlas-ui/src/keyboard.test.ts packages/atlas-ui/src/search.test.ts
    pnpm typecheck
    pnpm build
    pnpm -F @codeville/atlas-ui build

Expected: PASS.

- [ ] **Step 8: Perform three viewport checks**

Run pnpm dev and inspect the same Codeville atlas at:

- 1280x720;
- 820x900;
- 390x844.

At each width verify City/Dependencies, search-to-focus, coverage, Reset, Pause, Trace, Export HTML, and New repo. At 390 px record DOM measurements proving document scrollWidth is no greater than viewport width and all header action bounding boxes lie within the viewport.

Emulate prefers-reduced-motion: reduce and verify the initial label says Flow paused and packet positions do not advance until Resume is activated.

- [ ] **Step 9: Commit**

Run:

    git add packages/atlas-ui/src/keyboard.ts packages/atlas-ui/src/keyboard.test.ts packages/atlas-ui/src/renderer.ts packages/atlas-ui/src/Atlas.tsx packages/atlas-ui/src/panels/Header.tsx packages/atlas-ui/src/theme.css
    git commit -m "fix: make the atlas accessible on narrow screens"

## Task 8: Final integration, regression audit, and handoff

**Files:**

- Modify only if a verification result exposes a requirement gap in files already owned by Tasks 1–7.

**Interfaces:**

- Consumes: all prior task outputs.
- Produces: one verified merge-ready branch and an evidence ledger.

- [ ] **Step 1: Run the complete automated gate**

Run sequentially:

    pnpm test
    pnpm typecheck
    pnpm build
    pnpm -F @codeville/atlas-ui build
    pnpm fidelity .
    pnpm langs
    pnpm realrepo . auto
    pnpm atlas . -o /tmp/codeville-trustworthy-atlas-v1.html

Expected:

- all tests pass;
- both builds pass;
- no fake external named " | ";
- standalone HTML is written;
- fidelity labels resolution coverage correctly;
- atlas generation remains deterministic and completes without an uncaught parser error.

If CLI tests alone fail with a sandbox IPC EPERM error, do not change application code. Record the environment failure and rerun the identical command with the environment's approved elevated execution mechanism.

- [ ] **Step 2: Audit the diff for scope and generated files**

Run:

    git status --short
    git diff --stat main...HEAD
    git diff --check
    rg -n "Every source file|every import" README.md docs/architecture.md apps packages scripts

Expected:

- .mission-grade/ remains untracked and untouched;
- no whitespace errors;
- no stale absolute product claim;
- no placeholders introduced;
- only files named by this plan changed.

- [ ] **Step 3: Confirm bundle and runtime cost**

Record the Vite output sizes. The web JavaScript gzip total must remain at or below 260 kB. Generate Codeville's own atlas three times and record the median wall time; it must remain below 1 second on the same machine.

If the bundle exceeds 260 kB gzip, inspect whether @babel/parser is being duplicated before changing architecture. If parse time exceeds one second, profile extraction versus layout and fix the measured hotspot without adding a dependency or asynchronous build contract.

- [ ] **Step 4: Re-check all twelve spec acceptance criteria**

Write a short table in the final agent response with criterion number, pass/fail, and command or observation. Do not weaken a criterion to obtain a pass.

- [ ] **Step 5: Commit any verification-only corrections**

If verification required code corrections, stage only those named files and commit:

    git commit -m "fix: close trustworthy atlas verification gaps"

If no correction was needed, do not create an empty commit.

- [ ] **Step 6: Return the execution ledger**

Report:

- branch name and commit hashes;
- files added and modified;
- test counts;
- fidelity coverage counts;
- build and gzip sizes;
- atlas generation median;
- viewport and reduced-motion results;
- any acceptance criterion still failing;
- confirmation that nothing was pushed.

## Final Definition of Done

- The regex false positive is impossible in the committed parser corpus.
- Exact and heuristic extraction are visible and correctly named.
- Unresolved aliases and Node built-ins cannot masquerade as npm dependencies.
- Import/external arcs are inspectable back to source lines.
- City geometry and dependency geometry are distinct, deterministic, and accurately labeled.
- Search is a selectable semantic alternative to canvas-only discovery.
- The visualization is usable at 390 px and starts paused for reduced-motion users.
- All automated and manual gates in Task 8 have evidence.
- The branch is committed, merge-ready, and not pushed.
