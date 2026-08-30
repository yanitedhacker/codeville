# Runtime Lens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import local OTLP JSON traces and show an evidence-labeled Runtime Lens with timeline, call tree, hot path, error paths, exact source correlation, browser and CLI input, and offline export.

**Architecture:** Keep the current `Atlas` static-source contract unchanged. Add a separate serializable `RuntimeTraceBundle` in `@codeville/core`, a dedicated runtime UI and timeline renderer in `@codeville/atlas-ui`, and bounded local import adapters in the web and CLI packages. Embed only the sanitized normalized bundle in standalone HTML.

**Tech Stack:** TypeScript 5.8, React 19, Canvas 2D, Vite 7, Vitest 3, pnpm 10, Node.js 20.19 or newer.

**Spec:** `docs/superpowers/specs/2026-08-31-runtime-lens-design.md`

## Global Constraints

- Accept local OTLP JSON or JSON Lines with a top-level `resourceSpans` array. Do not add a network receiver.
- Do not execute or instrument the analyzed repository.
- Keep static `AtlasLink` evidence and static `Trace one step` behavior unchanged.
- Keep all runtime timestamps as canonical decimal strings in the public model. Use `BigInt` only for validation and relative calculations.
- Default limits are 25 MiB input, 8 MiB per JSONL line, 10,000 traces, 50,000 total spans, 20,000 spans per trace, 2,000 resource/scope groups, 128 attributes per owner, 256 events per span, 128 links per span, nesting depth 8, and 16 KiB per string or byte value.
- Reject syntax, schema, identifier, time, duplicate-conflict, and limit failures as one whole import. Do not expose a partial replacement bundle.
- Preserve exact trace and span IDs. Redact the exact sensitive attribute-key set from the design and report the redaction count.
- Source correlation must use exact normalized paths and an explicit source root. Do not use basename or suffix guessing.
- Every canvas fact must have a keyboard-accessible DOM text alternative.
- Generated HTML must stay self-contained, use the existing script-breakout escaping, include the specified CSP, and make no network request when opened through `file://`.
- Do not add a new runtime dependency unless a failing test proves that the built-in platform cannot meet the contract.
- Do not touch or stage `.mission-grade/`.

---

## File map

### Core runtime domain

- Create `packages/core/src/runtime/types.ts`: public serializable runtime types, limits, safe errors, and tagged OTLP values.
- Create `packages/core/src/runtime/otlp-json.ts`: UTF-8 size check, JSON/JSONL framing, and typed OTLP decoding.
- Create `packages/core/src/runtime/normalize.ts`: ID/time validation, redaction, resource/scope flattening, duplicate handling, and canonical span ordering.
- Create `packages/core/src/runtime/derive.ts`: roots, orphans, cycle breaks, timeline order, hot path, and error paths.
- Create `packages/core/src/runtime/correlate.ts`: explicit source-root correlation against visible Atlas file nodes.
- Create `packages/core/src/runtime/index.ts`: public import and correlation exports.
- Create focused `*.test.ts` files beside each module and `packages/core/src/runtime/fixtures.ts` for reusable in-memory OTLP fixtures.
- Create `fixtures/runtime/minimal-otlp.json` and `fixtures/runtime/minimal-otlp.jsonl`: public deterministic JSON and JSONL examples used by core, CLI, and offline smoke tests.
- Modify `packages/core/src/index.ts`: export the runtime public API.

### Atlas UI

- Create `packages/atlas-ui/src/runtime/view-model.ts`: trace lookup, filters, selected ancestry, and display formatting.
- Create `packages/atlas-ui/src/runtime/timeline-geometry.ts`: deterministic lane and span-bar geometry.
- Create `packages/atlas-ui/src/runtime/TimelineRenderer.ts`: Canvas 2D paint, pan, zoom, reset, hover, and hit testing.
- Create `packages/atlas-ui/src/runtime/Timeline.tsx`: canvas lifecycle and complete DOM text alternative.
- Create `packages/atlas-ui/src/runtime/TraceRail.tsx`: trace and service selection plus filters.
- Create `packages/atlas-ui/src/runtime/RuntimeInspector.tsx`: span details, call tree, hot path, and error paths.
- Create `packages/atlas-ui/src/runtime/RuntimeLens.tsx`: runtime selection state and four-region layout.
- Create focused tests beside the runtime modules.
- Modify `packages/atlas-ui/src/Atlas.tsx`: optional runtime mode and exact-source handoff.
- Modify `packages/atlas-ui/src/panels/Header.tsx`: show one Runtime Lens action only when runtime data exists.
- Modify `packages/atlas-ui/src/theme.css`: runtime layout, status marks, responsive stack, and 44px mobile targets.
- Modify `packages/atlas-ui/src/index.ts`: export runtime UI types needed by web and standalone entry points.

### Inputs and export

- Create `apps/web/src/runtime/ingest.ts`: local File size check and pure core importer call.
- Create `apps/web/src/runtime/RuntimeImportDialog.tsx`: accessible file and source-root controls.
- Create focused tests for web trace ingest.
- Modify `apps/web/src/App.tsx`: hold the last accepted bundle, keep it on failed replacement, clear it on request, and pass it to `Atlas`.
- Modify `apps/web/src/export.ts`: pass the optional runtime bundle to offline export.
- Modify `packages/atlas-ui/src/standalone-html.ts`: optional runtime payload, CSP, and shared escaping.
- Modify `packages/atlas-ui/src/standalone.tsx`: read the optional runtime global and open Runtime Lens when present.
- Create `packages/atlas-ui/src/standalone-html.test.ts`: compatibility, breakout, CSP, and no-network assertions.
- Modify `packages/cli/src/index.ts`: `--trace`, `--trace-source-root`, HTML integration, and `.json` rejection.
- Modify `packages/cli/src/args.test.ts`: argument and end-to-end CLI HTML tests.

