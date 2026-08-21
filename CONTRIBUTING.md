# Contributing

PRs are welcome. This is a pnpm workspace; `npm install` at the repository root is not supported.

## Setup

```bash
pnpm install
pnpm -F @codeville/atlas-ui build
pnpm test
pnpm typecheck
pnpm dev
```

`pnpm dev` is http://localhost:5273. `pnpm atlas . -o atlas.html` writes a standalone file; it needs the atlas-ui bundle from the build step.

## What to change

The analyzer lives in `packages/core`, the canvas in `packages/atlas-ui`, the CLI in `packages/cli`, the drop zone and GitHub route in `apps/web`. Keep that split. Do not flatten the monorepo.

Do not write into a repo being analysed. Cache stays in `~/.cache/codeville`. Do not commit generated atlases (`atlases/` is gitignored because they embed source excerpts).

The standalone page must stay offline: no fonts, no CDNs, no fetches. `embedJson` / `escapeHtml` in `packages/atlas-ui/src/standalone-html.ts` are load-bearing.

Layout is deterministic. Same repo in, byte-identical atlas out (after stripping `repo.generatedAt`). Do not introduce `Math.random()` or `toLocaleString()` without `'en-US'`.

## Tests

```bash
pnpm test
pnpm typecheck
pnpm -F @codeville/atlas-ui build
```

Add a test next to the code you change. Do not delete existing coverage to make a change look smaller.

## Issues and security

Use the issue templates. Security reports go through [SECURITY.md](SECURITY.md), not public issues.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
