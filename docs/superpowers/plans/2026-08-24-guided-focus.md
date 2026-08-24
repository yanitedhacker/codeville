# Guided Discovery and Dependency Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic guided tour, visible dependency cones, and directed path focus without changing Atlas serialization or implying runtime execution.

**Architecture:** Pure DOM-free modules derive graph focus and tour chapters from the existing Atlas. `Atlas.tsx` owns focus/tour state, `Inspect` and a small `GuidedTour` component expose controls, and `AtlasRenderer` receives only a canonical focus projection for dimming, packet filtering, and camera fitting.

**Tech Stack:** TypeScript 5, React 19, Canvas2D, Vitest 3, Vite 7.

**Spec:** `docs/superpowers/specs/2026-08-24-guided-focus-design.md`

## Global Constraints

- Keep the serialized `Atlas` type unchanged; tours and focuses are derived UI state.
- Ignore containment links in dependency traversals and semantic tour chapters; the final whole-system chapter may include every link.
- Every algorithm is deterministic and excludes links with missing endpoint nodes.
- Use the phrases `visible` or `visible slice`; never call import topology runtime execution, request flow, or control flow.
- With no focus, rendering and packet behavior remain unchanged.
- Focus does not disable hit testing or restart motion when reduced-motion/default state has paused it.
- Render hostile repository data through React/canvas text only; add no `innerHTML`, raw HTML, network access, font/CDN, listener, or browser-to-CLI bridge.
- Add no runtime dependency and preserve standalone offline/XSS protections.
- Do not add header controls; tour controls live in the left rail and wrap at 390px.
- Every production behavior is implemented test-first with captured RED and GREEN evidence.

---

### Task 1: Deterministic dependency focus algorithms

**Files:**
- Create: `packages/atlas-ui/src/focus.ts`
- Create: `packages/atlas-ui/src/focus.test.ts`
- Modify: `packages/atlas-ui/src/index.ts`

**Interfaces:**
- Consumes: `Atlas` and `AtlasLink` from `@codeville/core`.
- Produces:

```ts
export interface AtlasFocus {
  id: string
  title: string
  note: string
  nodeIds: string[]
  linkKeys: string[]
}

export type FocusDirection = 'dependencies' | 'dependents'
export function atlasLinkKey(link: AtlasLink): string
export function dependencyCone(atlas: Atlas, rootId: string, direction: FocusDirection): AtlasFocus
export function shortestDependencyPath(atlas: Atlas, fromId: string, toId: string): AtlasFocus | null
export function focusProjectionKey(focus: Pick<AtlasFocus, 'nodeIds' | 'linkKeys'> | null): string
```

- [ ] **Step 1: Write failing traversal tests**

Create `focus.test.ts` with a literal Atlas containing nodes `a`, `b`, `c`, `d`, and external `pkg`; links `a→b`, `a→c`, `b→d`, `c→d`, `d→a` (cycle), `d→pkg`, one containment link, and one link whose target node is missing.

Add tests proving:

1. `atlasLinkKey` returns `${type}\0${from}\0${to}`.
2. `dependencyCone(atlas, 'a', 'dependencies')` includes `a,b,c,d,pkg`, terminates the cycle, excludes containment/missing-endpoint links, and returns sorted node/link arrays.
3. `dependencyCone(atlas, 'd', 'dependents')` follows incoming edges and includes `a,b,c,d` but not `pkg`.
4. A missing root yields a valid empty focus with no nodes/links and a note that says `0 nodes in the visible slice` rather than throwing.
5. `shortestDependencyPath(atlas, 'a', 'd')` deterministically chooses `a→b→d` when `b` sorts before `c`, and returns exactly those nodes/links.
6. Same-node, missing-node, reversed-unreachable, and containment-only cases return `null`.
7. Reversing input node/link order produces the same focus projections and `focusProjectionKey`; differently ordered equivalent arrays produce the same projection key.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm vitest run packages/atlas-ui/src/focus.test.ts
```

Expected: FAIL because `focus.ts` does not exist. Record the feature-missing failure.

- [ ] **Step 3: Implement focus primitives**

Create `focus.ts` with:

```ts
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export function atlasLinkKey(link: AtlasLink): string {
  return `${link.type}\0${link.from}\0${link.to}`
}
```

Build a node map and filter topology to non-containment links whose endpoints both exist. Sort adjacency by the displayed next-node path, next-node ID, and link key.

For cones, use an explicit queue plus `visited` and `usedLinks` sets. For paths, BFS with predecessor records `{ nodeId, link }`; reconstruct only after finding the target. Canonicalize every public result with copied, sorted arrays.

Use exact copy:

- Dependencies title: `Dependencies from <path>`
- Dependents title: `Dependents of <path>`
- Path title: `<from path> → <to path>`
- Every note ends with `in the visible slice.`

`focusProjectionKey(null)` returns `''`; otherwise it sorts copies and joins node IDs, a separator, then link keys. Never mutate caller arrays.

Export the public interfaces/functions from `packages/atlas-ui/src/index.ts`.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
pnpm vitest run packages/atlas-ui/src/focus.test.ts
```

