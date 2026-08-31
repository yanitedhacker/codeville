# Runtime Lens end-to-end verification

## Record status

Executed record. Non-browser checks are complete. The controller supplied the browser results below. Direct `file://` execution, manual network logging, manual reduced-motion emulation, manual keyboard traversal, and formal axe automation remain `NOT_RUN` for their recorded reasons. A `NOT_RUN` check is not a pass.

## Execution identity

| Field | Exact command | Result |
| --- | --- | --- |
| UTC timestamp | `date -u +%Y-%m-%dT%H:%M:%SZ` | `2026-08-30T23:16:14Z` |
| Branch | `git branch --show-current` | `yanitedhacker/runtime-lens` |
| HEAD tested | `git rev-parse HEAD` | `ced8fb4184902c64816fc23eeba0eea4253c4e1d` |
| Node.js | `node --version` | `v22.23.1` |
| pnpm | `pnpm --version` | `10.12.1` |
| Platform | `uname -s` | `Darwin` |
| Architecture | `uname -m` | `arm64` |

## Superseded environment diagnostic

These results are not the product verdict. They predate corrected HEAD `ced8fb4184902c64816fc23eeba0eea4253c4e1d` and only identify a sandbox IPC boundary.

| Exact command or check | Exit/status | Exact counts/result | Skips | Evidence boundary |
| --- | --- | --- | --- | --- |
| `pnpm test -- packages/core/src/runtime/derive.test.ts` in the restricted sandbox at HEAD `08c7709773b2daa6d02fc27b887744f498e7a49b` | Exit 1; superseded diagnostic | 47/49 files passed; 444/456 tests passed; 12 failures. Each reported CLI child-process failure contained `listen EPERM` for a local `tsx` pipe. | 0 reported | Sandbox denied local IPC. This is not a product test result. |
| Exact rerun with approved local IPC at HEAD `08c7709773b2daa6d02fc27b887744f498e7a49b` | Exit 0; superseded diagnostic | 49/49 files and 456/456 tests passed. | 0 | Proved the earlier failures were environmental. The corrected-HEAD rows below are authoritative. |
| `pnpm fidelity` in the restricted sandbox at HEAD `08c7709773b2daa6d02fc27b887744f498e7a49b` | Exit 1; superseded diagnostic | No analysis result; `tsx` failed at startup with `listen EPERM`. | N/A | Sandbox denied local IPC. This is not a fidelity result. |

## Non-browser command record