### Documentation and evidence

- Modify `README.md`, `docs/architecture.md`, and `docs/security.md`: input command, UI flow, limits, privacy, offline export, and static/runtime claim boundary.

---

### Task 1: Define runtime types and bounded OTLP JSON framing

**Files:**

- Create: `packages/core/src/runtime/types.ts`
- Create: `packages/core/src/runtime/otlp-json.ts`
- Create: `packages/core/src/runtime/otlp-json.test.ts`
- Create: `packages/core/src/runtime/fixtures.ts`

**Interfaces:**

- Produces: `RuntimeImportLimits`, `DEFAULT_RUNTIME_IMPORT_LIMITS`, `RuntimeImportError`, `RuntimeValue`, internal `ParsedOtlpDocument`, and `parseOtlpDocuments(text, options)`.
- `RuntimeImportError` has `code`, `limit?`, `actual?`, and a safe message that never contains an imported value.

- [ ] **Step 1: Write failing framing and value-decoding tests**

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_RUNTIME_IMPORT_LIMITS, RuntimeImportError } from './types.js'
import { parseOtlpDocuments } from './otlp-json.js'
import { otlpDocument } from './fixtures.js'

describe('parseOtlpDocuments', () => {
  it('accepts one JSON document and JSON Lines', () => {
    const one = JSON.stringify(otlpDocument())
    expect(parseOtlpDocuments(one)).toHaveLength(1)
    expect(parseOtlpDocuments(`${one}\n${one}\n`)).toHaveLength(2)
  })

  it('rejects the input-byte limit before JSON decoding', () => {
    try {
      parseOtlpDocuments(' '.repeat(33), {
        limits: { ...DEFAULT_RUNTIME_IMPORT_LIMITS, maxInputBytes: 32 },
      })
      throw new Error('expected a limit failure')
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeImportError)
      expect(error).toMatchObject({ code: 'limit', limit: 'maxInputBytes', actual: 33 })
    }
  })

  it('rejects a top-level object without resourceSpans', () => {
    expect(() => parseOtlpDocuments('{"resourceMetrics":[]}')).toThrow(/OTLP trace object/)
  })
})
```

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run: `pnpm test -- packages/core/src/runtime/otlp-json.test.ts`

Expected: FAIL because `types.ts`, `otlp-json.ts`, and `fixtures.ts` do not exist.

- [ ] **Step 3: Add the exact limits, safe error, tagged value, and parser interfaces**

```ts
export interface RuntimeImportLimits {
  maxInputBytes: number
  maxJsonLineBytes: number
  maxTraces: number
  maxSpans: number
  maxSpansPerTrace: number
  maxResourceScopeGroups: number
  maxAttributes: number
  maxEventsPerSpan: number
  maxLinksPerSpan: number
  maxAttributeDepth: number
  maxValueBytes: number
}

export const DEFAULT_RUNTIME_IMPORT_LIMITS: Readonly<RuntimeImportLimits> = {
  maxInputBytes: 25 * 1024 * 1024,
  maxJsonLineBytes: 8 * 1024 * 1024,
  maxTraces: 10_000,
  maxSpans: 50_000,
  maxSpansPerTrace: 20_000,
  maxResourceScopeGroups: 2_000,
  maxAttributes: 128,
  maxEventsPerSpan: 256,
  maxLinksPerSpan: 128,
  maxAttributeDepth: 8,
  maxValueBytes: 16 * 1024,
}

export interface RuntimeAttribute {
  key: string
  value: RuntimeValue
}

export type RuntimeValue =
  | { type: 'string'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'int'; value: string }
  | { type: 'double'; value: number }
  | { type: 'bytes'; value: string }
  | { type: 'array'; value: RuntimeValue[] }
  | { type: 'kvlist'; value: RuntimeAttribute[] }
  | { type: 'redacted' }

export class RuntimeImportError extends Error {
  constructor(
    public readonly code: 'syntax' | 'schema' | 'limit' | 'identity' | 'time' | 'conflict',
    message: string,
    public readonly limit?: keyof RuntimeImportLimits,
    public readonly actual?: number,
  ) { super(message) }

  static limit(limit: keyof RuntimeImportLimits, actual: number): RuntimeImportError {
    return new RuntimeImportError('limit', `Runtime trace exceeds ${limit} (${actual}).`, limit, actual)
  }
}
```

In `parseOtlpDocuments`, measure UTF-8 with `TextEncoder`. Try `JSON.parse(trimmed)` first. If it fails, parse each non-empty line and enforce `maxJsonLineBytes`. Require an object with an array-valued `resourceSpans`. Return safe `RuntimeImportError` categories for syntax, schema, and limits.

- [ ] **Step 4: Run focused tests and typecheck core imports**

Run: `pnpm test -- packages/core/src/runtime/otlp-json.test.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the framing boundary**

```bash
git add packages/core/src/runtime/types.ts packages/core/src/runtime/otlp-json.ts packages/core/src/runtime/otlp-json.test.ts packages/core/src/runtime/fixtures.ts
git commit -m "feat(core): parse bounded OTLP JSON"
```

---

### Task 2: Normalize, validate, and redact OTLP spans

**Files:**

- Modify: `packages/core/src/runtime/types.ts`
- Modify: `packages/core/src/runtime/otlp-json.ts`
- Create: `packages/core/src/runtime/normalize.ts`
- Create: `packages/core/src/runtime/normalize.test.ts`
- Modify: `packages/core/src/runtime/fixtures.ts`

**Interfaces:**

