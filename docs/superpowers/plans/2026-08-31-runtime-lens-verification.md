# Runtime Lens end-to-end verification

## Record status

The original repaired-head record below remains intact. A second bounded repair was executed on the working tree based on branch HEAD `5c0f4273ccc0ac00fda5d765da625da3fe5032e4`. The serialized-bundle performance and limit-documentation findings are repaired. Bounded axe automation is now present. Direct `file://` execution remains `NOT_RUN` for the recorded environment reason. On `2026-09-01`, the owner explicitly removed reduced-motion emulation from the merge requirements. This is an owner waiver, not a test pass. The three direct-file rows remain merge-blocking. A `NOT_RUN` check is not a pass.

## Second bounded blocker repair

Recorded at `2026-08-31T14:39:32Z` on branch `yanitedhacker/runtime-lens`. The changes were not committed, pushed, or merged.

| Exact command or check | Exit/status | Exact counts/result | Skips | Evidence boundary |
| --- | --- | --- | --- | --- |
| Early-abort RED: `pnpm exec vitest run packages/core/src/runtime/bundle-size.test.ts` | Exit 1; expected RED | 1/1 failed. The eager walker read the full 10,000-item array and reported 190,338 bytes instead of stopping at the first 73-byte over-limit prefix. | 0 | Proved the reported eager-traversal defect before the production change. |
| Early-abort GREEN: focused bundle-size, derive, correlate, standalone export, and browser-ingest tests | Exit 0; PASS | The final focused ingest/bundle/correlation/export run passed 4/4 files and 25/25 tests. The earlier derive-inclusive run passed 4/4 files and 29/29 tests. | 0 | Proves incremental rejection, exact accepted-size measurement, post-correlation enforcement, browser-ingest enforcement, and script-escaped export enforcement. |
| `pnpm exec vitest run packages/atlas-ui/src/runtime/RuntimeLens.axe.test.tsx` | Exit 0; PASS | 1/1 test passed; no axe-detectable WCAG A or AA issue was reported in the rendered primary Runtime Lens state. | 0 | Simulated `happy-dom` only. `color-contrast` is disabled because the simulated DOM does not calculate that rule. This is not a browser color audit or a complete WCAG pass. |
| `pnpm test` with local IPC permission | Exit 0; PASS | 54/54 test files and 493/493 tests passed. | 0 | Full local Node/Vitest suite. No direct-file, field, or target-execution claim. |
| `pnpm typecheck` | Exit 0; PASS | TypeScript completed with no diagnostic output. | N/A | Static type analysis only. |
| `pnpm -F @codeville/atlas-ui build` | Exit 0; PASS | 28 modules; CSS 15.50 kB, gzip 3.39 kB; JS 92.96 kB, gzip 30.32 kB. | N/A | Local standalone production-bundle build. |
| `pnpm build` | Exit 0; PASS | 90 modules; HTML 0.60 kB; CSS 18.32 kB; JS 660.99 kB, gzip 194.18 kB. | N/A | Local web build. The greater-than-500-kB Vite chunk warning remains a recorded diagnostic. |
| `pnpm fidelity` | Exit 0; PASS | 126 source files; 126 exact; 0 heuristic; 0 unsupported; 410 import facts; 274 internal; 91 external; 43 system; 2 unresolved; 0 ignored; 3 rolled-up; 0 hidden; 99.3% reported internal resolution coverage. | N/A | The two known unresolved CSS imports remain explicit. Exit 0 is not a quality-threshold claim. |
| `pnpm langs` | Exit 0; PASS | Python 4/4, Go 2/2, Rust 4/4. | 0 | Synthetic language fixtures only. |
| `pnpm realrepo .` | Exit 0; PASS | 126 source files; 274 internal; 91 external; 43 system; 2 unresolved; 0 ignored; 9 external packages. | N/A | Repository analysis completed. Exit 0 is not a quality-threshold claim. |
| Fresh JSON artifact generation | Exit 0; PASS | 131 files read; 134 nodes; 356 links; 8 packages; 2 traces; 3 spans; `/tmp/codeville-runtime-atlas.html` is 420,645 bytes with SHA-256 `2e399e42dfff602fef062c15278b39d5b69144c195c3bd0dd56234393e952599`. | 0 | Local synthetic fixture and generated artifact only. |
| Fresh JSONL artifact generation | Exit 0; PASS | 131 files read; 134 nodes; 356 links; 8 packages; 2 traces; 3 spans; `/tmp/codeville-runtime-atlas-jsonl.html` is 420,645 bytes with SHA-256 `b1541750a37d0e4c5ade16d41b1d4c5cd5081a17e1969632c3310fddc331c469`. | 0 | Local synthetic fixture and generated artifact only. |
| Independent read-only review and focused re-review | PASS | No Critical or remaining Important finding. One axe-evidence overclaim was found, corrected, and re-reviewed as PASS. | N/A | Separate reviewer agent. CodeRabbit CLI remains unavailable and is not claimed. |
| `git diff --check` | Exit 0; PASS | No whitespace error. | N/A | Working-tree hygiene only. |

### Browser rows and owner decision