| Exact command or check | Exit/status | Exact counts/result | Skips | Evidence boundary |
| --- | --- | --- | --- | --- |
| `rg -n -F 'Runtime data is imported observation' README.md` | Exit 0; PASS | One matching line at README line 123. | N/A | Documentation assertion only. |
| `rg -n -F 'OTLP JSON/JSONL -> parse -> normalize/redact -> derive -> exact correlate -> Runtime Lens -> offline export' docs/architecture.md` | Exit 0; PASS | One matching line at architecture line 39. | N/A | Documentation assertion only. |
| `rg -n -F 'Runtime trace import and export' docs/security.md` | Exit 0; PASS | One matching heading at security line 29. | N/A | Documentation assertion only. |
| `rg -n -F 'minimal-otlp.jsonl' fixtures/README.md` | Exit 0; PASS | Two matching lines at fixture README lines 5 and 13. | N/A | Documentation assertion only. |
| `pnpm test -- packages/core/src/runtime/derive.test.ts` with approved local IPC | Exit 0; PASS | 49/49 test files; 457/457 tests. | 0 | Local Node/Vitest evidence. The repository script ran the full configured suite; it is not a browser or field result. |
| `pnpm test -- packages/atlas-ui/src/standalone-html.test.ts packages/atlas-ui/src/standalone.test.tsx packages/cli/src/args.test.ts apps/web/src/App.test.tsx` with approved local IPC | Exit 0; PASS | 49/49 test files; 457/457 tests. | 0 | Local Node/Vitest automated export, CLI, component-state, and importer-boundary evidence. It does not replace `file://` browser checks. |
| `pnpm test` with approved local IPC | Exit 0; PASS | 49/49 test files; 457/457 tests. | 0 | Full local Node/Vitest suite. No field, target-execution, or browser qualification claim. |
| `pnpm typecheck` | Exit 0; PASS | TypeScript `tsc -p tsconfig.json --noEmit` completed with no diagnostic output. | N/A | Static type analysis only. |
| `pnpm -F @codeville/atlas-ui build` | Exit 0; PASS | Vite transformed 28 modules; CSS 15.31 kB, gzip 3.34 kB; JS 89.32 kB, gzip 29.13 kB. | N/A | Local production-bundle build only. |
| `pnpm build` | Exit 0; PASS | Vite transformed 89 modules; HTML 0.60 kB, CSS 18.09 kB, JS 652.12 kB. Vite emitted its chunk-size warning. | N/A | Local web build only. The warning is not converted to a failure or hidden. |
| `pnpm fidelity` with approved local IPC | Exit 0; PASS | 120 source files; 120 exact; 0 heuristic; 0 unsupported; 381 import facts; 259 internal; 77 external; 43 system; 2 unresolved; 0 ignored; 3 rolled-up; 0 hidden; reported internal resolution coverage 99.2%. | N/A | The analysis completed. Exit 0 does not prove a quality threshold. The two reported unresolved CSS imports remain explicit. |
| `pnpm langs` with approved local IPC | Exit 0; PASS | Python 4/4, Go 2/2, Rust 4/4; 10/10 expected fixture edges. | 0 | Synthetic language fixtures only. |
| `pnpm realrepo .` with approved local IPC | Exit 0; PASS | 120 source files; 259 internal; 77 external; 43 system; 2 unresolved; 0 ignored; 8 external packages. | N/A | The repository analysis completed. Exit 0 does not prove a quality threshold. |
| `pnpm atlas . --trace fixtures/runtime/minimal-otlp.json --trace-source-root "$PWD" --report /tmp/codeville-runtime-report.md -o /tmp/codeville-runtime-atlas.html` with approved local IPC | Exit 0; PASS | Read 126 files; atlas 129 nodes, 333 links, 8 packages; runtime 2 traces, 3 spans; wrote the Markdown and JSON-input HTML artifacts. | 0 | Local import of a synthetic public fixture. It is not capture or target execution. |
| `pnpm atlas . --trace fixtures/runtime/minimal-otlp.jsonl --trace-source-root "$PWD" -o /tmp/codeville-runtime-atlas-jsonl.html` with approved local IPC | Exit 0; PASS | Read 126 files; atlas 129 nodes, 333 links, 8 packages; runtime 2 traces, 3 spans; wrote the JSONL-input HTML artifact. | 0 | Local import of a synthetic public fixture. It is not capture or target execution. |
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
| `rg -n -F 'Runtime trace data is not included in this static-source Markdown report.' /tmp/codeville-runtime-report.md` | Exit 0; PASS | One exact match at line 516. | N/A | Markdown exclusion statement only. Runtime data is not treated as Markdown evidence. |
| `[A4]` Active external-resource and remote CSS scan of `/tmp/codeville-runtime-atlas.html` | Exit 0; PASS | 0 active external-resource tags; 0 remote CSS references. | N/A | Static HTML text scan. Inert imported URL-like text is not classified as active. Network behavior remains a browser check. |
| `[A5]` Active external-resource and remote CSS scan of `/tmp/codeville-runtime-atlas-jsonl.html` | Exit 0; PASS | 0 active external-resource tags; 0 remote CSS references. | N/A | Static HTML text scan. Inert imported URL-like text is not classified as active. Network behavior remains a browser check. |
| `[A6]` Exact CSP search in `/tmp/codeville-runtime-atlas.html` | Exit 0; PASS | One meta CSP at line 6: `default-src 'none'; connect-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`. | N/A | Static CSP presence only. |
| `[A7]` Exact CSP search in `/tmp/codeville-runtime-atlas-jsonl.html` | Exit 0; PASS | One meta CSP at line 6 with the same exact policy. | N/A | Static CSP presence only. |
| `stat -f '%z %N' /tmp/codeville-runtime-atlas.html` | Exit 0; PASS | 457800 bytes. | N/A | Local file metadata. |
| `stat -f '%z %N' /tmp/codeville-runtime-atlas-jsonl.html` | Exit 0; PASS | 457800 bytes. | N/A | Local file metadata. |
| `stat -f '%z %N' /tmp/codeville-runtime-report.md` | Exit 0; PASS | 57343 bytes. | N/A | Local file metadata. |
| `shasum -a 256 /tmp/codeville-runtime-atlas.html` | Exit 0; PASS | `e77095a9103bbbe3ccfb22c458b301a8ebc9bc0c4af8534f862a8d397996ca92`. | N/A | SHA-256 identity of the fresh local artifact. |
| `shasum -a 256 /tmp/codeville-runtime-atlas-jsonl.html` | Exit 0; PASS | `b83c6c9bacb9983996005d0140c6dda85653c10ffb28cf329cc5c08d3989b61e`. | N/A | SHA-256 identity of the fresh local artifact. |
| `shasum -a 256 /tmp/codeville-runtime-report.md` | Exit 0; PASS | `10541db34cdb528cee44fa4818f82ac6b2948de854b3f2878081b497b06b8177`. | N/A | SHA-256 identity of the fresh local artifact. |
| `git diff --check` | Exit 0; PASS | No whitespace errors. | N/A | Final pre-commit hygiene after the controller browser results were recorded. |
| `git status --short --branch` | Exit 0; PASS | Branch plus five Task 10 documentation paths: three modified and two untracked. | N/A | Final pre-commit inventory. |

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
| `/tmp/codeville-runtime-atlas.html` | 457800 bytes | `e77095a9103bbbe3ccfb22c458b301a8ebc9bc0c4af8534f862a8d397996ca92` | 2 traces; 3 spans; 1 recorded error; 1 exact matched source span with `traceId=11111111111111111111111111111111, spanId=0000000000000001`; 0 unmatched source spans | 1 redacted attribute; `fixture-secret` absent | 1 |
| `/tmp/codeville-runtime-atlas-jsonl.html` | 457800 bytes | `b83c6c9bacb9983996005d0140c6dda85653c10ffb28cf329cc5c08d3989b61e` | 2 traces; 3 spans; 1 recorded error; 1 exact matched source span with `traceId=11111111111111111111111111111111, spanId=0000000000000001`; 0 unmatched source spans | 1 redacted attribute; `fixture-secret` absent | 2 |
| `/tmp/codeville-runtime-report.md` | 57343 bytes | `10541db34cdb528cee44fa4818f82ac6b2948de854b3f2878081b497b06b8177` | Runtime trace data excluded by the exact statement at line 516 | Runtime input excluded | N/A |

