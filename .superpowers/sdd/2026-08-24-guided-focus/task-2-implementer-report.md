# Task 2 implementer report: deterministic guided-tour chapters

## Scope and revisions

- BASE: `3dac311aaf8608e8cf7da5cd327f7a3a8f8139b2`
- HEAD at implementation start: `3dac311aaf8608e8cf7da5cd327f7a3a8f8139b2`
- Implementation HEAD before report-only metadata amend: `8c8a1c8486f2c0b093af79bba27c8e9f7aaf2052`
- Owned files changed: `packages/atlas-ui/src/tour.ts`, `packages/atlas-ui/src/tour.test.ts`, `packages/atlas-ui/src/index.ts`
- Report: `.superpowers/sdd/2026-08-24-guided-focus/task-2-implementer-report.md`

## TDD evidence

1. Added all eight contract tests in `tour.test.ts` before implementation.
2. RED: `pnpm vitest run packages/atlas-ui/src/tour.test.ts` failed during collection because `./tour.js` and `buildTour` did not exist.
3. GREEN: `pnpm typecheck && pnpm vitest run packages/atlas-ui/src/tour.test.ts packages/atlas-ui/src/focus.test.ts` passed: 2 files, 15 tests (8 tour and 7 focus).

Named tour coverage:

- ordered non-empty areas and internal non-containment links
- empty declared areas
- eight-hub ranking, ties/order, incident links, and opposite endpoints
- conditional external boundary
- final whole-system projection with containment and valid-link filtering
- adjacent projection de-duplication while retaining final `all`
- empty Atlas
- reversed node/link invariance and explicit area-order changes

## Implementation and safety decisions

- `validLinks` rejects every link whose `from` or `to` node is absent.
- Area chapters preserve declared area order, skip empty areas, and exclude containment/external links.
- Hub ranking uses only local nodes, descending `in + out`, then path and ID; incident valid non-containment links add their opposite endpoints.
- Boundary membership is derived only from valid external links and their endpoints.
- The final `all` chapter includes every existing node and valid link, including containment.
- Node IDs and link keys are de-duplicated and canonically sorted; input node/link order cannot affect output.
- Copy is factual, visible-slice text only; no roles, AI prose, DOM, network, dependencies, or Atlas serialization changes.

## Deviations

- Empty Atlases omit the otherwise empty `hubs` chapter, yielding exactly one empty `all` chapter as required.
- The test fixture’s valid containment edge uses two existing nodes; its missing-endpoint edge remains present to verify rejection.

## Self-review

- `git diff --check`: passed.
- Compared against BASE: only the three owned files above are changed/added.
- No focus implementation/tests, renderer/UI/docs, plans/specs/ledger/reviews, Markdown-report files, or lockfiles were modified.

## Commit

Commit after report creation: `feat: derive a guided atlas tour`.

## Remaining risks

- This task’s focused tests and typecheck pass; broader renderer/component behavior is intentionally outside Task 2 ownership and was not changed.