| Check | Status | Exact reason | Merge effect |
| --- | --- | --- | --- |
| Direct JSON `file:///tmp/codeville-runtime-atlas.html` execution | `NOT_RUN` | Codex In-app Browser rejected the URL under its browser security policy and prohibited alternate-browser or indirect workarounds. | Blocking. |
| Direct JSONL `file:///tmp/codeville-runtime-atlas-jsonl.html` execution | `NOT_RUN` | The same direct-file policy applies. | Blocking. |
| Combined direct-file Runtime Lens, synchronized views, source handoff, text timeline, responsive layout, target sizes, and Markdown workflow | `NOT_RUN` | Direct generated-file execution is unavailable in this browser environment. Local-server and static artifact evidence do not replace it. | Blocking. |
| Manual reduced-motion emulation | `WAIVED` | On `2026-09-01`, the owner stated: "no need for reduce motion, proceed without it". The check was removed from the merge requirements and is not claimed as a pass. | Not blocking by explicit owner decision. |

The merge gate remains closed on the three direct-file rows. The exact manual handoff inputs are `/tmp/codeville-runtime-atlas.html`, `/tmp/codeville-runtime-atlas-jsonl.html`, and `/tmp/codeville-runtime-report.md`.

## Execution identity

| Field | Exact command | Result |
| --- | --- | --- |
| Record update UTC timestamp | `date -u +%Y-%m-%dT%H:%M:%SZ` | `2026-08-31T10:54:20Z` |
| Branch | `git branch --show-current` | `yanitedhacker/runtime-lens` |
| Code and browser HEAD tested | `git rev-parse HEAD` before this evidence-only update | `b7cfba4dcff6412ff0594593a3195cbcf969172c` |
| Node.js | `node --version` | `v22.23.1` |
| pnpm | `pnpm --version` | `10.12.1` |
| Platform | `uname -s` | `Darwin` |
| Architecture | `uname -m` | `arm64` |

## Superseded environment diagnostic

These results are not the product verdict. They predate repaired HEAD `b7cfba4dcff6412ff0594593a3195cbcf969172c` and only identify sandbox IPC boundaries.

| Exact command or check | Exit/status | Exact counts/result | Skips | Evidence boundary |
| --- | --- | --- | --- | --- |
| `pnpm test -- packages/core/src/runtime/derive.test.ts` in the restricted sandbox at HEAD `08c7709773b2daa6d02fc27b887744f498e7a49b` | Exit 1; superseded diagnostic | 47/49 files passed; 444/456 tests passed; 12 failures. Each reported CLI child-process failure contained `listen EPERM` for a local `tsx` pipe. | 0 reported | Sandbox denied local IPC. This is not a product test result. |
| Exact rerun with approved local IPC at HEAD `08c7709773b2daa6d02fc27b887744f498e7a49b` | Exit 0; superseded diagnostic | 49/49 files and 456/456 tests passed. | 0 | Proved the earlier failures were environmental. The corrected-HEAD rows below are authoritative. |
| `pnpm fidelity` in the restricted sandbox at HEAD `08c7709773b2daa6d02fc27b887744f498e7a49b` | Exit 1; superseded diagnostic | No analysis result; `tsx` failed at startup with `listen EPERM`. | N/A | Sandbox denied local IPC. This is not a fidelity result. |

## Final repair TDD and audit record

| Scope and exact command | RED result | GREEN result | Evidence boundary |
| --- | --- | --- | --- |
| Findings 1-3: `pnpm exec vitest run packages/core/src/runtime/normalize.test.ts packages/core/src/runtime/derive.test.ts packages/atlas-ui/src/standalone-html.test.ts` | Exit 1; 3/3 files failed; 15 failed and 69 passed. | Exit 0; 3/3 files and 85/85 tests passed. | Focused normalized-size, error-path, duplicate-conflict, retained-string, deep-chain, and escaped-export regressions. |
| Finding 4: `pnpm exec vitest run packages/atlas-ui/src/runtime/view-model.test.ts packages/atlas-ui/src/runtime/TraceRail.test.ts` | Exit 1; 5 failed and 13 passed; the accepted 20,000-span tree reproduced `RangeError: Maximum call stack size exceeded`. | Exit 0; 2/2 files and 18/18 tests passed. | Focused iterative projection and shallow accessible-tree evidence. |
| Finding 5: `pnpm exec vitest run packages/atlas-ui/src/runtime/RuntimeLens.test.tsx` | Exit 1; 1 failed and 10 passed; stale service value `db` remained instead of the empty control value. | Exit 0; 11/11 tests passed. | Focused controlled-filter transition evidence. |
| Findings 6-9: geometry, renderer, Timeline, and real-DOM Timeline files | Geometry: 4 failed/5 passed; renderer: 1 failed/5 passed; Timeline: 2 failed/3 passed; real DOM: 1/1 failed. | `pnpm exec vitest run packages/atlas-ui/src/runtime/timeline-geometry.test.ts packages/atlas-ui/src/runtime/TimelineRenderer.test.ts packages/atlas-ui/src/runtime/Timeline.test.tsx packages/atlas-ui/src/runtime/Timeline.dom.test.tsx`: exit 0; 4/4 files and 21/21 tests passed. | Focused exact-end, clipping, grid, vertical reachability, safe hover, and native-control evidence. |
| Findings 10-11: `pnpm exec vitest run packages/atlas-ui/src/runtime/RuntimeInspector.test.ts packages/atlas-ui/src/runtime/RuntimeInspector.dom.test.tsx apps/web/src/App.test.tsx apps/web/src/runtime/RuntimeImportDialog.dom.test.tsx` | Exit 1; 2 failed and 16 passed. | Exit 0; 4/4 files and 18/18 tests passed. | Focused happy-dom modal focus and roving-tab keyboard evidence. |
| Post-repair audit correction: `pnpm exec vitest run packages/core/src/runtime/correlate.test.ts apps/web/src/runtime/ingest.test.ts` | Exit 1; 2/2 files failed; 2 failed and 18 passed. Core did not throw after source-match amplification; browser ingest resolved instead of rejecting. | Exit 0; 2/2 files and 20/20 tests passed. | Proves the overrideable final correlated bundle is bounded before browser UI state. |