Expected: PASS with pristine output.

- [ ] **Step 5: Run the UI pure-function regression slice**

Run:

```bash
pnpm vitest run packages/atlas-ui/src/focus.test.ts packages/atlas-ui/src/search.test.ts packages/atlas-ui/src/keyboard.test.ts
```

Expected: PASS.

- [ ] **Step 6: Self-review and commit**

Mentally mutate edge direction, containment filtering, missing endpoints, and BFS tie order; confirm a named test fails for each. Then:

```bash
git add packages/atlas-ui/src/focus.ts packages/atlas-ui/src/focus.test.ts packages/atlas-ui/src/index.ts
git commit -m "feat: derive visible dependency focus"
```

---

### Task 2: Deterministic guided-tour chapters

**Files:**
- Create: `packages/atlas-ui/src/tour.ts`
- Create: `packages/atlas-ui/src/tour.test.ts`
- Modify: `packages/atlas-ui/src/index.ts`

**Interfaces:**
- Consumes: `AtlasFocus` and `atlasLinkKey` from Task 1.
- Produces:

```ts
export interface TourChapter extends AtlasFocus {
  kind: 'area' | 'hubs' | 'boundary' | 'all'
}

export function buildTour(atlas: Atlas): TourChapter[]
```

- [ ] **Step 1: Write failing tour tests**

Use a literal Atlas with areas ordered `apps`, `packages`, `root`; local nodes in each area; nine local nodes with explicit fan-in/fan-out ties; two external nodes; internal, external, containment, and missing-endpoint links.

Add tests proving:

1. Non-empty area chapters preserve `atlas.areas` order, include all nodes in that area, and include only internal non-containment links.
2. Empty declared areas are skipped.
3. Hubs include at most eight non-external nodes ranked by `in + out` descending then path, plus every valid incident non-containment link and its opposite endpoint.
4. External boundary exists only when a valid external node/link exists and contains external nodes, directly connected locals, and external links only.
5. Whole visible system is last and includes all existing nodes and valid links, including containment.
6. Adjacent identical projections are de-duplicated while the final all chapter remains present.
7. Empty Atlas returns exactly one `all` chapter with empty arrays.
8. Reversing nodes/links does not change output; changing explicit area order changes only the area-chapter order.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm vitest run packages/atlas-ui/src/tour.test.ts
```

Expected: FAIL because `buildTour` does not exist.

- [ ] **Step 3: Implement tour derivation**

Create `tour.ts`. Use a `validLinks` helper that rejects missing endpoints. Build each projection from sets, then canonicalize through one helper that sorts node IDs and link keys.

Use exact IDs/titles:

- Area: `area:<area.id>`, title `<area.label>`
- Hubs: `hubs`, title `Dependency hubs`
- Boundary: `boundary`, title `External boundary`
- All: `all`, title `Whole visible system`

Notes must be one sentence and include:

- Area: `<count> nodes in the <label> area of the visible slice.`
- Hubs: `Up to 8 local nodes ranked by visible fan-in plus fan-out.`
- Boundary: `External packages and the local nodes connected to them in the visible slice.`
- All: `Every node and link in the whole visible slice.`

De-duplicate only adjacent chapters with equal `focusProjectionKey`, except never remove the final `all` chapter.

Export from `packages/atlas-ui/src/index.ts`.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
pnpm vitest run packages/atlas-ui/src/tour.test.ts packages/atlas-ui/src/focus.test.ts
```

