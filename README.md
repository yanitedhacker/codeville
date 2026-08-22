<!-- repo.meta
  owner: yanitedhacker
  repo: codeville
  clone: https://github.com/yanitedhacker/codeville.git
-->

<h1 align="center">
  <img src="docs/assets/wordmark.svg" width="480" alt="Codeville">
</h1>

<p align="center">
  <strong>Drop a repo. Get a city.</strong>
</p>

<p align="center">
  <a href="https://github.com/yanitedhacker/codeville/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/yanitedhacker/codeville/ci.yml?branch=main&style=for-the-badge&label=CI&color=1A1C11&labelColor=e4e1be"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1A1C11?style=for-the-badge&labelColor=e4e1be"></a>
  <a href="package.json"><img alt="Node 20+" src="https://img.shields.io/badge/node-20%2B-1A1C11?style=for-the-badge&labelColor=e4e1be"></a>
</p>

<p align="center">
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="SECURITY.md">Security</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

Point it at a repository. It emits an interactive isometric atlas as one HTML file. Supported source files become blocks; parser-confirmed and heuristic imports become inspectable arcs. The atlas reports unsupported files, unresolved imports, and roll-ups instead of hiding them. Click a block, read the file. Pan the map.

You cannot hold a 400-file tree in your head. A map you can pan is the point. If you want to *see* a codebase instead of grep it, this is it.

<p align="center">
  <img src="docs/assets/atlas.png" alt="Isometric atlas of this repository: source files as blocks on a dark beige canvas, import arcs between them, inspect panel on the right." width="1600">
</p>

## Quick start

```bash
git clone https://github.com/yanitedhacker/codeville.git
cd codeville
pnpm install
pnpm -F @codeville/atlas-ui build
pnpm dev
```

Then drop a folder on http://localhost:5273, drop a `.zip`, or paste `owner/repo`.

CLI:

```bash
pnpm atlas . -o atlas.html
open atlas.html
```

## How it fits together

- Folder and zip never leave the browser.
- GitHub paste is the only server fetch (codeload), because that host has no CORS.
- CLI writes one HTML file. Open it from `file://`. Zero network.
- AI explainers are optional and only add a summary sentence. They never replace derived fields. CLI adapters use a binary you already signed into.

## Exact versus heuristic extraction

Exact extraction is a Babel parse of `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, and `.cts`. A parse error falls back to the line scanner and marks that file heuristic.

Python, Go, Rust, Vue, Svelte, and Astro extraction is heuristic in v1. Other accepted source extensions are unsupported: they can still receive a block, but they contribute no import facts.

## Security defaults

Treat an analysed repo as untrusted input. Paths, excerpts, and import strings all land in the atlas.

The export HTML is offline. Do not load fonts or CDNs into it.

Folder and zip ingest are client-side. The GitHub route is capped: 90MB archive, gunzip output cap, `ref` cannot contain `..`.

`--explain claude` / `codex`: codeville does not see the credential.

`--explain openai` / `anthropic`: keys from the environment, never written into the atlas, the cache, or the logs.

Cache lives in `~/.cache/codeville`, never inside the target repo.

See [SECURITY.md](SECURITY.md).

## Explainers

The panel is full with no config. Role, fan-in, excerpt, packet samples: all derived. An adapter may add one `summary` sentence on top.

| `--explain` | Auth | Runs in |
| --- | --- | --- |
| `heuristic` | none | browser + node (default) |
| `codex` / `claude` / `cli:<cmd>` | a CLI you already signed into | node |
| `openai` / `anthropic` | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | node |
| `module:<path>` | your file, your auth | node |

I strongly recommend you do not ask this project for "sign in with ChatGPT." That would mean impersonating the Codex client against a private endpoint. It is against OpenAI's terms and it breaks the week they rotate anything. Ride a subscription through `codex`, `claude`, or `cli:<cmd>`: your login, your binary. `module:<path>` is the slot if you want to own a different decision.

## Development

This is a pnpm workspace. `npm install` at the repository root is not supported.

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev
```

CLI export still needs `pnpm -F @codeville/atlas-ui build`.

How the picture is built: [docs/architecture.md](docs/architecture.md). The standalone export aliases React to Preact; zip ingest uses fflate.

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

[MIT](LICENSE).