Repair commits are `365371f5a80de12de89190fb8285bc19b2f09dc9`, `0af1ab576319c4db4c8bbb5f9cf0e960124acec9`, `aacc8c3b830e53548f73dc392d0a7a0695e811e4`, and audit correction `b7cfba4dcff6412ff0594593a3195cbcf969172c`. An optional CodeRabbit audit could not run because the CLI was not installed (`NOT_INSTALLED`; `coderabbit auth status` returned command not found, exit 127). This is a tooling skip, not an audit pass. The bounded local committed-diff audit found the post-correlation limit gap above; after its correction, no further local blocker was found.

## Non-browser command record

| Exact command or check | Exit/status | Exact counts/result | Skips | Evidence boundary |
| --- | --- | --- | --- | --- |
| `rg -n -F 'Runtime data is imported observation' README.md` | Exit 0; PASS | One matching line at README line 123. | N/A | Documentation assertion only. |
| `rg -n -F 'OTLP JSON/JSONL -> parse -> normalize/redact -> derive -> exact correlate -> Runtime Lens -> offline export' docs/architecture.md` | Exit 0; PASS | One matching line at architecture line 39. | N/A | Documentation assertion only. |
| `rg -n -F 'Runtime trace import and export' docs/security.md` | Exit 0; PASS | One matching heading at security line 29. | N/A | Documentation assertion only. |
| `rg -n -F 'minimal-otlp.jsonl' fixtures/README.md` | Exit 0; PASS | Two matching lines at fixture README lines 5 and 13. | N/A | Documentation assertion only. |
| `pnpm test` with approved local IPC | Exit 0; PASS | 52/52 test files; 491/491 tests. | 0 | Full local Node/Vitest suite. No field, target-execution, or browser qualification claim. |
| `pnpm typecheck` | Exit 0; PASS | TypeScript `tsc -p tsconfig.json --noEmit` completed with no diagnostic output. | N/A | Static type analysis only. |
| `pnpm -F @codeville/atlas-ui build` | Exit 0; PASS | Vite transformed 28 modules; CSS 15.50 kB, gzip 3.39 kB; JS 92.96 kB, gzip 30.32 kB. | N/A | Local production-bundle build only. |
| `pnpm build` | Exit 0; PASS | Vite transformed 90 modules; HTML 0.60 kB, CSS 18.32 kB, JS 660.68 kB, gzip 194.08 kB. Vite emitted its greater-than-500-kB chunk warning. | N/A | Local web build only. The warning is not converted to a failure or hidden. |
| `pnpm fidelity` with approved local IPC | Exit 0; PASS | 124 source files; 124 exact; 0 heuristic; 0 unsupported; 401 import facts; 270 internal; 86 external; 43 system; 2 unresolved; 0 ignored; 3 rolled-up; 0 hidden; reported internal resolution coverage 99.3%. | N/A | The analysis completed. Exit 0 does not prove a quality threshold. The two reported unresolved CSS imports remain explicit. |
| `pnpm langs` with approved local IPC | Exit 0; PASS | Python 4/4, Go 2/2, Rust 4/4; 10/10 expected fixture edges. | 0 | Synthetic language fixtures only. |
| `pnpm realrepo .` with approved local IPC | Exit 0; PASS | 124 source files; 270 internal; 86 external; 43 system; 2 unresolved; 0 ignored; 8 external packages. | N/A | The repository analysis completed. Exit 0 does not prove a quality threshold. |
| `pnpm atlas . --trace fixtures/runtime/minimal-otlp.json --trace-source-root "$PWD" --report /tmp/codeville-runtime-report.md -o /tmp/codeville-runtime-atlas.html` with approved local IPC | Exit 0; PASS | Read 130 files; atlas 133 nodes, 353 links, 8 packages; runtime 2 traces, 3 spans; wrote the Markdown and JSON-input HTML artifacts. | 0 | Local import of a synthetic public fixture. It is not capture or target execution. |
| `pnpm atlas . --trace fixtures/runtime/minimal-otlp.jsonl --trace-source-root "$PWD" -o /tmp/codeville-runtime-atlas-jsonl.html` with approved local IPC | Exit 0; PASS | Read 130 files; atlas 133 nodes, 353 links, 8 packages; runtime 2 traces, 3 spans; wrote the JSONL-input HTML artifact. | 0 | Local import of a synthetic public fixture. It is not capture or target execution. |
| `[A1]` JSON artifact source-match extraction | Exit 0; PASS | 1 `kind:"file"` node at `packages/core/src/runtime/index.ts`; 1 matched source span with `traceId=11111111111111111111111111111111, spanId=0000000000000001`; `unmatchedSourceSpans=0`; 1 document, 2 traces, 3 spans, 1 error, 1 redaction. | N/A | Serialized payload inspection. Browser handoff remains separate. |
| `[A2]` JSONL artifact source-match extraction | Exit 0; PASS | 1 `kind:"file"` node at `packages/core/src/runtime/index.ts`; 1 matched source span with `traceId=11111111111111111111111111111111, spanId=0000000000000001`; `unmatchedSourceSpans=0`; 2 documents, 2 traces, 3 spans, 1 error, 1 redaction. | N/A | Serialized payload inspection. Browser handoff remains separate. |
| `[A3]` Normalized JSON versus JSONL bundle comparison | Exit 0; PASS | `tracesEqual=true`; `spansEqual=true`; JSON documents 1; JSONL documents 2; 2 traces; 3 spans; 1 error; 1 redacted attribute. | N/A | Serialization equality for normalized traces and spans only. |
| `test -s /tmp/codeville-runtime-atlas.html` | Exit 0; PASS | Non-empty file. | N/A | File existence and non-zero size only. |
| `test -s /tmp/codeville-runtime-atlas-jsonl.html` | Exit 0; PASS | Non-empty file. | N/A | File existence and non-zero size only. |
| `test -s /tmp/codeville-runtime-report.md` | Exit 0; PASS | Non-empty file. | N/A | File existence and non-zero size only. |
| `rg -n '__CODEVILLE_RUNTIME__' /tmp/codeville-runtime-atlas.html` | Exit 0; PASS | 3 matching lines; the HTML contains the runtime payload assignment and standalone runtime references. | N/A | Text presence only; runtime rendering remains a browser check. |
| `rg -n '__CODEVILLE_RUNTIME__' /tmp/codeville-runtime-atlas-jsonl.html` | Exit 0; PASS | 3 matching lines; the HTML contains the runtime payload assignment and standalone runtime references. | N/A | Text presence only; runtime rendering remains a browser check. |
| `rg -o -c '__CODEVILLE_RUNTIME__' /tmp/codeville-runtime-atlas.html` | Exit 0; PASS | 4 text occurrences. | N/A | Supplementary text count only. |
| `rg -o -c '__CODEVILLE_RUNTIME__' /tmp/codeville-runtime-atlas-jsonl.html` | Exit 0; PASS | 4 text occurrences. | N/A | Supplementary text count only. |
| `rg -n 'fixture-secret' /tmp/codeville-runtime-atlas.html` | Exit 1; PASS expected absence | No matches. Exit 1 is the expected `rg` absence result and is not converted to exit 0. | N/A | Proves the public fixture secret string is absent from this file. |
| `rg -n 'fixture-secret' /tmp/codeville-runtime-atlas-jsonl.html` | Exit 1; PASS expected absence | No matches. Exit 1 is the expected `rg` absence result and is not converted to exit 0. | N/A | Proves the public fixture secret string is absent from this file. |
| `rg -n -F 'Runtime trace data is not included in this static-source Markdown report.' /tmp/codeville-runtime-report.md` | Exit 0; PASS | One exact match at line 540. | N/A | Markdown exclusion statement only. Runtime data is not treated as Markdown evidence. |
| `[A4]` Active external-resource and remote CSS scan of `/tmp/codeville-runtime-atlas.html` | Exit 0; PASS | 0 active external-resource tags; 0 remote CSS references. | N/A | Static HTML text scan. Inert imported URL-like text is not classified as active. Network behavior remains a browser check. |
| `[A5]` Active external-resource and remote CSS scan of `/tmp/codeville-runtime-atlas-jsonl.html` | Exit 0; PASS | 0 active external-resource tags; 0 remote CSS references. | N/A | Static HTML text scan. Inert imported URL-like text is not classified as active. Network behavior remains a browser check. |
| `[A6]` Exact CSP search in `/tmp/codeville-runtime-atlas.html` | Exit 0; PASS | One meta CSP at line 6: `default-src 'none'; connect-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`. | N/A | Static CSP presence only. |
| `[A7]` Exact CSP search in `/tmp/codeville-runtime-atlas-jsonl.html` | Exit 0; PASS | One meta CSP at line 6 with the same exact policy. | N/A | Static CSP presence only. |
| `stat -f '%z %N' /tmp/codeville-runtime-atlas.html` | Exit 0; PASS | 418167 bytes. | N/A | Local file metadata. |
| `stat -f '%z %N' /tmp/codeville-runtime-atlas-jsonl.html` | Exit 0; PASS | 418167 bytes. | N/A | Local file metadata. |
| `stat -f '%z %N' /tmp/codeville-runtime-report.md` | Exit 0; PASS | 60985 bytes. | N/A | Local file metadata. |
| `shasum -a 256 /tmp/codeville-runtime-atlas.html` | Exit 0; PASS | `7ca0a8eeda79d2975be8b3f81df5158a58c1ec879b831e38172fbf3f256552cb`. | N/A | SHA-256 identity of the fresh local artifact. |
| `shasum -a 256 /tmp/codeville-runtime-atlas-jsonl.html` | Exit 0; PASS | `7423b967ba51d3048b9b469bd5bbd8dac8db3fdb7e43e51e6de46bbfe6bf557f`. | N/A | SHA-256 identity of the fresh local artifact. |
| `shasum -a 256 /tmp/codeville-runtime-report.md` | Exit 0; PASS | `7fca3e2261ef1a18957ab7d12ed7066bf3fab17f4824f2b63308c078a3f562bb`. | N/A | SHA-256 identity of the fresh local artifact. |
| `git diff --check fb72246542f1d5c1097cb57ec0677b0a7efe0215..HEAD` at code HEAD `b7cfba4dcff6412ff0594593a3195cbcf969172c` | Exit 0; PASS | No whitespace errors. | N/A | Whole reviewed branch through the final code repair. |
| `git status --short --branch` before this evidence-only update | Exit 0; PASS | Clean branch at `b7cfba4dcff6412ff0594593a3195cbcf969172c`. | N/A | Pre-documentation inventory. |