- Consumes: `ParsedOtlpDocument[]`, `RuntimeImportLimits`, and tagged `RuntimeValue` from Task 1.
- Produces: `RuntimeSpan`, `RuntimeImportReport`, `NormalizedRuntimeInput`, and `normalizeOtlpDocuments(documents, options)`.
- `RuntimeSpan` is serializable and stores `startTimeUnixNano`, `endTimeUnixNano`, and `durationNano` as decimal strings.

- [ ] **Step 1: Write failing tests for exact integers, IDs, redaction, and conflicts**

```ts
describe('normalizeOtlpDocuments', () => {
  it('keeps epoch nanoseconds exact and redacts sensitive values', () => {
    const doc = otlpDocument({
      start: '18446744073709550000',
      end: '18446744073709551615',
      attributes: [
        otlpAttribute('authorization', { stringValue: 'Bearer secret' }),
        otlpAttribute('code.file.path', { stringValue: 'src/api.ts' }),
      ],
    })
    const result = normalizeOtlpDocuments(parseOtlpDocuments(JSON.stringify(doc)))
    expect(result.spans[0]).toMatchObject({
      startTimeUnixNano: '18446744073709550000',
      endTimeUnixNano: '18446744073709551615',
      durationNano: '1615',
    })
    expect(result.spans[0]!.attributes).toContainEqual({ key: 'authorization', value: { type: 'redacted' } })
    expect(result.report.redactedAttributes).toBe(1)
  })

  it('rejects conflicting duplicate span identities', () => {
    const left = otlpDocument({ name: 'left' })
    const right = otlpDocument({ name: 'right' })
    const documents = parseOtlpDocuments(`${JSON.stringify(left)}\n${JSON.stringify(right)}`)
    expect(() => normalizeOtlpDocuments(documents)).toThrow(/conflicting duplicate span/)
  })

  it('ignores and reports unknown OTLP fields without copying their values', () => {
    const doc = otlpDocument({ spanExtra: { futureSecret: 'do-not-copy' } })
    const result = normalizeOtlpDocuments(parseOtlpDocuments(JSON.stringify(doc)))
    expect(result.report.unknownFields).toContainEqual({ path: 'resourceSpans[].scopeSpans[].spans[].spanExtra', count: 1 })
    expect(JSON.stringify(result)).not.toContain('do-not-copy')
  })
})
```

- [ ] **Step 2: Run the focused test and confirm the missing-normalizer failure**

Run: `pnpm test -- packages/core/src/runtime/normalize.test.ts`

Expected: FAIL because `normalize.ts` does not exist.

- [ ] **Step 3: Implement strict OTLP field decoding and canonical span normalization**

Implement these helpers with exact signatures:

```ts
export function normalizeOtlpDocuments(
  documents: ParsedOtlpDocument[],
  options: RuntimeNormalizeOptions = {},
): NormalizedRuntimeInput

function decimal64(value: unknown, field: string): string
function hexId(value: unknown, bytes: 8 | 16, field: string): string
function decodeAttributes(value: unknown, owner: string, state: NormalizeState): RuntimeAttribute[]
function decodeAnyValue(value: unknown, depth: number, state: NormalizeState): RuntimeValue
```

Walk `resourceSpans -> scopeSpans -> spans`. Copy resource and scope schema data. Decode attributes, events, links, status, flags, trace state, kind, and dropped counts. At each OTLP message, compare keys with an explicit allowed-key set; ignore unknown fields, aggregate their structural paths, cap diagnostics, and never copy their values. Use `BigInt(end) - BigInt(start)` for duration. Sort every attribute list by key and all spans by trace ID, start, end, and span ID. Coalesce identical normalized duplicates, count them, and reject conflicting duplicates. Apply the full redaction-key set before returning any model object.

- [ ] **Step 4: Run normalizer, parser, and typecheck gates**