Expected: PASS.

- [ ] **Step 5: Self-review and commit**

Confirm no role/AI prose affects membership, final all includes containment, and all other chapters exclude it. Then:

```bash
git add packages/atlas-ui/src/tour.ts packages/atlas-ui/src/tour.test.ts packages/atlas-ui/src/index.ts
git commit -m "feat: derive a guided atlas tour"
```

---

### Task 3: Renderer focus projection and camera fitting

**Files:**
- Modify: `packages/atlas-ui/src/renderer.ts`
- Create: `packages/atlas-ui/src/renderer-focus.test.ts`

**Interfaces:**
- Consumes: canonical focus projection `{ nodeIds: string[]; linkKeys: string[] } | null` and `atlasLinkKey`/`focusProjectionKey` from Task 1.
- Produces: `ViewState.focus` and `AtlasRenderer.focusNodes(ids: string[]): void`.

- [ ] **Step 1: Write failing renderer-helper tests**

Export these DOM-free helpers from `renderer.ts` for direct tests:

```ts
export function nodeIsFocused(id: string, focus: ViewState['focus']): boolean
export function linkIsFocused(link: AtlasLink, focus: ViewState['focus']): boolean
export function focusChanged(before: ViewState['focus'], next: ViewState['focus']): boolean
```

Test:

- `null` focus treats every node/link as focused so current rendering remains unchanged.
- Active focus matches only listed node IDs/link keys.
- Equivalent differently ordered arrays are not changed; different membership is changed.
- Missing IDs/keys do not match.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm vitest run packages/atlas-ui/src/renderer-focus.test.ts
```

Expected: FAIL because `ViewState.focus` and helpers do not exist.

- [ ] **Step 3: Extend renderer view state without changing the no-focus path**

Add to `ViewState`:

```ts
focus: { nodeIds: string[]; linkKeys: string[] } | null
```

Initialize it to `null`. Implement the helpers using Task 1 canonical keys.

Update behavior:

- `viewChanged` includes `focusChanged`.
- `isInFocus` checks search first, active area second, active focus third, and preserves the existing `false` default when none applies.
- Background links call `linkIsFocused`; unrelated links draw with `ctx.globalAlpha = 0.16` for that stroke only, then restore `1`.
- `drawPackets` skips links not in active focus; null focus draws every current packet.
- Focus never changes hit testing or the underlying `atlas.links`/`activeNodes` arrays.

- [ ] **Step 4: Add focused bounding-box fitting**

Refactor the existing `fit()` body into a private `fitNodes(nodes: AtlasNode[], saveHome: boolean)` helper. Keep current `fit()` behavior by calling `fitNodes(this.activeNodes, true)`.

Add:

```ts
focusNodes(ids: string[]): void {
  const nodes = [...new Set(ids)].map((id) => this.nodeById.get(id)).filter((n): n is AtlasNode => n != null)
  if (nodes.length === 0) return
  this.fitNodes(nodes, false)
  this.draw()
}
```

Focused fitting does not replace `home`; `resetView()` still returns to the whole-atlas home. `setLayout` calls `fit()`; `Atlas.tsx` will reapply focused fitting after layout changes in Task 4.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
pnpm vitest run packages/atlas-ui/src/renderer-focus.test.ts packages/atlas-ui/src/iso.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run typecheck and standalone build**

Run:

```bash
pnpm typecheck
pnpm -F @codeville/atlas-ui build
```

Expected: PASS. No React wiring exists yet; initialize the new required field everywhere needed to keep typecheck green.

- [ ] **Step 7: Self-review and commit**

Confirm every temporary `globalAlpha` is restored, `home` survives focus, null focus is unchanged, and no hit-test filtering was added. Then:

```bash
git add packages/atlas-ui/src/renderer.ts packages/atlas-ui/src/renderer-focus.test.ts
git commit -m "feat: render a focused atlas slice"
```

---

### Task 4: Guided-tour and dependency-focus UI integration

**Files:**
- Create: `packages/atlas-ui/src/panels/GuidedTour.tsx`
- Create: `packages/atlas-ui/src/panels/GuidedTour.test.ts`
- Modify: `packages/atlas-ui/src/Atlas.tsx`
- Modify: `packages/atlas-ui/src/panels/SystemMap.tsx`
- Modify: `packages/atlas-ui/src/panels/SystemMap.test.ts`
- Modify: `packages/atlas-ui/src/panels/Inspect.tsx`
- Create: `packages/atlas-ui/src/panels/InspectFocus.test.ts`
- Modify: `packages/atlas-ui/src/theme.css`
- Modify: `README.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: `buildTour`, `dependencyCone`, `shortestDependencyPath`, `AtlasFocus`, and renderer focus from Tasks 1-3.
- Produces: accessible guided-tour controls, node cone buttons, two-node path action, active-focus summary, and clear/reset behavior.

