# Atlas Markdown Report Design

## Status

Approved for implementation on 2026-08-24 as the first System Atlas pattern harvested into Codeville.

## Purpose

Codeville currently emits a standalone HTML atlas or JSON. Add an optional Markdown twin generated from the same `Atlas` value so a repository snapshot can be reviewed in pull requests, indexed by agents, and read without executing JavaScript.

The Markdown is a report of derived repository facts. It is not a hand-authored system definition, an architecture decision record, or an AI summary.

## User interface

Generation remains opt-in:

```bash
codeville ./repo -o atlas.html --report atlas.md
```

`-o` keeps its current HTML/JSON behavior. `--report <path>` adds one Markdown output built from the same analyzed and explained `Atlas`. Omitting `--report` writes no additional file. `ask` does not accept `--report`.

The CLI logs `wrote <report-path>` only after the report write succeeds. A failed report write makes the command fail instead of claiming a partially completed paired export.

## Core interface

Create a pure formatter in `packages/core/src/report-markdown.ts`:

```ts
export function renderAtlasMarkdown(atlas: Atlas): string
```

Export it from `packages/core/src/index.ts`. The function performs no I/O, network access, environment reads, or AI calls.

## Document contract

The output is deterministic for a byte-identical `Atlas` and ends with exactly one newline. It contains these sections in this order:

1. `# <repo name> — Codeville Atlas`
2. Snapshot metadata: ref when present, generated timestamp, and the existing repository note.
3. `## Scope and coverage`: the five top-level stats, extraction counts, resolution buckets, roll-up count, and hidden external count.
4. `## Areas`: every `AtlasArea` in atlas order with label and visible count.
5. `## Visible nodes`: every node sorted by `path`, then `id`, with kind, role, area, line count, visible fan-in, visible fan-out, and rolled-up item count when present.
6. `## Visible dependency links`: every non-containment link sorted by source path, target path, and type, with type, confidence, observations, and a compact comma-separated list of evidence locations (`path:startLine-endLine`). Containment links are excluded because they are filesystem projection, not dependency evidence.
7. A fixed footer: this is a generated visible slice; rolled-up, hidden, unsupported, failed, and unresolved facts may not appear as individual nodes or links; edit the repository and regenerate rather than editing the report.

Do not include source excerpts, import statements, AI summaries, symbols, credentials, environment values, or arbitrary HTML.

Older Atlas JSON may omit `coverage`, link `confidence`, link `observations`, or link `evidence`. The formatter renders `coverage unavailable` and `unknown` values without throwing.

## Untrusted-input handling

Repository names, refs, notes, paths, labels, roles, areas, and evidence paths are hostile input.

- Escape `&`, `<`, and `>` so Markdown renderers cannot interpret embedded HTML.
- Escape `|` inside table cells.
- Convert CR/LF and tabs inside cells to a single space.
- Render user-controlled values as plain table cells, never raw HTML.
- Do not embed source text or construct clickable local-file links.

The existing standalone `embedJson` and `escapeHtml` functions remain unchanged.

## Determinism

- Preserve atlas order for metadata and areas.
- Sort nodes by `path`, then `id` using code-point comparison.
- Resolve link endpoint display names from the node map, falling back to IDs.
- Sort links by displayed source path, displayed target path, then type.
- Sort evidence locations by path, start line, end line, specifier, then extractor before rendering.
- Do not use locale-dependent sorting or `toLocaleString` in the report.

## Error handling

- `--report` without a value is a parse error using the existing `needs a value` behavior.
- Report parent directories are created through the existing CLI `write()` helper.
- Main output and report use the same in-memory Atlas; there is no second scan or explainer call.
- The report is written only after the main output succeeds.

## Testing

Use strict TDD.

- Pure formatter tests use a hand-written Atlas fixture and literal expected Markdown fragments/order.
- A hostile-input test proves `<script>`, pipes, newlines, and tabs cannot become raw HTML or extra table cells/rows.
- A legacy-payload test proves missing coverage/evidence fields render without throwing.
- A determinism test feeds reversed node/link/evidence input and asserts the same canonical output where sorting is promised; areas remain in explicit atlas order.
- CLI parser tests cover `--report`, missing value, and absence on `ask`.
- A CLI integration test runs one analysis with JSON plus Markdown outputs and verifies both files exist and the report contains the expected heading and footer. This keeps `pnpm test` independent of the standalone bundle, which CI builds afterward.
- Final verification builds the standalone bundle, then runs an HTML plus Markdown smoke export and verifies both outputs.

## Non-goals

- No Markdown export button in the web app.
- No automatic `SYSTEM.md` writes.
- No hand-authored annotations, ADRs, questions, ghosts, or design payloads.
- No package publishing changes.
- No changes to the serialized `Atlas` contract.

## Security and compatibility constraints

- Standalone HTML remains fully offline: no fonts, CDNs, fetches, listeners, or new assets.
- Never write into the analyzed repository except when the user explicitly chooses an output/report path there.
- Do not weaken GitHub ingestion caps, cache isolation, evidence limits, or XSS escaping.
- Add no runtime dependency.