Run: `pnpm test -- packages/core/src/runtime/normalize.test.ts packages/core/src/runtime/otlp-json.test.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit normalized OTLP evidence**

```bash
git add packages/core/src/runtime/types.ts packages/core/src/runtime/otlp-json.ts packages/core/src/runtime/normalize.ts packages/core/src/runtime/normalize.test.ts packages/core/src/runtime/fixtures.ts
git commit -m "feat(core): normalize OTLP trace evidence"
```

---

### Task 3: Derive trace trees, hot paths, and error paths

**Files:**

- Modify: `packages/core/src/runtime/types.ts`
- Create: `packages/core/src/runtime/derive.ts`
- Create: `packages/core/src/runtime/derive.test.ts`
- Create: `packages/core/src/runtime/index.ts`
- Create: `fixtures/runtime/minimal-otlp.json`
- Create: `fixtures/runtime/minimal-otlp.jsonl`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: `NormalizedRuntimeInput` from Task 2.
- Produces: `deriveRuntimeTraces(input): RuntimeTraceBundle` and public `importOtlpTraceJson(text, options?): RuntimeTraceBundle`.
- `RuntimeTrace` exposes `rootSpanIds`, `orphanSpanIds`, `cycleBreakSpanIds`, `hotPathSpanIds`, and `errorPaths`.

- [ ] **Step 1: Write failing deterministic graph tests**

```ts
describe('deriveRuntimeTraces', () => {
  it('keeps missing parents explicit and breaks cycles deterministically', () => {
    const bundle = importOtlpTraceJson(JSON.stringify(otlpDocumentWithRelations()))
    const trace = bundle.traces[0]!
    expect(trace.orphanSpanIds).toEqual(['0000000000000004'])
    expect(trace.cycleBreakSpanIds).toEqual(['0000000000000006'])
    expect(bundle.spans.find((span) => span.spanId.endsWith('0006'))?.relation).toBe('cycle-broken')
  })

  it('uses the specified hot-path and error-path tie breaks', () => {
    const trace = importOtlpTraceJson(JSON.stringify(otlpDocumentWithTiedPaths())).traces[0]!
    expect(trace.hotPathSpanIds).toEqual([
      '0000000000000001',
      '0000000000000002',
      '0000000000000004',
    ])
    expect(trace.errorPaths[0]).toEqual(['0000000000000001', '0000000000000003'])
  })

  it('normalizes equivalent JSON and JSON Lines evidence identically', async () => {
    const [jsonText, jsonlText] = await Promise.all([
      readFile('fixtures/runtime/minimal-otlp.json', 'utf8'),
      readFile('fixtures/runtime/minimal-otlp.jsonl', 'utf8'),
    ])
    const json = importOtlpTraceJson(jsonText)
    const jsonl = importOtlpTraceJson(jsonlText)
    expect(jsonl.spans).toEqual(json.spans)
    expect(jsonl.traces).toEqual(json.traces)
  })
})
```

- [ ] **Step 2: Run the focused test and confirm missing derived APIs**

Run: `pnpm test -- packages/core/src/runtime/derive.test.ts`

Expected: FAIL because `derive.ts` and the public importer do not exist.

- [ ] **Step 3: Implement one-parent graph derivation and the public importer**

```ts
export function importOtlpTraceJson(
  text: string,
  options: RuntimeImportOptions = {},
): RuntimeTraceBundle {
  const documents = parseOtlpDocuments(text, options)
  const normalized = normalizeOtlpDocuments(documents, options)
  return deriveRuntimeTraces(normalized)
}
```

Group spans by trace ID. Detect each one-parent cycle. Remove the parent edge from the lexicographically greatest span ID in that cycle and mark it. Keep missing-parent spans in `orphanSpanIds`. Build hot paths from root, cycle-broken, and orphan starts; compare summed durations with `BigInt`. Build one ancestry path for each `status.code === 2` span. Apply the exact sort and tie-break rules from the spec.

- [ ] **Step 4: Prove permutation stability and run all runtime-core tests**

Add one test that reverses resource groups, scope groups, and spans, then asserts:

```ts
expect(importOtlpTraceJson(permuted)).toEqual(importOtlpTraceJson(original))
```

Create both public fixtures in this task. Each contains the same two traces, one `status.code = 2` span, one `authorization` attribute, and `code.file.path = "packages/core/src/runtime/index.ts"`. The JSON file uses one document. The JSONL file splits equivalent resource groups across two non-empty lines.

Run: `pnpm test -- packages/core/src/runtime`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the public runtime bundle API**

```bash
git add packages/core/src/runtime packages/core/src/index.ts fixtures/runtime/minimal-otlp.json fixtures/runtime/minimal-otlp.jsonl
git commit -m "feat(core): derive runtime trace views"
```

---

### Task 4: Add exact source correlation

**Files:**

- Modify: `packages/core/src/runtime/types.ts`
- Create: `packages/core/src/runtime/correlate.ts`
- Create: `packages/core/src/runtime/correlate.test.ts`
- Modify: `packages/core/src/runtime/index.ts`

**Interfaces:**

- Consumes: `RuntimeTraceBundle`, `Atlas`, and `RuntimeSourceOptions { sourceRoot?: string }`.
- Produces: `correlateRuntimeSources(bundle, atlas, options?): RuntimeTraceBundle` and `RuntimeSourceMatch`.
- `RuntimeSourceMatch` includes `nodeId`, `path`, `recordedPath`, optional function and line, and `kind: 'exact-file'`.

- [ ] **Step 1: Write failing POSIX, Windows, deprecated-key, and no-guess tests**

```ts
it('matches only an exact path under the explicit source root', () => {
  const atlas = atlasWithFiles(['src/api.ts', 'other/api.ts'])
  const matched = correlateRuntimeSources(bundleWithCodePath('/work/app/src/api.ts'), atlas, {
    sourceRoot: '/work/app',
  })
  expect(matched.spans[0]!.source).toMatchObject({ nodeId: 'file:src/api.ts', path: 'src/api.ts' })

  const unmatched = correlateRuntimeSources(bundleWithCodePath('/else/api.ts'), atlas, {
    sourceRoot: '/work/app',
  })
  expect(unmatched.spans[0]!.source).toBeUndefined()
  expect(unmatched.report.unmatchedSourceSpans).toBe(1)
})

it('does not use a unique suffix as an exact source match', () => {
  expect(correlateRuntimeSources(bundleWithCodePath('/tmp/src/api.ts'), atlasWithFiles(['src/api.ts'])).spans[0]!.source).toBeUndefined()
})
```

- [ ] **Step 2: Run the focused test and confirm the missing correlator failure**

Run: `pnpm test -- packages/core/src/runtime/correlate.test.ts`

Expected: FAIL because `correlate.ts` does not exist.

- [ ] **Step 3: Implement browser-safe exact path normalization**

```ts
export function correlateRuntimeSources(
  bundle: RuntimeTraceBundle,
  atlas: Atlas,
  options: RuntimeSourceOptions = {},
): RuntimeTraceBundle
```

Normalize slash direction, repeated separators, `.` segments, and an explicit source root without importing `node:path`. Reject traversal above the source root. Preserve case. Match only `AtlasNode.kind === 'file'` and exact `AtlasNode.path`. Read stable `code.file.path`, `code.function.name`, and `code.line.number` first; read deprecated names only when stable names are absent and add a compatibility warning.

- [ ] **Step 4: Run correlation and complete core gates**

Run: `pnpm test -- packages/core/src/runtime`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit exact source correlation**

```bash
git add packages/core/src/runtime
git commit -m "feat(core): correlate trace spans to exact sources"
```

---

### Task 5: Build the deterministic runtime view model and timeline geometry

**Files:**

- Create: `packages/atlas-ui/src/runtime/view-model.ts`
- Create: `packages/atlas-ui/src/runtime/view-model.test.ts`
- Create: `packages/atlas-ui/src/runtime/timeline-geometry.ts`
- Create: `packages/atlas-ui/src/runtime/timeline-geometry.test.ts`
- Create: `packages/atlas-ui/src/runtime/TimelineRenderer.ts`
- Create: `packages/atlas-ui/src/runtime/TimelineRenderer.test.ts`

**Interfaces:**

- Consumes: `RuntimeTraceBundle`, selected trace ID, `RuntimeFilters`, and a canvas.
- Produces: `buildRuntimeView(bundle, traceId, filters): RuntimeViewModel`, `layoutTimeline(view, viewport): TimelineLayout`, and `TimelineRenderer` methods `resize`, `setView`, `panBy`, `zoomBy`, `resetView`, `spanAt`, and `dispose`.

- [ ] **Step 1: Write failing filter and exact-geometry tests**

```ts
it('filters visibility without changing evidence order', () => {
  const view = buildRuntimeView(bundle, TRACE_ID, {
    service: 'api', status: 'error', minDurationNano: '1000', errorsOnly: true,
  })
  expect(view.visibleSpanIds).toEqual(['0000000000000003'])
  expect(bundle.traces[0]!.spanIds).toEqual(ORIGINAL_SPAN_IDS)
})

