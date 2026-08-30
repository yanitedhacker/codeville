# Runtime Lens Design

## Status

The owner requested end-to-end runtime visualization on 2026-08-31. This design uses the earlier recommended v1 boundary: Codeville imports existing OTLP JSON traces. It does not launch or instrument a target program.

## Purpose

Codeville currently shows a deterministic graph of source files and static import facts. Its moving packets, guided tour, dependency cones, and directed paths do not show program execution.

Add a separate **Runtime Lens** that shows observed spans from an imported OpenTelemetry trace. Keep static source facts and observed runtime facts separate at every API, label, view, and export boundary.

The complete v1 flow is:

```text
local repository + local OTLP JSON/JSONL
  -> static Atlas + normalized RuntimeTraceBundle
  -> Runtime Lens timeline and evidence panels
  -> optional exact source-file correlation
  -> self-contained offline HTML
```

## Selected approach

Use a separate runtime model and renderer inside the existing Codeville product.

Two alternatives were rejected:

1. Adding runtime counts and packets to `AtlasLink` would reuse more canvas code, but it would mix import evidence with observed calls.
2. Building a separate trace-viewer application would isolate runtime data, but it would duplicate Codeville input, export, theme, and source-inspection behavior.

Runtime Lens keeps the evidence contracts separate and still lets a user move between a span and an exactly matched source file.

## Scope

V1 includes:

- local OTLP JSON and JSON Lines import;
- browser and CLI import paths;
- trace and service selection;
- an observed-span timeline;
- a call tree;
- a defined hot path;
- error ancestry paths;
- span, event, resource, scope, status, and dropped-data details;
- exact file correlation from OpenTelemetry code attributes;
- sanitized, self-contained offline HTML export;
- deterministic normalization and derived views;
- accessible DOM alternatives for every canvas fact.

## Non-goals

V1 does not include:

- an OTLP network receiver;
- live tailing;
- launching, executing, or instrumenting an analyzed repository;
- an OpenTelemetry Collector configuration manager;
- protobuf, gzip, zstd, Jaeger, or Zipkin import;
- cross-trace causal inference;
- guessed source correlation;
- root-cause claims;
- a claim that imported spans show complete execution;
- changes to static `AtlasLink` evidence or the existing `Trace one step` behavior.

## Truth and evidence contract

The UI uses these terms exactly:

- **Static atlas**: repository-derived imports and containment.
- **Runtime lens**: spans observed in imported OTLP data.
- **Hot path**: the root-to-leaf parent chain with the greatest sum of recorded span durations. It is not a distributed critical-path proof.
- **Error path**: a recorded error span and its known parent ancestry. It is not a root-cause claim.
- **Source match**: an exact normalized file-path match. A function name or line number adds context but does not prove function execution beyond the span producer's recorded attribute.

Every runtime view states `Observed in imported trace data; this view may be incomplete.` The view also shows sampling indicators, OTLP dropped-field counts, unknown-field counts, orphan counts, cycle-break counts, redaction counts, and unmatched-source counts when they are non-zero.

Static packets remain labeled as import statements. Runtime spans do not replace, recolor, or add facts to static import links.

## Input contract

Accept either:

1. one UTF-8 JSON object with a top-level `resourceSpans` array; or
2. UTF-8 JSON Lines where each non-empty line contains one object with a `resourceSpans` array.

This shape covers OTLP `ExportTraceServiceRequest`, OTLP `TracesData`, and the OpenTelemetry file-exporter trace format. Lower-camel-case OTLP JSON field names are required. Enum values must be integers. Trace and span IDs must use hexadecimal OTLP JSON encoding. Unknown fields are ignored and counted in the import report.

Do not accept a bare `ResourceSpans` object, mixed telemetry signals, compressed input, protobuf, or remote URLs.

### Default limits

The pure importer accepts configurable limits. Browser and CLI entry points use these defaults:

| Limit | Default |
| --- | ---: |
| UTF-8 input | 25 MiB |
| One JSONL line | 8 MiB |
| Trace count | 10,000 |
| Total spans | 50,000 |
| Spans in one trace | 20,000 |
| Resource/scope groups | 2,000 |
| Attributes per owner | 128 |
| Events per span | 256 |
| Links per span | 128 |
| Attribute nesting depth | 8 |
| One string or byte value | 16 KiB |

