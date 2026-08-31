# Threat model

codeville is a local/devtool. The interesting attacker is a **hostile repository you pointed it at**, not a stranger on the internet talking to a shared server. Folder and zip ingest never leave the browser. The GitHub route is the one server fetch. The CLI writes one HTML file that opens from `file://`.

Report via [SECURITY.md](../SECURITY.md). Caps below are already in the tree; this page documents them. Do not "improve" the GitHub route from a README pass.

## GitHub route — `apps/web/api/github.ts`

Exists because `codeload.github.com` serves no CORS headers. A browser cannot fetch a tarball on its own.

| Check | Behaviour |
| --- | --- |
| `parseRepoInput` | Owner and name cannot be `.` or `..`. `ref` must match `^[\w./-]+$` and cannot contain a `..` segment. |
| `codeloadUrl` | Built as `https://codeload.github.com/${owner}/${name}/tar.gz/${ref}`. After construction, hostname must be `codeload.github.com` and pathname must stay under `/${owner}/${name}/tar.gz/`. Otherwise 400. |
| Archive size | `Content-Length` over 90MB → 413 before `arrayBuffer()`. Byte length checked again after the read. |
| Gunzip | `gunzipSync(archive, { maxOutputLength })` with a 16MB cap. `ERR_BUFFER_TOO_LARGE` → 413. |
| Extract | 4000 files, 12MB total source, 512KB per file. Nested `node_modules` / `.git` / build dirs dropped. |

A `ref` of `../../../vercel/next.js/tar.gz/HEAD` must not leave that prefix. Tests live in `apps/web/api/github.test.ts`. Do not fetch third-party repos from CI.

## Export HTML — `packages/atlas-ui/src/standalone-html.ts`

One file: inlined CSS, inlined JS, inlined atlas JSON. No fonts, no CDNs, no `fetch`. Background is `#e4e1be`.

`embedJson` JSON-stringifies the atlas then escapes `<`, `>`, U+2028, and U+2029 so an excerpt cannot terminate the `<script>` tag. `escapeHtml` covers the `<title>`. Treat those two functions as XSS hold; do not "simplify" them.

The export bundle aliases React to Preact at build time (`packages/atlas-ui/vite.config.ts`). That is a size choice, not a security boundary.

## Runtime trace import and export

An imported trace is a second hostile input. The attacker can control OTLP structure, identifiers, timestamps, names, attributes, events, links, recorded source paths, and schema URLs. Import is local and all-or-nothing: a syntax, schema, identifier, time, duplicate-conflict, UTF-8, or limit failure rejects the complete new import. It does not expose a partial replacement bundle or remove a prior accepted bundle.

Browser and CLI trace import use these default limits:

| Limit | Default |
| --- | ---: |
| Input | 25 MiB |
| One JSONL line | 8 MiB |
| Traces | 10,000 |
| Total spans | 50,000 |
| Spans per trace | 20,000 |
| Resource/scope groups | 2,000 |
| Attributes per owner | 128 |
| Events per span | 256 |
| Links per span | 128 |
| Attribute depth | 8 |
| One string or bytes leaf | 16 KiB |

Before Codeville exposes a normalized bundle, it matches attribute keys without case and redacts values for exactly these 15 keys:

```text
authorization, cookie, token, secret, password, credential,
api-key, api_key, private-key, private_key, session,
db.statement, db.query.text, http.request.body, http.response.body
```

The key remains with a typed redaction marker, and the import report records the exact redaction count. This rule applies to resource, scope, span, event, and link attributes. Exact trace IDs and span IDs remain because they are evidence identities and parent-link keys.

The importer releases the raw input after import. It does not retain, cache, write into the repository, or embed the original OTLP text. Codeville imports a local file; it has no OTLP receiver and does not launch, execute, or instrument the target repository. Import-time code does not use `fetch`, XMLHttpRequest (XHR), WebSocket, `sendBeacon`, `localStorage`, `sessionStorage`, or Worker, and it does not write to the repository. This is a bounded list of tested import-time APIs, not a claim about every browser persistence API.

React text nodes and canvas text are the display sinks for imported values. Runtime code does not use `innerHTML` or evaluate imported values. Standalone export embeds only the normalized sanitized `RuntimeTraceBundle` through the existing script-breakout escaping path. It never embeds raw OTLP text. The runtime export uses this exact Content Security Policy:

```text
default-src 'none'; connect-src 'none'; img-src data:;
style-src 'unsafe-inline'; script-src 'unsafe-inline';
font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
```

The evidence labels have narrow meanings:

- **Hot path**: the root-to-leaf parent chain with the greatest sum of recorded span durations. It is not a distributed critical-path proof.
- **Error path**: a recorded error span and its known parent ancestry. It is not a root-cause claim.
- **Source match**: an exact normalized file-path match. A function name or line number adds context but does not prove function execution beyond the span producer's recorded attribute.

Source correlation uses an explicit source root and exact normalized paths. It does not use basename or suffix guessing and does not create an import edge or runtime call edge. Static `AtlasLink` evidence and `Trace one step` behavior do not change.

Markdown reports remain static-source reports. When HTML generation uses both `--trace` and `--report`, the report states exactly: `Runtime trace data is not included in this static-source Markdown report.` Runtime data is imported observation. It is not Codeville capture, target instrumentation, field qualification, or a complete execution proof.

## Explainers — `packages/core/src/explain/adapters.ts`

An adapter may only write `summary` (`applyExplanations` in `packages/core/src/explain/index.ts`). Role, fan-in, excerpt, and the rest are derived. A failing adapter degrades to the heuristic; the atlas is still written.

| Adapter | Credential | Rule |
| --- | --- | --- |
| `heuristic` | none | Default. Browser and node. |
| `codex` / `claude` / `cli:<cmd>` | whatever the binary already has | `spawn`, no shell. codeville never reads the credential. Timeout SIGTERM then SIGKILL. |
| `openai` / `anthropic` | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Header only. Missing key → empty map, not a throw. Never written into the atlas, `~/.cache/codeville`, or logs. |
| `module:<path>` | yours | Your file, our `Explainer` interface. |

Cache is `~/.cache/codeville/<repo-hash>.json`, keyed by content hash. Writes are `*.tmp` then `rename`. A cache IO error must not discard a finished atlas. Nothing is written into the analysed tree.

## What is not a vuln

You dropped a folder that contains a private key and the inspect panel showed an excerpt. That is the product. Prompt injection that colours a summary is not XSS. Scanner noise without a repro against the boundaries above will be closed.