it('uses relative BigInt deltas for bounded bar geometry', () => {
  const view = viewWithEpoch({
    traceStart: '18446744073709550000',
    traceDuration: '2000',
    spans: [{ startOffset: '0', duration: '1000', service: 'api' }],
  })
  const layout = layoutTimeline(view, { width: 800, height: 400, zoom: 1, offsetX: 0 })
  expect(layout.bars[0]).toMatchObject({ x: 160, width: 320, lane: 0 })
  expect(layout.bars.every((bar) => Number.isFinite(bar.x + bar.width))).toBe(true)
})
```

- [ ] **Step 2: Run focused tests and confirm missing modules**

Run: `pnpm test -- packages/atlas-ui/src/runtime/view-model.test.ts packages/atlas-ui/src/runtime/timeline-geometry.test.ts packages/atlas-ui/src/runtime/TimelineRenderer.test.ts`

Expected: FAIL because the runtime UI modules do not exist.

- [ ] **Step 3: Implement pure selection, filtering, geometry, and a static canvas renderer**

```ts
export interface RuntimeFilters {
  service: string | null
  status: 'all' | 'unset' | 'ok' | 'error'
  minDurationNano: string
  errorsOnly: boolean
}

export interface TimelineBar {
  spanId: string
  lane: number
  x: number
  y: number
  width: number
  height: number
  status: 0 | 1 | 2
}
```

Use `BigInt(span.startTimeUnixNano) - BigInt(trace.startTimeUnixNano)` for offsets. Convert only ratios bounded by the selected trace duration. Give each service a stable lane sorted by service name. Paint text labels, a status glyph, selection outline, ancestor/descendant emphasis, and neutral bars. Do not animate the initial view.

- [ ] **Step 4: Run focused UI-domain tests and typecheck**

Run: `pnpm test -- packages/atlas-ui/src/runtime`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit runtime view mechanics**

```bash
git add packages/atlas-ui/src/runtime
git commit -m "feat(atlas-ui): add runtime timeline mechanics"
```

---

### Task 6: Build accessible Runtime Lens components

**Files:**

- Create: `packages/atlas-ui/src/runtime/Timeline.tsx`
- Create: `packages/atlas-ui/src/runtime/Timeline.test.tsx`
- Create: `packages/atlas-ui/src/runtime/TraceRail.tsx`
- Create: `packages/atlas-ui/src/runtime/TraceRail.test.ts`
- Create: `packages/atlas-ui/src/runtime/RuntimeInspector.tsx`
- Create: `packages/atlas-ui/src/runtime/RuntimeInspector.test.ts`
- Create: `packages/atlas-ui/src/runtime/RuntimeLens.tsx`
- Create: `packages/atlas-ui/src/runtime/RuntimeLens.test.tsx`

**Interfaces:**

- Consumes: `atlas`, `runtime`, `onShowStatic`, `onOpenSource(nodeId)`, and optional footer actions.
- Produces: synchronized trace, span, filter, timeline, tree, hot-path, and error-path UI state.

- [ ] **Step 1: Write failing component contract tests**

```ts
it('renders the truth label and complete textual timeline', () => {
  const view = renderRuntimeLens({ atlas, runtime: bundle, onShowStatic: vi.fn(), onOpenSource: vi.fn() })
  const text = collectText(view)
  expect(text).toContain('Observed in imported trace data; this view may be incomplete.')
  expect(text).toContain('api / GET /users / +0 ns / 2,000 ns / error')
  expect(text).toContain('Hot path is the greatest sum of recorded span durations; it is not causal proof.')
})

it('opens only the exact matched source node', () => {
  const open = vi.fn()
  const view = RuntimeInspector({ span: matchedSpan, trace, bundle, tab: 'span', onTab: vi.fn(), onSelectSpan: vi.fn(), onOpenSource: open })
  findButton(view, 'Open matched source').props.onClick()
  expect(open).toHaveBeenCalledWith('file:src/api.ts')
})
```

- [ ] **Step 2: Run focused component tests and confirm missing components**

Run: `pnpm test -- packages/atlas-ui/src/runtime`

Expected: FAIL because the React runtime components do not exist.

- [ ] **Step 3: Implement the four-region Runtime Lens with native controls**

Use `useMemo` for `buildRuntimeView`, `useState` for trace/span/filter/tab state, and `useEffect` only for canvas lifecycle and selection clamping. The timeline component must render:

```tsx
<canvas
  role="img"
  tabIndex={0}
  aria-label={`Observed span timeline for trace ${trace.traceId}`}
  aria-describedby="cv-runtime-timeline-help"