An input that exceeds a limit fails before a runtime bundle is exposed. The error names the failed limit and its measured count. It does not echo untrusted values.

## Core data model

Add a browser-safe, DOM-free runtime domain under `packages/core/src/runtime/`.

The public model is plain JSON data. It must not contain `bigint`, class instances, raw input text, or nondeterministic timestamps.

```ts
export interface RuntimeTraceBundle {
  version: 1
  format: 'otlp-json'
  traces: RuntimeTrace[]
  spans: RuntimeSpan[]
  report: RuntimeImportReport
}

export interface RuntimeTrace {
  traceId: string
  startTimeUnixNano: string
  endTimeUnixNano: string
  spanIds: string[]
  rootSpanIds: string[]
  orphanSpanIds: string[]
  cycleBreakSpanIds: string[]
  hotPathSpanIds: string[]
  errorPaths: string[][]
}

export interface RuntimeSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: 0 | 1 | 2 | 3 | 4 | 5
  startTimeUnixNano: string
  endTimeUnixNano: string
  durationNano: string
  status: { code: 0 | 1 | 2; message?: string }
  serviceName: string
  resource: RuntimeAttributes
  scope: RuntimeScope
  attributes: RuntimeAttributes
  events: RuntimeEvent[]
  links: RuntimeLink[]
  dropped: { attributes: number; events: number; links: number }
  relation: 'root' | 'child' | 'orphan' | 'cycle-broken'
  source?: RuntimeSourceMatch
}
```

OTLP 64-bit integers are parsed with `BigInt`, validated, and stored as canonical decimal strings. UI calculations use relative `BigInt` differences before conversion to bounded canvas coordinates. Absolute epoch nanoseconds never become JavaScript `number` values.

Decode OTLP `AnyValue` as a tagged union. Keep strings, booleans, decimal integer strings, finite doubles, byte values, arrays, and key-value lists distinct. Sort attribute keys for deterministic output.

## Validation and normalization

The importer is all-or-nothing for syntax, structural validity, and resource limits.

- Require a non-empty span name.
- Require a 32-character, non-zero hexadecimal trace ID.
- Require a 16-character, non-zero hexadecimal span ID and parent span ID when present.
- Canonicalize IDs to lower case.
- Require valid integer enum values.
- Require valid decimal nanosecond strings. A JSON number is accepted only when it is a safe integer.
- Require `endTimeUnixNano >= startTimeUnixNano`.
- Reject duplicate attribute keys within one owner.
- Coalesce byte-identical duplicate spans and count them.
- Reject conflicting spans with the same trace and span IDs.
- Preserve a missing parent as an explicit orphan. Do not convert it to a normal root.
- Detect parent cycles. Break the edge from the lexicographically greatest span ID in each cycle and mark that span `cycle-broken`.
- Sort traces by trace ID. Sort spans by start time, end time, and span ID.

Unknown fields are not copied into the runtime model. The report stores their field paths and counts, subject to a diagnostic cap.

## Redaction and privacy

The original OTLP text is released after import and is never stored, cached, written into the analyzed repository, or embedded in an export.

Before the normalized model is exposed, redact attribute values whose case-insensitive keys match:

```text
authorization, cookie, token, secret, password, credential,
api-key, api_key, private-key, private_key, session,
db.statement, db.query.text, http.request.body, http.response.body
```

Keep the key and replace its value with a typed redaction marker. Record exact redaction counts. Apply the same rule to resource, scope, span, event, and link attributes.

Keep trace IDs and span IDs because they are the primary evidence identities and parent-link keys. The UI can shorten them in dense lists, but the details panel and export keep the exact values.

React text nodes and canvas text are the only display sinks. Do not use `innerHTML` or evaluate any imported value.

## Derived runtime views

Pure functions in `packages/core/src/runtime/derive.ts` build the evidence-bearing trace order, parent groups, hot path, and error paths. The UI can build selection, filter, and canvas-geometry projections from those derived fields, but it must not recompute or change the evidence-bearing paths.

