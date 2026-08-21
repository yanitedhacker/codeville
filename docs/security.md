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