/>
<ol className="cv-runtime-text-timeline" aria-label="Text timeline">
  {view.visibleSpans.map((span) => (
    <li key={span.spanId}>
      <button type="button" onClick={() => onSelectSpan(span.spanId)}>
        {timelineRowText(span, trace)}
      </button>
    </li>
  ))}
</ol>
```

Define `renderRuntimeLens` with the same local hook harness pattern as `AtlasFocus.test.ts`. Define local `collectText` and `findButton` helpers that recurse through React element `props.children`, as the current panel tests do. Do not add React Testing Library.

Wire pointer drag to `panBy`, wheel input to `zoomBy`, pointer movement to `spanAt`, click to selection, and the reset button to `resetView`. Add native buttons for reset, previous/next trace, hot path, error paths, tabs, and source handoff. Add optional keyboard shortcuts `ArrowUp`, `ArrowDown`, `[`, `]`, `h`, `e`, and `0`; keep every action available as a labeled button.

- [ ] **Step 4: Run runtime component tests and typecheck**

Run: `pnpm test -- packages/atlas-ui/src/runtime`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the accessible Runtime Lens**

```bash
git add packages/atlas-ui/src/runtime
git commit -m "feat(atlas-ui): build accessible runtime lens"
```

---

### Task 7: Integrate runtime mode with Atlas and responsive styling

**Files:**

- Modify: `packages/atlas-ui/src/Atlas.tsx`
- Modify: `packages/atlas-ui/src/panels/Header.tsx`
- Modify: `packages/atlas-ui/src/theme.css`
- Modify: `packages/atlas-ui/src/index.ts`
- Modify: `packages/atlas-ui/src/AtlasFocus.test.ts`
- Create: `packages/atlas-ui/src/AtlasRuntime.test.tsx`
- Create: `packages/atlas-ui/src/runtime-style.test.ts`

**Interfaces:**

- Extends `AtlasProps` with `runtime?: RuntimeTraceBundle`, `initialMode?: 'static' | 'runtime'`, and `onClearRuntime?: () => void`.
- Static mode retains all current props and state.
- Exact source handoff sets static mode, selects the file node, and calls `AtlasRenderer.focusNode(nodeId)` after the static canvas mounts.

- [ ] **Step 1: Write failing integration and CSS contract tests**

```ts
it('keeps static behavior unchanged when runtime is absent', () => {
  renderAtlas({ atlas })
  expect(harness.runtimeLensProps).toBeNull()
  expect(harness.headerProps?.onShowRuntime).toBeUndefined()
  expect(harness.canvasProps?.['aria-label']).toContain('Interactive codebase map')
})

it('switches from a matched runtime span to the exact static node', () => {
  renderAtlas({ atlas, runtime: bundle, initialMode: 'runtime' })
  harness.runtimeLensProps!.onOpenSource('file:src/api.ts')
  renderAtlas({ atlas, runtime: bundle, initialMode: 'runtime' })
  expect(harness.renderers.at(-1)!.focusNode).toHaveBeenCalledWith('file:src/api.ts')
  expect(harness.canvasProps?.['aria-label']).toContain('Interactive codebase map')
})
```

Build `AtlasRuntime.test.tsx` by extending the existing hook harness in `AtlasFocus.test.ts`. Mock `RuntimeLens` and `Header` to capture their props. Do not add a DOM test package.

In the CSS contract test, read `theme.css` and assert that the runtime root has the 860px stack rule and that runtime buttons join the existing 480px `min-height: 44px` rule.

- [ ] **Step 2: Run focused Atlas tests and confirm missing runtime props**

Run: `pnpm test -- packages/atlas-ui/src/AtlasRuntime.test.tsx packages/atlas-ui/src/runtime-style.test.ts packages/atlas-ui/src/AtlasFocus.test.ts`

Expected: FAIL on missing runtime-mode support.

- [ ] **Step 3: Add mode state without changing the static evidence path**

```ts
export interface AtlasProps {
  atlas: AtlasData
  runtime?: RuntimeTraceBundle
  initialMode?: 'static' | 'runtime'
  onClearRuntime?: () => void
  caption?: string
  footerExtra?: React.ReactNode
}
```

Add `mode` to the static renderer effect dependencies so switching to Runtime Lens disposes the detached static renderer and switching back creates a fresh renderer. Keep current static selection state in React. When a runtime source handoff occurs, store the exact node ID, switch to static, then select and focus it in an effect after renderer creation.

Add `.cv-runtime-root` with the same palette tokens and a four-region desktop grid. At 860px, stack rail, summary/timeline, inspector, and footer. At 480px, keep all runtime buttons and inputs at least 44px high and prevent document-level horizontal overflow.

- [ ] **Step 4: Run all Atlas UI tests, typecheck, and standalone build**

Run: `pnpm test -- packages/atlas-ui`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

Run: `pnpm -F @codeville/atlas-ui build`

Expected: PASS and create the standalone JS/CSS bundle.

- [ ] **Step 5: Commit Atlas integration**

```bash
git add packages/atlas-ui/src/Atlas.tsx packages/atlas-ui/src/panels/Header.tsx packages/atlas-ui/src/theme.css packages/atlas-ui/src/index.ts packages/atlas-ui/src/AtlasFocus.test.ts packages/atlas-ui/src/AtlasRuntime.test.tsx packages/atlas-ui/src/runtime-style.test.ts
git commit -m "feat(atlas-ui): integrate runtime lens mode"
```

---

### Task 8: Add browser-local trace import and safe replacement state

**Files:**

- Create: `apps/web/src/runtime/ingest.ts`
- Create: `apps/web/src/runtime/ingest.test.ts`
- Create: `apps/web/src/runtime/RuntimeImportDialog.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/drop.css`

**Interfaces:**

- Produces: `ingestRuntimeFile(file, atlas, options): Promise<RuntimeTraceBundle>`.
- App passes `runtime`, `initialMode`, and `onClearRuntime` to `Atlas`.
- A rejected new file leaves the prior accepted bundle unchanged.

- [ ] **Step 1: Write failing local-ingest and replacement-state tests**

```ts
it('imports one local file without calling fetch', async () => {
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  const body = JSON.stringify(otlpDocument())
  const bytes = new TextEncoder().encode(body)
  const file = {
    name: 'trace.json',
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  } as File
  const bundle = await ingestRuntimeFile(file, atlas, { sourceRoot: '/work/app' })
  expect(bundle.traces).toHaveLength(1)
  expect(fetchSpy).not.toHaveBeenCalled()
})