The JSON and JSONL artifacts have equal normalized `traces` and `spans`. Their whole-file hashes differ because each Atlas records a different generation timestamp and each runtime report records its input document count.

## Browser and `file://` checks

The controller ran the Codex in-app Browser against `http://127.0.0.1:4173/`. The first preview attempt had an extra `--`, left Vite on `::1`, and the sandbox blocked the listen operation. The corrected bounded command `pnpm -F @codeville/web preview --host 127.0.0.1 --port 4173 --strictPort` passed. The first attempt is a browser setup diagnostic, not a product failure.

Direct full-folder browser automation loaded only 23 source files, so it was incomplete and was `NOT_USED` as whole-repository evidence. The controller instead loaded a clean ZIP from corrected commit `ced8fb4184902c64816fc23eeba0eea4253c4e1d`:

| Local-only browser setup input | SHA-256 | Exact result | Evidence boundary |
| --- | --- | --- | --- |
| `/tmp/codeville-runtime-lens-browser.zip` | `b8fd818610509dc0377f151a969d8b4cd2c59f683c1153158d85c31f98685dfa` | Web app loaded 119 tracked source files and produced 132 nodes. | Local browser test setup only; not a release artifact. |
| Direct full-folder automation | N/A | Only 23 source files loaded; `NOT_USED` as whole-repository evidence. | Incomplete setup result; not converted to product evidence. |

The exact source-handoff browser check used an explicitly separate minimal fixture at `/tmp/codeville-browser-source-repo`. It contained one file at `packages/core/src/runtime/index.ts`. This fixture proves the browser handoff flow. It is not the generated HTML artifact and is not whole-repository evidence.