### Timeline

Order spans by start time, end time, and span ID. Group lanes by `service.name`, with `(unknown service)` as an explicit value. Render relative time from the selected trace start. A selected span highlights its known ancestors and descendants.

### Call tree

Show normal roots, a `Missing parent` group, and cycle-broken roots. Sort children by start time, end time, and span ID. Do not invent a parent.

### Hot path

Choose the root-to-leaf parent chain with the greatest sum of non-negative recorded span durations. Break ties by earlier first start, then lexicographic span-ID sequence. The UI includes the formula and the non-causal warning.

### Error paths

For every span with `status.code === 2`, show its known root-to-error ancestry. Sort paths by error time, deeper ancestry, and span-ID sequence. Do not infer errors from attribute names or event text.

## Source correlation

Use the stable OpenTelemetry attributes `code.file.path`, `code.function.name`, and `code.line.number`. Accept the deprecated `code.filepath`, `code.function`, and `code.lineno` names with a visible compatibility warning.

A match is exact only when:

1. a relative `code.file.path` equals one visible `AtlasNode.path`; or
2. an absolute `code.file.path` is inside an explicit source root and the normalized relative path equals one visible `AtlasNode.path`.

The CLI source root defaults to the analyzed repository root. Browser import offers an optional `Source root recorded in the trace` field. Without that root, absolute paths remain unmatched.

Do not use basename or suffix guessing. Do not create an import edge or a runtime call edge from a source match. A matched span can focus its file block in Static Atlas and show the recorded function and line details.

## User interface

`Atlas` accepts an optional `runtime` bundle. With no bundle, static behavior and layout remain unchanged.

When a bundle exists, show a `Static atlas | Runtime lens` mode control. Keep the current static header, renderer, panels, packet controls, and wording unchanged.

Runtime Lens has four regions:

1. **Run rail**: trace selector, service filter, status filter, minimum duration, errors-only control, and clear action.
2. **Summary**: selected trace ID, span count, time range, service count, error count, and all completeness warnings.
3. **Timeline**: a dedicated canvas renderer with service lanes, a relative-time scale, span bars, status marks, pan, zoom, reset, hover, and selection.
4. **Inspector**: `Span details`, `Call tree`, `Hot path`, and `Error paths` tabs.

Selection is synchronized across the timeline, tree, paths, details, and exact source match. Filters change visibility only. They do not change the normalized evidence model.

Canvas owns dense bars, grid lines, time-scale paint, and hit testing. DOM owns every control, warning, identifier, attribute, event, tree row, path row, and a complete textual timeline. The textual timeline states service, span name, start offset, duration, status, parent, and source-match state for each visible span.

All actions use native controls. Status changes use `aria-live="polite"`. Color is never the only status signal. Reduced motion is honored. At widths below 860px, the run rail, timeline, and inspector stack. The 390px view has no document-level horizontal overflow and keeps interactive targets at least 44px high.

## Browser flow

After a repository atlas exists, the footer adds `Import OTLP trace`. The picker accepts `.json` and `.jsonl` files. An optional source-root field is part of the import dialog.

Import runs locally. It performs no `fetch`, XHR, WebSocket, beacon, storage, worker evaluation, or repository write. A successful import opens Runtime Lens on the existing mounted Atlas without discarding its static selection or layout state. A failed import leaves the prior Atlas and runtime bundle unchanged and shows a safe error.

`Clear runtime data` releases the normalized bundle and returns to Static Atlas.

## CLI flow

Add:

```text
--trace <file>              local OTLP JSON or JSONL trace
--trace-source-root <path>  source root recorded by code.file.path
```

When `--trace` is present, HTML output includes Runtime Lens and opens it by default. The default trace source root is the analyzed repository root.

`--trace` with `.json` Atlas output is rejected in v1 with a clear message. This avoids changing the existing Atlas JSON contract. Markdown reports remain static-source reports and state that runtime data is not included.

## Offline export