it('rejects an oversized file before reading bytes', async () => {
  const arrayBuffer = vi.fn()
  const file = { size: DEFAULT_RUNTIME_IMPORT_LIMITS.maxInputBytes + 1, arrayBuffer } as unknown as File
  await expect(ingestRuntimeFile(file, atlas)).rejects.toMatchObject({ code: 'limit' })
  expect(arrayBuffer).not.toHaveBeenCalled()
})

it('rejects malformed UTF-8 before JSON parsing', async () => {
  const bytes = Uint8Array.of(0xc3, 0x28)
  const file = { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer } as File
  await expect(ingestRuntimeFile(file, atlas)).rejects.toMatchObject({ code: 'syntax' })
})
```

- [ ] **Step 2: Run the focused web test and confirm the missing ingest module**

Run: `pnpm test -- apps/web/src/runtime/ingest.test.ts`

Expected: FAIL because the runtime web modules do not exist.

- [ ] **Step 3: Implement local import dialog and transactional state replacement**

```ts
export async function ingestRuntimeFile(
  file: File,
  atlas: Atlas,
  options: RuntimeSourceOptions = {},
): Promise<RuntimeTraceBundle> {
  if (file.size > DEFAULT_RUNTIME_IMPORT_LIMITS.maxInputBytes) {
    throw RuntimeImportError.limit('maxInputBytes', file.size)
  }
  const bytes = await file.arrayBuffer()
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new RuntimeImportError('syntax', 'Runtime trace is not valid UTF-8.')
  }
  const imported = importOtlpTraceJson(text)
  return correlateRuntimeSources(imported, atlas, options)
}
```

In `App`, set `phase` to working, await the complete import, then replace runtime state once. On error, keep the old bundle and show the safe error. The dialog uses a `.json,.jsonl,application/json` file input, a labeled source-root text field, `Import`, and `Cancel`. Do not use URL input, drag-folder trace import, storage, or a worker script.

- [ ] **Step 4: Run web, typecheck, and production build gates**

Run: `pnpm test -- apps/web/src/runtime/ingest.test.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 5: Commit browser-local import**

```bash
git add apps/web/src/runtime apps/web/src/App.tsx apps/web/src/drop.css
git commit -m "feat(web): import local OTLP traces"
```

---

### Task 9: Add sanitized standalone export and CLI trace input

**Files:**

- Modify: `packages/atlas-ui/src/standalone-html.ts`
- Modify: `packages/atlas-ui/src/standalone.tsx`
- Create: `packages/atlas-ui/src/standalone-html.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/export.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/args.test.ts`

**Interfaces:**

- Extends `renderStandaloneHtml(atlas, js, css, runtime?)` without breaking three-argument callers.
- Extends `GenerateArgs` with `trace?: string` and `traceSourceRoot?: string`.
- `--trace` is valid only for HTML output. Its default source root is the analyzed repository root.

- [ ] **Step 1: Write failing CSP, breakout, compatibility, and CLI tests**

```ts
it('embeds sanitized runtime data with CSP and no script breakout', () => {
  const runtime = bundleWithSpanName('</script><script>globalThis.pwned=1</script>')
  const html = renderStandaloneHtml(atlas, 'window.rendered=true', '.x{}', runtime)
  expect(html).toContain("default-src 'none'")
  expect(html).toContain('window.__CODEVILLE_RUNTIME__=')
  expect(html).not.toContain('</script><script>globalThis.pwned')
  expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|https?:\/\//)
})

it('keeps the legacy three-argument export contract', () => {
  const html = renderStandaloneHtml(atlas, 'window.rendered=true', '.x{}')
  expect(html).not.toContain('__CODEVILLE_RUNTIME__')
})

it('parses trace flags and rejects trace plus JSON output', () => {
  expect(parseArgs(['/repo', '--trace', '/tmp/trace.json', '--trace-source-root', '/work/app'])).toMatchObject({
    command: 'generate', trace: '/tmp/trace.json', traceSourceRoot: '/work/app',
  })
  expect(() => parseArgs(['/repo', '--trace', '/tmp/trace.json', '-o', '/tmp/atlas.json'])).toThrow(/requires HTML output/)
})
```

- [ ] **Step 2: Run focused export and CLI tests and confirm failures**

Run: `pnpm test -- packages/atlas-ui/src/standalone-html.test.ts packages/cli/src/args.test.ts`

Expected: FAIL on missing runtime export and CLI flags.

- [ ] **Step 3: Implement escaped runtime payload, CSP, standalone mode, and CLI read path**

```ts
export function renderStandaloneHtml(
  atlas: Atlas,
  js: string,
  css: string,
  runtime?: RuntimeTraceBundle,
): string
```

Use the existing `embedJson` for both globals. Add the exact CSP from the design. In `standalone.tsx`, read `window.__CODEVILLE_RUNTIME__` and pass it to `<Atlas runtime={runtime} initialMode={runtime ? 'runtime' : 'static'} />`. Extend `exportAtlas(atlas, runtime?)` and pass the accepted App runtime bundle into it. Keep static export behavior when runtime is absent.