| Exact browser or file check | Status | Exact result or reason | Evidence boundary |
| --- | --- | --- | --- |
| Browser picker import of `fixtures/runtime/minimal-otlp.json` | PASS | Runtime Lens opened. Trace `11111111111111111111111111111111` had 2 spans, 300 ns, 1 service, and 1 error. Trace `22222222222222222222222222222222` had 1 span, 200 ns, 1 service, and 0 errors. Completeness showed 3 unsampled spans and 1 redaction. | Web-app import of synthetic public data; not capture or target execution. |
| Browser picker import of `fixtures/runtime/minimal-otlp.jsonl` | PASS | Same two trace IDs, selected-trace span counts, durations, services, errors, call tree, hot path, error path, and text timelines as JSON. Browser snapshots were consistent with the command-level equality result. | Web-app import of synthetic public data; not capture or target execution. |
| JSON picker redaction and recorded evidence display | PASS | `authorization` displayed only as `redacted`; the exact recorded `code.file.path` remained visible. | Sanitized normalized display; no raw-secret or execution claim. |
| Automated importer-boundary guard | PASS | `apps/web/src/runtime/ingest.test.ts` tests `ingestRuntimeFile` directly and guards `fetch`, XHR, WebSocket, beacon, `localStorage`, `sessionStorage`, and Worker. `apps/web/src/App.test.tsx` mocks the importer. | This is neither an App/framework integration test nor a manual network log. It is a bounded automated API list, not every browser persistence API. |
| Timeline, call tree, hot path, error path, and details selection synchronization | PASS | Selected span `0000000000000002` appeared pressed in call tree, hot path, and error ancestry. Details showed its parent, exact timestamps, 200 ns, status 2 with explicit `error`, and `fixture error`. | Same selected imported observation. Hot path is not causal proof; error path is not root-cause proof. |
| Complete selected-trace text timeline | PASS | The text timeline showed every selected-trace span for JSON and JSONL. | DOM alternative for selected-trace canvas facts. |
| Runtime mode and clear flow | PASS | `Return to Static Atlas` -> `Runtime Lens` -> `Clear runtime data` passed. After clear, the static export label returned and the Runtime Lens control disappeared. | Web-app state flow only. |
| Default desktop web-app Runtime Lens snapshot | PASS | Runtime Lens rendered in the corrected ZIP-backed web app. | Web-app browser evidence; not direct generated-file execution. |
| Web app at exactly 860px | PASS | `document.clientWidth=860` and `scrollWidth=860`. The earlier reading of 1280 came from a blocked secondary tab and was discarded. | Responsive web-app evidence. |
| Web app at 390 x 844: horizontal overflow | PASS | `clientWidth=390`, `scrollWidth=390`; no document-level horizontal overflow. The viewport override was reset afterward. | Responsive web-app evidence. |
| Web app at 390 x 844: target heights | PASS | 28 visible runtime buttons, inputs, and selects; minimum measured height exactly 44 CSS px; 0 controls below 44 px. | Measured web-app target-size evidence. |
| Visible focus | PASS | Selected native tab button had a solid 2px focus outline. | Visible focus only; manual traversal is separate. |
| Accessibility tree and native controls | PASS | Regions, headings, native buttons, selects, spinbutton, checkbox, tabs, labels, text timeline, and live status were exposed in the accessibility snapshot. | Browser accessibility-tree observation; not a formal WCAG audit. |
| Polite status announcements | PASS | Polite `status` text updated. | Live-status browser observation. |
| Non-color error labels | PASS | Errors had explicit `error` text and status code 2, not color alone. | Textual error-state evidence. |
| Exact source handoff in the web app using `/tmp/codeville-browser-source-repo` | PASS | Search found exactly one `kind:"file"` node. JSON import showed `exact source: packages/core/src/runtime/index.ts` for `traceId=11111111111111111111111111111111, spanId=0000000000000001`, one Exact source match panel, and no unmatched-source notice. `Open matched source` moved to Static Atlas, selected `index.ts`, showed the exact inspector path, and showed source excerpt line 1. | Proves browser handoff with a separate minimal source fixture. It is not direct file-artifact execution. Fresh artifact extraction separately proves the same full matched identity in both HTML files. |
| Direct `file:///tmp/codeville-runtime-atlas.html` execution | NOT_RUN | Codex Browser rejected `file://` under its URL security policy and explicitly prohibited a workaround, raw CDP, alternate browser, or local-server substitution. | Direct generated-file rendering is unavailable and is not marked PASS. |
| Direct `file:///tmp/codeville-runtime-atlas-jsonl.html` execution | NOT_RUN | Same Codex Browser `file://` policy restriction. | Direct generated-file rendering is unavailable and is not marked PASS. |
| Direct file artifacts: Runtime Lens, synchronized views, source handoff, text timeline, desktop, 860px, 390px, target sizes, and Markdown file workflow | NOT_RUN | The two generated HTML files could not execute through `file://` in the available Browser. | Static payload, source-match, CSP, resource, size, hash, and Markdown checks remain separate PASS evidence. |
| Manual network-request log | NOT_RUN | The in-app Browser exposes no `network` capability, and page performance APIs are unavailable in its read-only evaluator. | Automated importer-boundary guards and static active-resource/CSS scans passed separately; neither is broadened into a manual network PASS. |
| Manual reduced-motion emulation | NOT_RUN | The Browser exposes viewport override only, not media emulation. | The separate `runtime-style.test.ts` automated CSS contract passed in the 457-test suite; no manual browser PASS is claimed. |
| Manual keyboard traversal | NOT_RUN | Real browser Tab automation kept focus on the same native Attributes tab, so traversal was not proven. | Visible focus and native-control/accessibility-tree checks passed separately. Automated keyboard contracts remain separate. |
| Formal axe or WCAG automation | NOT_RUN | No axe runner is installed. | Do not convert this unavailable environment into PASS. |

## Final evidence boundary

Runtime data is imported local OTLP observation. This record does not prove Codeville capture, target instrumentation, target execution, field qualification, or complete execution. Hot path is recorded-duration ancestry, not causal proof. Error path is known ancestry, not a root-cause claim. Source match is an exact recorded file-path match, not proof that Codeville observed function execution.