- [ ] **Step 1: Write failing GuidedTour component tests**

Define props:

```ts
interface GuidedTourProps {
  chapters: TourChapter[]
  index: number | null
  onStart(): void
  onMove(index: number): void
  onExit(): void
}
```

Call `GuidedTour(props)` directly as `SystemMap.test.ts` does. Traverse the returned React element's children with a small test-only recursive helper and assert:

- Inactive renders `Start guided tour` and invokes `onStart`.
- First active chapter renders `Chapter 1 of N`, title/note, disabled Back, enabled Next, and `aria-live="polite"`.
- Last chapter disables Next.
- Back/Next call `onMove` with bounded neighboring indexes; Exit calls `onExit`.

- [ ] **Step 2: Write failing Inspect focus-control tests**

Extend `Inspect` props with:

```ts
focus: AtlasFocus | null
focusMessage: string | null
onFocus(focus: AtlasFocus): void
onFocusMessage(message: string | null): void
onClearFocus(): void
```

In `InspectFocus.test.ts`, call `Inspect` directly with literal node/set targets and recursively inspect returned elements. Assert:

- A node on the built tab exposes `Focus dependencies` and `Focus dependents`; callbacks receive `dependencyCone` results.
- Exactly two selected nodes expose `Find directed path` using selection order.
- A missing path does not call `onFocus` and calls `onFocusMessage('No directed dependency path in the visible slice.')`.
- A successful focus calls `onFocusMessage(null)` before `onFocus`.
- Active focus renders title, note, and `Clear focus`; clear invokes its callback.

- [ ] **Step 3: Run component tests and verify RED**

Run:

```bash
pnpm vitest run packages/atlas-ui/src/panels/GuidedTour.test.ts packages/atlas-ui/src/panels/InspectFocus.test.ts
```

Expected: FAIL because the component and focus props/controls do not exist. Correct any test syntax errors until failures are feature-missing assertions.

- [ ] **Step 4: Implement GuidedTour and left-rail placement**

Create `GuidedTour.tsx` using only native `<section>`, `<button>`, and text elements. Use class names `cv-tour`, `cv-tour-head`, `cv-tour-note`, and `cv-tour-actions`.

Extend `SystemMap` with optional prop:

```ts
import type { ReactNode } from 'react'

tour?: ReactNode
```

Render it after `.cv-rail-head` and before search. Extend the legacy SystemMap test with `tour: undefined` and assert the component still returns `aside`.

- [ ] **Step 5: Implement Atlas state orchestration**

In `Atlas.tsx`:

- `const chapters = useMemo(() => buildTour(atlas), [atlas])`
- State: `tourIndex: number | null`, `manualFocus: AtlasFocus | null`, `focusMessage: string | null`.
- Derive `activeFocus = tourIndex == null ? manualFocus : chapters[Math.min(tourIndex, chapters.length - 1)] ?? null`.
- Pass `focus: activeFocus ? { nodeIds: activeFocus.nodeIds, linkKeys: activeFocus.linkKeys } : null` to `renderer.setView`.
- Add an effect that calls `renderer.focusNodes(activeFocus.nodeIds)` when focus or layout changes; null focus calls `resetView()` only when the user explicitly clears/exits/resets, not on every render.
- Starting tour sets index `0`, clears manual focus/message/search/active area/selected link, and preserves `flowing`.
- Moving tour clamps to `[0, chapters.length - 1]` and clears selection/message.
- Exiting tour clears index and calls renderer reset.
- Manual focus clears tour/search/area/selected link/message, stores the focus, and fits nodes.
- Clear focus clears both focus forms/message and resets renderer.
- Reset clears current existing state plus tour/manual focus/message.
- On a new Atlas, clamp the tour index and clear a manual focus whose node IDs have no intersection with current nodes.