In the CLI, resolve `--trace` and `--trace-source-root` against `process.cwd()`. Read the trace as bytes only after repository analysis succeeds, then decode it with `new TextDecoder('utf-8', { fatal: true })`. Convert a decode failure to the same safe UTF-8 syntax error as the browser. Import and correlate it, then call `renderStandaloneHtml(atlas, js, css, runtime)`. Log exact trace and span counts. Do not include runtime data in Atlas JSON or Markdown output.

- [ ] **Step 4: Run export, CLI, build, and file-content smoke gates**

Run: `pnpm -F @codeville/atlas-ui build`

Expected: PASS.

Run: `pnpm test -- packages/atlas-ui/src/standalone-html.test.ts packages/cli/src/args.test.ts`

Expected: PASS.

Run a temp-fixture CLI command from the repository root:

```bash
pnpm atlas . --trace fixtures/runtime/minimal-otlp.json --trace-source-root "$PWD" -o /tmp/codeville-runtime-atlas.html
```

Expected: exit 0, log non-zero trace/span counts, and write one HTML file that contains `__CODEVILLE_RUNTIME__` and no external script or stylesheet URL.

- [ ] **Step 5: Commit offline and CLI integration**

```bash
git add packages/atlas-ui/src/standalone-html.ts packages/atlas-ui/src/standalone.tsx packages/atlas-ui/src/standalone-html.test.ts apps/web/src/App.tsx apps/web/src/export.ts packages/cli/src/index.ts packages/cli/src/args.test.ts
git commit -m "feat(cli): export runtime lens offline"
```

---

### Task 10: Document and verify Runtime Lens end to end

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/security.md`
- Create: `docs/superpowers/plans/2026-08-31-runtime-lens-verification.md`

**Interfaces:**

- Fixtures must contain the same two-trace evidence in JSON and JSONL forms, one exact source match to `packages/core/src/runtime/index.ts`, one recorded error, and one sensitive attribute that is redacted.
- Verification record must list the exact command, exit status, counts, skips, and evidence boundary for every completion criterion.

- [ ] **Step 1: Verify the public fixtures and add documentation assertions**

Keep the Task 3 test that reads both fixtures and proves equal normalized evidence:

```ts
const json = importOtlpTraceJson(jsonText)
const jsonl = importOtlpTraceJson(jsonlText)
expect(jsonl.spans).toEqual(json.spans)
expect(jsonl.traces).toEqual(json.traces)
```

Update README usage with:

```bash
pnpm atlas . \
  --trace fixtures/runtime/minimal-otlp.json \
  --trace-source-root "$PWD" \
  -o codeville-runtime.html
```

State directly that runtime data is imported observation, not Codeville capture, field qualification, or a complete execution proof.

- [ ] **Step 2: Run the fixture equivalence test first**

Run: `pnpm test -- packages/core/src/runtime/derive.test.ts`

Expected: PASS with equal normalized spans and traces.

- [ ] **Step 3: Update architecture and security boundaries**

In `docs/architecture.md`, add the separate flow:

```text
OTLP JSON/JSONL -> parse -> normalize/redact -> derive -> exact correlate -> Runtime Lens -> offline export
```

In `docs/security.md`, record the exact default limits, redaction keys, no-network/no-execution rules, hostile trace attacker, raw-input non-retention, CSP, and exact-ID preservation. Keep the existing hostile-repository and static export sections unchanged.

- [ ] **Step 4: Run the full completion audit**

Run each command separately and record its exit status and exact result:

```bash
pnpm test
pnpm typecheck
pnpm -F @codeville/atlas-ui build
pnpm build
pnpm fidelity
pnpm langs
pnpm realrepo .
```

Then generate `/tmp/codeville-runtime-atlas.html`, open it through `file://`, and verify:

- Runtime Lens opens with the fixture trace.
- Timeline, call tree, hot path, error paths, and span details show the same selected trace.
- `Open matched source` moves to `packages/core/src/runtime/index.ts` in Static Atlas.
- The text timeline exposes every visible span.
- No network request occurs.
- A 390px viewport has no horizontal overflow.
- The hostile script string is text only.

Write all results to `docs/superpowers/plans/2026-08-31-runtime-lens-verification.md`. Mark unavailable browser automation as `NOT_RUN`; do not convert it to a pass.

- [ ] **Step 5: Commit fixtures, documentation, and verification evidence**

```bash
git add README.md docs/architecture.md docs/security.md docs/superpowers/plans/2026-08-31-runtime-lens-verification.md
git commit -m "docs: verify runtime lens end to end"
```

---

## Final requirement-to-evidence map

| Requirement | Authoritative evidence |
| --- | --- |
| OTLP JSON and JSONL import | Core fixture-equivalence and parser tests; browser ingest test; CLI generated HTML |
| Exact runtime identities and timestamps | Normalizer tests for full IDs and 64-bit decimal strings |
| Timeline, tree, hot path, error paths, details | Runtime view-model, component, and manual file-HTML checks |
| Static/runtime separation | Unchanged static tests, truth-label component assertions, source-correlation tests |
| Exact source correlation | POSIX/Windows/source-root tests and fixture source handoff |
| Accessibility | Complete DOM text-timeline tests, native-control tests, keyboard checks |
| Security and privacy | Limit/redaction tests, hostile export test, CSP/no-external-URL scan |
| Browser and CLI integration | Web local-file test, CLI argument tests, generated HTML smoke test |
| Offline export | Standalone tests and `file://` runtime check with network observation |
| Regression safety | Full test, typecheck, builds, fidelity, language fixtures, and `realrepo .` |
| Mobile layout | CSS contract plus 390px overflow check |