### Exact literal artifact commands

The `[A1]` through `[A7]` labels in the command table refer to these exact commands. Each command was rerun against the unchanged artifact hashes during the documentation correction.

`[A1]` JSON artifact source-match extraction:

```bash
node -e 'const fs=require("node:fs"); const html=fs.readFileSync("/tmp/codeville-runtime-atlas.html","utf8"); const atlasMatch=/window\.__CODEVILLE_ATLAS__=(.*?)<\/script>/s.exec(html); const runtimeMatch=/window\.__CODEVILLE_RUNTIME__=(.*?)<\/script>/s.exec(html); if(!atlasMatch||!runtimeMatch) process.exit(2); const atlas=JSON.parse(atlasMatch[1]); const runtime=JSON.parse(runtimeMatch[1]); const nodes=atlas.nodes.filter((node)=>node.kind==="file"&&node.path==="packages/core/src/runtime/index.ts"); const matched=runtime.spans.filter((span)=>span.source?.path==="packages/core/src/runtime/index.ts"); const result={fileNodes:nodes.length,fileNodeKinds:nodes.map((node)=>node.kind),matchedSourceSpans:matched.length,matchedSourceIdentities:matched.map((span)=>({traceId:span.traceId,spanId:span.spanId})),unmatchedSourceSpans:runtime.report.unmatchedSourceSpans,documents:runtime.report.documents,traces:runtime.traces.length,spans:runtime.spans.length,redactedAttributes:runtime.report.redactedAttributes,errors:runtime.spans.filter((span)=>span.status.code===2).length}; console.log(JSON.stringify(result)); if(nodes.length!==1||matched.length!==1||runtime.report.unmatchedSourceSpans!==0) process.exit(1)'
```