Do not add header controls or change canvas keyboard commands.

- [ ] **Step 6: Implement Inspect actions and focus summary**

Thread the new props through `Inspect`, `HowItsBuilt`, and `SetBuilt`.

- `HowItsBuilt` invokes `dependencyCone` for the selected node and calls `onFocus`.
- `SetBuilt` only renders `Find directed path` for exactly two nodes. On null result it calls the existing `onFocusMessage` prop with the exact no-path copy; successful focus clears the message before calling `onFocus`.
- At the top of `.cv-inspect-body`, render an active-focus section before target content with title, note, and Clear button. Render `focusMessage` in a `role="status"` paragraph.

Thread `onFocusMessage` from `Atlas.tsx` through each intermediate component that needs it. The binding behavior is the exact no-path copy and no `onFocus` call.

- [ ] **Step 7: Add responsive styles**

In `theme.css`:

```css
.cv-tour { border-bottom: 1px solid var(--rule); padding: 10px 12px; }
.cv-tour-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.cv-tour-note { margin: 6px 0 0; }
.cv-tour-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.cv-tour-actions .cv-btn { min-width: 0; }
```

At existing narrow breakpoints, ensure `.cv-tour`, `.cv-tour-actions`, and their buttons stay within the rail; do not add fixed widths exceeding the rail.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run:

```bash
pnpm vitest run packages/atlas-ui/src/panels/GuidedTour.test.ts packages/atlas-ui/src/panels/InspectFocus.test.ts packages/atlas-ui/src/panels/SystemMap.test.ts packages/atlas-ui/src/focus.test.ts packages/atlas-ui/src/tour.test.ts packages/atlas-ui/src/renderer-focus.test.ts
```

Expected: PASS with pristine output.

- [ ] **Step 9: Update docs**

In `README.md`, state that the guided tour and dependency focus are derived from visible import topology; cones and paths are not runtime traces.

In `docs/architecture.md`, add a `Guided discovery` subsection documenting pure UI derivation, unchanged Atlas serialization, containment exclusion, visible-slice labels, and renderer-only focus projection.

- [ ] **Step 10: Run full verification and offline smoke**

Run:

```bash
pnpm test
pnpm typecheck
pnpm -F @codeville/atlas-ui build
pnpm build
```

Generate a standalone file:

```bash
pnpm atlas . -o /tmp/codeville-guided-focus.html
```

Verify it is non-empty and contains the new Guided Tour copy. Run:

```bash
rg -n "https?://|fonts\.googleapis|<script[^>]+src=|fetch\(|innerHTML|dangerouslySetInnerHTML" /tmp/codeville-guided-focus.html packages/atlas-ui/src
```

Expected: no unsafe/network matches in the standalone or new UI source; existing safe string occurrences must be individually explained rather than treated as passes.

Inspect the CSS rules and existing narrow-screen media blocks to confirm no fixed tour width can exceed 390px. If browser tooling is available, render at 390px and record `document.documentElement.scrollWidth <= window.innerWidth`; otherwise report the browser check as `NOT_RUN` and retain the static/build evidence.

- [ ] **Step 11: Self-review and commit**

Confirm every active focus can be cleared, reduced-motion state is preserved, no path order is ambiguous, and copy never says runtime flow. Then:

```bash
git add packages/atlas-ui/src/panels/GuidedTour.tsx packages/atlas-ui/src/panels/GuidedTour.test.ts packages/atlas-ui/src/Atlas.tsx packages/atlas-ui/src/panels/SystemMap.tsx packages/atlas-ui/src/panels/SystemMap.test.ts packages/atlas-ui/src/panels/Inspect.tsx packages/atlas-ui/src/panels/InspectFocus.test.ts packages/atlas-ui/src/theme.css README.md docs/architecture.md
git commit -m "feat: guide exploration through the visible atlas"
```