Extend `renderStandaloneHtml` with an optional runtime payload while keeping current callers valid. Embed the sanitized `RuntimeTraceBundle` through the existing `embedJson` escaping path. Never embed raw OTLP text.

Add a restrictive meta CSP to generated files:

```text
default-src 'none'; connect-src 'none'; img-src data:;
style-src 'unsafe-inline'; script-src 'unsafe-inline';
font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
```

The downloaded file contains no external asset, network receiver, or remote URL. It opens through `file://` and supports both Static Atlas and Runtime Lens.

The export action says that it includes sanitized telemetry. The bundle report and all completeness warnings remain visible after export.

## Error handling

- Syntax, schema, identifier, time, duplicate, and limit errors reject the whole new import.
- Errors use stable categories and counts. They do not include raw input values or stack traces.
- Orphans, cycle breaks, unknown fields, deprecated attributes, exact duplicate spans, redactions, OTLP dropped counts, and unmatched sources are successful imports with visible warnings.
- An empty `resourceSpans` array is valid and renders an empty runtime state.
- A trace with no normal root still renders its orphan and cycle-broken groups.

## Module boundaries

```text
packages/core/src/runtime/
  types.ts          serializable runtime contract and limits
  otlp-json.ts      JSON/JSONL framing and OTLP field decoding
  normalize.ts      validation, redaction, and duplicate handling
  derive.ts         cycle handling, timeline order, tree, hot path, and error paths
  correlate.ts      explicit source-root path matching
  index.ts          importOtlpTraceJson public API

packages/atlas-ui/src/runtime/
  RuntimeLens.tsx   mode-level state and layout
  Timeline.tsx      canvas lifecycle and DOM alternative
  TimelineRenderer.ts canvas paint, transform, and hit testing
  RuntimeInspector.tsx details, tree, hot path, and errors
  TraceRail.tsx     trace selection and filters

apps/web/src/runtime/
  ingest.ts         local File byte check and core importer call
```

`AtlasRenderer` remains the static renderer. `TimelineRenderer` does not import or mutate static graph logic.

## Testing

Use strict test-driven development.

### Core

- official-shape JSON and JSONL fixtures;
- lower-camel field enforcement and unknown-field reporting;
- `AnyValue` type preservation;
- exact 64-bit nanosecond handling;
- invalid IDs, enums, times, attribute keys, duplicate spans, and caps;
- roots, orphans, cycle breaking, deterministic ordering, hot-path ties, and error paths;
- redaction at every attribute owner;
- exact source-root correlation and no suffix guessing;
- input permutation produces the same normalized bundle.

### UI

- mode switch does not change static mode behavior;
- trace, service, status, duration, and error filters;
- selection synchronization across canvas and DOM views;
- deterministic timeline geometry and hit testing;
- complete textual timeline and keyboard operation;
- visible incomplete, orphan, cycle, redaction, and unmatched-source warnings;
- empty bundle and no-error states;
- reduced motion and 390px responsive contracts.

### Web, CLI, and export

- local file input only and no network or storage API call during trace import;
- a successful browser import opens Runtime Lens without remounting Atlas or losing static state;
- previous runtime state survives a rejected replacement import;
- CLI argument parsing and source-root default;
- CLI HTML includes runtime data and `.json` plus `--trace` rejects;
- hostile span names and attributes cannot break out of the payload script;
- generated HTML contains the CSP and no external dependency;
- static export without runtime remains compatible;
- standalone runtime HTML renders from `file://`.

## Completion criteria

The feature is complete only when:

1. a real OTLP JSON and JSONL fixture imports through core, browser, and CLI paths;
2. the same selected trace shows a timeline, call tree, hot path, error paths, and span details;
3. exact source correlation can move from a span to the matching static file without creating a runtime import claim;
4. every runtime fact has an accessible textual representation;
5. sanitized offline export preserves both views and makes no network request;
6. invalid and hostile traces fail safely with no partial replacement state;
7. existing static tests, typecheck, builds, fidelity checks, language fixtures, and real-repository analysis remain green;
8. a 390px runtime view has no horizontal overflow;
9. documentation states the static/runtime boundary and the v1 import-only boundary.