`[A2]` JSONL artifact source-match extraction:

```bash
node -e 'const fs=require("node:fs"); const html=fs.readFileSync("/tmp/codeville-runtime-atlas-jsonl.html","utf8"); const atlasMatch=/window\.__CODEVILLE_ATLAS__=(.*?)<\/script>/s.exec(html); const runtimeMatch=/window\.__CODEVILLE_RUNTIME__=(.*?)<\/script>/s.exec(html); if(!atlasMatch||!runtimeMatch) process.exit(2); const atlas=JSON.parse(atlasMatch[1]); const runtime=JSON.parse(runtimeMatch[1]); const nodes=atlas.nodes.filter((node)=>node.kind==="file"&&node.path==="packages/core/src/runtime/index.ts"); const matched=runtime.spans.filter((span)=>span.source?.path==="packages/core/src/runtime/index.ts"); const result={fileNodes:nodes.length,fileNodeKinds:nodes.map((node)=>node.kind),matchedSourceSpans:matched.length,matchedSourceIdentities:matched.map((span)=>({traceId:span.traceId,spanId:span.spanId})),unmatchedSourceSpans:runtime.report.unmatchedSourceSpans,documents:runtime.report.documents,traces:runtime.traces.length,spans:runtime.spans.length,redactedAttributes:runtime.report.redactedAttributes,errors:runtime.spans.filter((span)=>span.status.code===2).length}; console.log(JSON.stringify(result)); if(nodes.length!==1||matched.length!==1||runtime.report.unmatchedSourceSpans!==0) process.exit(1)'
```

`[A3]` normalized JSON versus JSONL comparison:

```bash
node -e 'const fs=require("node:fs"); const read=(path)=>{const html=fs.readFileSync(path,"utf8"); const m=/window\.__CODEVILLE_RUNTIME__=(.*?)<\/script>/s.exec(html); if(!m) process.exit(2); return JSON.parse(m[1])}; const json=read("/tmp/codeville-runtime-atlas.html"); const jsonl=read("/tmp/codeville-runtime-atlas-jsonl.html"); const tracesEqual=JSON.stringify(json.traces)===JSON.stringify(jsonl.traces); const spansEqual=JSON.stringify(json.spans)===JSON.stringify(jsonl.spans); console.log(JSON.stringify({tracesEqual,spansEqual,jsonDocuments:json.report.documents,jsonlDocuments:jsonl.report.documents,traces:json.traces.length,spans:json.spans.length,errors:json.spans.filter((span)=>span.status.code===2).length,redactedAttributes:json.report.redactedAttributes})); if(!tracesEqual||!spansEqual) process.exit(1)'
```

`[A4]` JSON HTML active-resource and remote CSS scan:

```bash
node -e 'const fs=require("node:fs"); const html=fs.readFileSync("/tmp/codeville-runtime-atlas.html","utf8"); const styles=[...html.matchAll(/<style\b[^>]*>(.*?)<\/style\s*>/gis)].map((m)=>m[1]||"").join("\n"); const markup=html.replace(/(<script\b[^>]*>).*?(<\/script\s*>)/gis,"$1$2").replace(/(<style\b[^>]*>).*?(<\/style\s*>)/gis,"$1$2"); const tags=markup.match(/<[A-Za-z][^>]*>/g)||[]; const activeTags=tags.filter((tag)=>(/<script\b/i.test(tag)&&/\bsrc\s*=/i.test(tag))||(/<link\b/i.test(tag)&&/\bhref\s*=/i.test(tag))||(/<(?:img|iframe|frame|source)\b/i.test(tag)&&/\b(?:src|srcset)\s*=\s*(?:["\x27]\s*)?(?:https?:)?\/\//i.test(tag))); const remoteCss=[/@import\s+(?:url\s*\()?\s*["\x27]?(?:https?:)?\/\//gi,/url\(\s*["\x27]?(?:https?:)?\/\//gi].flatMap((pattern)=>styles.match(pattern)||[]); console.log(JSON.stringify({activeExternalResourceTags:activeTags.length,remoteCssReferences:remoteCss.length})); if(activeTags.length||remoteCss.length) process.exit(1)'
```

`[A5]` JSONL HTML active-resource and remote CSS scan:

```bash
node -e 'const fs=require("node:fs"); const html=fs.readFileSync("/tmp/codeville-runtime-atlas-jsonl.html","utf8"); const styles=[...html.matchAll(/<style\b[^>]*>(.*?)<\/style\s*>/gis)].map((m)=>m[1]||"").join("\n"); const markup=html.replace(/(<script\b[^>]*>).*?(<\/script\s*>)/gis,"$1$2").replace(/(<style\b[^>]*>).*?(<\/style\s*>)/gis,"$1$2"); const tags=markup.match(/<[A-Za-z][^>]*>/g)||[]; const activeTags=tags.filter((tag)=>(/<script\b/i.test(tag)&&/\bsrc\s*=/i.test(tag))||(/<link\b/i.test(tag)&&/\bhref\s*=/i.test(tag))||(/<(?:img|iframe|frame|source)\b/i.test(tag)&&/\b(?:src|srcset)\s*=\s*(?:["\x27]\s*)?(?:https?:)?\/\//i.test(tag))); const remoteCss=[/@import\s+(?:url\s*\()?\s*["\x27]?(?:https?:)?\/\//gi,/url\(\s*["\x27]?(?:https?:)?\/\//gi].flatMap((pattern)=>styles.match(pattern)||[]); console.log(JSON.stringify({activeExternalResourceTags:activeTags.length,remoteCssReferences:remoteCss.length})); if(activeTags.length||remoteCss.length) process.exit(1)'
```

`[A6]` JSON HTML exact CSP search:

```bash
rg -n -F "default-src 'none'; connect-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" /tmp/codeville-runtime-atlas.html
```

`[A7]` JSONL HTML exact CSP search:

```bash
rg -n -F "default-src 'none'; connect-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" /tmp/codeville-runtime-atlas-jsonl.html
```

The Task 9 `packages/atlas-ui/src/standalone-html.test.ts` breakout test is the authoritative hostile imported script-text evidence. The public fixtures do not contain that hostile string, so this record does not claim a manual hostile-string fixture check.

## Artifact manifest

| Path | Size | SHA-256 | Runtime result | Redaction | Documents |
| --- | ---: | --- | --- | --- | ---: |
| `/tmp/codeville-runtime-atlas.html` | 418167 bytes | `7ca0a8eeda79d2975be8b3f81df5158a58c1ec879b831e38172fbf3f256552cb` | 2 traces; 3 spans; 1 recorded error; 1 exact matched source span with `traceId=11111111111111111111111111111111, spanId=0000000000000001`; 0 unmatched source spans | 1 redacted attribute; `fixture-secret` absent | 1 |
| `/tmp/codeville-runtime-atlas-jsonl.html` | 418167 bytes | `7423b967ba51d3048b9b469bd5bbd8dac8db3fdb7e43e51e6de46bbfe6bf557f` | 2 traces; 3 spans; 1 recorded error; 1 exact matched source span with `traceId=11111111111111111111111111111111, spanId=0000000000000001`; 0 unmatched source spans | 1 redacted attribute; `fixture-secret` absent | 2 |
| `/tmp/codeville-runtime-report.md` | 60985 bytes | `7fca3e2261ef1a18957ab7d12ed7066bf3fab17f4824f2b63308c078a3f562bb` | Runtime trace data excluded by the exact statement at line 540 | Runtime input excluded | N/A |

The JSON and JSONL artifacts have equal normalized `traces` and `spans`. Their whole-file hashes differ because each Atlas records a different generation timestamp and each runtime report records its input document count.

## Browser and `file://` checks

The controller ran the Codex in-app Browser against `http://127.0.0.1:4173/` at exact code HEAD `b7cfba4dcff6412ff0594593a3195cbcf969172c`. The exact preview command was `pnpm -F @codeville/web preview --host 127.0.0.1 --port 4173 --strictPort`. Its first restricted-sandbox bind returned `listen EPERM`; the approved local bind then passed. The denied bind is a setup diagnostic, not a product failure.

The fresh tracked-file ZIP was copied byte-for-byte into the browser allow-root. Both copies had the same hash. The browser console had one local `favicon.ico` 404 and no other warning or error.

| Local-only browser setup input | SHA-256 | Exact result | Evidence boundary |
| --- | --- | --- | --- |
| `/tmp/codeville-runtime-lens-browser.zip` | `33f7135ff0270cd0979332e26959b7479b25f56896fdbeef5b358434cb002283` | 717996 bytes; 193 tracked entries; source HEAD `b7cfba4dcff6412ff0594593a3195cbcf969172c`; allow-root copy had the same hash. | Local browser test setup only; not a release artifact. |
| Full-ZIP browser UI metrics | N/A | Whole system 136 nodes: atlas-ui 48, cli 7, core 54, root 5, web 14, dependencies 8. Exact 123; heuristic 0; unsupported 0; unresolved 6; rolled-up 0; hidden-external 0. | Browser-exposed UI metrics only. No browser source-file count is inferred. These counts remain separate from CLI counts. |

The first minimal-source ZIP contained fixture contents without its top folder. The browser therefore normalized the file as `core/src/runtime/index.ts`, and exact correlation correctly stayed unmatched. That attempt is `NOT_USED` because the controller fixture was wrong; it is not a product failure. The corrected wrapped ZIP preserved `packages/core/src/runtime/index.ts` and was used for the exact source-handoff check. This separate minimal fixture proves the handoff flow only; it is not a generated HTML artifact or whole-repository evidence.

| Exact browser or file check | Status | Exact result or reason | Evidence boundary |
| --- | --- | --- | --- |
| Import dialog focus and containment | PASS | Opening Import OTLP moved active focus to the file input. `New repo` was in an inert ancestor. Shift+Tab from the first control wrapped to Cancel; Tab from Cancel wrapped to the file input; focus stayed in the dialog. Escape closed it and restored focus to the exact `Import OTLP trace` opener. | Local-server web-app modal behavior. Automated happy-dom coverage remains separate. |
| Browser picker import of `fixtures/runtime/minimal-otlp.json` | PASS | Runtime Lens opened. Trace `11111111111111111111111111111111` had 2 spans, 300 ns, 1 service, and 1 error. Trace `22222222222222222222222222222222` had 1 span, 200 ns, 1 service, and 0 errors. Completeness showed 0 sampled, 3 unsampled, and 1 redaction. | Web-app import of synthetic public data; not capture or target execution. |
| Service filter across trace transition | PASS | Service `runtime-api` was selected on trace 1. Moving to trace 2 cleared the control to value `''` / `All services`, and the `runtime-worker` span remained visible. | Controlled web-app filter behavior only. |
| JSON redaction and recorded evidence display | PASS | Body text did not contain `fixture-secret`. Span `0000000000000001` showed `authorization: redacted` and the safe `code.file.path`. Span `0000000000000002` showed parent `0000000000000001`, 200 ns, status 2 `(error)`, and `fixture error`. | Sanitized normalized display; no raw-secret or execution claim. |
| Automated importer-boundary guard | PASS | `apps/web/src/runtime/ingest.test.ts` guards `fetch`, XHR, WebSocket, beacon, `localStorage`, `sessionStorage`, and Worker, and proves the final correlated serialized limit before UI state. `apps/web/src/App.test.tsx` mocks the importer. | Bounded automated API and size checks. This is separate from the manual network log and is not every browser persistence API. |
| Call tree, path, text-timeline, and details synchronization | PASS | Selecting span `0000000000000002` set `aria-pressed=true` in the call tree, hot path, and error path, and `aria-current=true` in the text timeline. Call-tree items exposed levels 1 and 2. | Same selected imported observation. Hot path is not causal proof; error path is not root-cause proof. |
| Timeline relative grid | PASS | The canvas visibly showed vertical grid lines with `+0 ns`, `+75 ns`, `+150 ns`, `+225 ns`, and `+300 ns`. | Canvas rendering in the local-server web app. |
| Timeline lane viewport | PASS | The scroll wrapper exposed role `region`, label `Scrollable recorded service lanes`, tab index 0, `overflow-y:auto`, client height 240, and scroll height 240 for the one-lane public fixture. | The public fixture does not exercise eight lanes. The separate real-DOM/canvas test covers the eight-lane case. |
| Timeline safe hover | PASS | Pointer movement over the first span produced `Hovered span: runtime-api; import runtime trace (0000000000000001); starts +0 ns; duration 100 ns; status unset.` Pointer leave restored `No recorded span is under the pointer.` | Safe hover fields only; no attributes or raw sensitive values were exposed. |
| Timeline native viewport actions | PASS | Zoom In changed the rendered scale, Pan Later changed positions, and Reset restored the view. Tab focused native Zoom Out and Enter activated it. Native controls exposed Pan earlier/later, Zoom in/out, and Reset timeline view. | Browser pointer and keyboard operation of the local-server canvas controls. |
| Inspector roving tabs | PASS | Six unique tab IDs controlled one panel. Exactly one tab had tab index 0 and five had -1. End moved focus and selection to Links, Home to Span details, and ArrowRight to Resource; panel content and `aria-labelledby` updated each time. | Browser keyboard and accessibility-state observation. |
| Browser picker import of `fixtures/runtime/minimal-otlp.jsonl` | PASS | On the corrected exact-source Atlas, JSONL showed trace 1 of 2 with the same trace ID, 2 spans, 1 error, 0 sampled, 3 unsampled, 1 redaction, exact source match, no unmatched notice, and no fixture secret. Command-level trace/span equality remains separate evidence. | Web-app import of synthetic public data; not capture or target execution. |
| Runtime mode and clear flow | PASS | Runtime -> Show static atlas -> Runtime Lens -> Clear runtime data passed. After clear, the Runtime region and Runtime Lens mode button were absent while the static canvas and repository remained. | Web-app state flow only. |
| Default desktop web app at 1200 x 800 | PASS | `document.clientWidth=1200` and `scrollWidth=1200`. | Responsive local-server web-app evidence. |
| Web app at exactly 860 x 844 | PASS | `document.clientWidth=860` and `scrollWidth=860`. | Responsive local-server web-app evidence. |
| Web app at 390 x 844: horizontal overflow | PASS | `clientWidth=390` and `scrollWidth=390`; there was no document-level horizontal overflow. | Responsive local-server web-app evidence. |
| Web app at 390 x 844: target heights | PASS | 34 visible interactive controls had a minimum height of exactly 44 CSS px; none were below 44 px. All nine new top, timeline, and footer controls measured 44 px high. | Measured target-size evidence; not a full accessibility conformance claim. |
| Visible focus | PASS | Keyboard-focused Pan Later had a solid 2 px outline with a 2 px offset. | Visible-focus observation only. |
| Manual keyboard traversal | PASS | Actual Tab traversal covered top controls, trace navigation, all filters, call tree, hot path, error paths, five timeline controls, scroll region, canvas, both text rows, exactly one inspector tab stop, footer controls, and wrap. No trap occurred. | One controller browser session. Automated keyboard tests remain separate. |
| Accessibility tree and native controls | PASS | The snapshot exposed regions, headings, tree/treeitems with depth, native buttons/selects/spinbutton/checkbox, tablist/tabs/tabpanel, text timeline, and polite statuses. | Browser accessibility-tree observation; not a formal WCAG or axe audit. |
| Polite status announcements | PASS | Polite status nodes were exposed and updated during the recorded interactions. | Live-status browser observation. |
| Non-color error labels | PASS | Errors used explicit `error` text and status code 2, not color alone. | Textual error-state evidence. |
| Exact source handoff with the corrected wrapped minimal source ZIP | PASS | Static search exposed exactly one `packages/core/src/runtime/index.ts source module` result. JSON import showed `exact source: packages/core/src/runtime/index.ts`, no unmatched notice, and the full identity `traceId=11111111111111111111111111111111, spanId=0000000000000001`. `Open matched source` selected `index.ts`, showed path `packages/core/src/runtime/index.ts`, and excerpt `export const runtimeSource = true`. | Separate minimal-fixture handoff evidence. Fresh HTML extraction independently proves the same identity in both generated files. |
| Local-server web-app network log | PASS | The complete available log had three successful local GETs only: `/`, `/assets/index-CPozPCFD.js`, and `/assets/index-JULY3WDG.css`. There was no external request. The console separately reported the one local favicon 404 noted above. | Limited to this local-server session. It is not direct-file network evidence. |
| Exact-end point and eight-lane shapes | PASS automated only | Real-DOM/canvas tests cover the exact-end point and eight lanes at 390 px. The public browser fixture has neither shape. | Automated geometry/DOM evidence only; no manual browser claim. |
| Direct `file:///tmp/codeville-runtime-atlas.html` execution | NOT_RUN | Codex Browser rejected `file://` under its URL security policy and explicitly prohibited a workaround, raw CDP, alternate browser, or local-server substitution. | Direct generated-file rendering is unavailable and is not marked PASS. |
| Direct `file:///tmp/codeville-runtime-atlas-jsonl.html` execution | NOT_RUN | Same Codex Browser `file://` policy restriction. | Direct generated-file rendering is unavailable and is not marked PASS. |
| Direct file artifacts: Runtime Lens, synchronized views, source handoff, text timeline, desktop, 860px, 390px, target sizes, and Markdown file workflow | NOT_RUN | The two generated HTML files could not execute through `file://` in the available Browser. | Static payload, source-match, CSP, resource, size, hash, and Markdown checks remain separate PASS evidence. |
| Manual reduced-motion emulation | NOT_RUN | The Browser exposes viewport override, not media emulation. | The separate `runtime-style.test.ts` automated CSS contract passed in the 491-test suite; no manual browser PASS is claimed. |
| Formal axe or WCAG automation | NOT_RUN | No axe runner is installed. | Do not convert this unavailable environment into PASS. |

## Final evidence boundary

Runtime data is imported local OTLP observation. This record does not prove Codeville capture, target instrumentation, target execution, field qualification, or complete execution. Hot path is recorded-duration ancestry, not causal proof. Error path is known ancestry, not a root-cause claim. Source match is an exact recorded file-path match, not proof that Codeville observed function execution.

The local-server browser checks do not replace direct generated-file execution. Direct JSON and JSONL `file://` execution, the combined direct-file workflow, manual reduced-motion emulation, and formal axe/WCAG automation remain `NOT_RUN`. Under the owner finish rule, these rows remain merge-blocking. This record does not authorize a push or merge.
