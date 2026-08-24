# Guided Discovery and Dependency Focus Design

## Status

Approved for implementation on 2026-08-24 as the second System Atlas pattern harvested into Codeville.

## Purpose

Codeville opens on the whole visible repository slice. Add an optional guided view and explicit dependency focus operations so a person can learn the map progressively without confusing imports with runtime execution.

All chapters and focus results are derived from the existing `Atlas`. No hand-authored positions, stories, payloads, questions, decisions, or planned components enter the repository-truth contract.

## Architecture

The serialized `Atlas` type remains unchanged. Add pure UI-domain modules under `packages/atlas-ui/src/`:

```ts
export interface AtlasFocus {
  id: string
  title: string
  note: string
  nodeIds: string[]
  linkKeys: string[]
}

export interface TourChapter extends AtlasFocus {
  kind: 'area' | 'hubs' | 'boundary' | 'all'
}

export function atlasLinkKey(link: AtlasLink): string
export function buildTour(atlas: Atlas): TourChapter[]
export function dependencyCone(atlas: Atlas, rootId: string, direction: 'dependencies' | 'dependents'): AtlasFocus
export function shortestDependencyPath(atlas: Atlas, fromId: string, toId: string): AtlasFocus | null
```

`focus.ts` owns graph traversal, link keys, and deterministic focus construction. `tour.ts` owns chapter derivation. Both are pure and DOM-free.

`Atlas.tsx` owns the active focus and tour index. `AtlasRenderer` receives a serializable focus projection through `ViewState` and only renders it; it does not derive graph semantics.

## Guided tour contract

`buildTour(atlas)` returns chapters in this order:

1. One chapter per non-empty `AtlasArea`, preserving `atlas.areas` order. The chapter includes every node in that area and every non-containment link whose two endpoints are both in the chapter.
2. `Dependency hubs`: up to eight non-external nodes ranked by `in + out` descending, then path, with every non-containment link incident to those hubs and both endpoints of those links.
3. `External boundary` when external nodes exist: all external nodes plus directly connected local nodes and their external links.
4. `Whole visible system`: all nodes and all links.

Duplicate adjacent chapters with identical node and link sets are removed. An empty Atlas still returns one `Whole visible system` chapter.

Chapter copy states facts only. Area chapters say which area is focused. Hub copy says ranking is based on visible fan-in plus fan-out. Boundary copy says external package relationships. The final chapter explicitly says it is the whole visible slice.

## Focus operations

All traversals ignore containment links.

### Dependency cone

- `dependencies` follows outgoing import/external edges transitively.
- `dependents` follows incoming import/external edges transitively.
- The root is always included.
- The result includes only traversed links and their endpoints.
- Cycles terminate through a visited set.
- Node IDs and link keys in the result are sorted deterministically.

### Shortest directed path

- Requires two distinct existing node IDs.
- Follows edge direction.
- Uses breadth-first search.
- Adjacency is sorted by target path, target ID, and link key so equal-length choices are deterministic.
- Returns `null` when no directed path exists in the visible slice.
- The result includes exactly the path nodes and links.

No result is called an execution trace or runtime flow.

## User experience

Add a compact `GuidedTour` section to the left system-map rail:

- `Start guided tour` when inactive.
- When active: chapter count/title, one-sentence note, `Back`, `Next`, and `Exit tour`.
- Controls are native buttons with accessible names and disabled boundary states.
- The chapter note uses `aria-live="polite"`.

Add dependency focus controls to the `How it's built` inspection tab:

- A selected node offers `Focus dependencies` and `Focus dependents`.
- Exactly two selected nodes offer `Find directed path`, using selection order as from/to.
- No-path feedback reads: `No directed dependency path in the visible slice.`
- When a focus is active, the inspect panel shows its title/note and `Clear focus`.

Starting a tour clears search, active area, selected link, and manual dependency focus. Starting a manual dependency focus exits the tour and clears active area/search. Selecting or hovering nodes remains available while focused. `Reset view`, `Exit tour`, and `Clear focus` restore the whole visible atlas without rebuilding it.

## Renderer behavior

Extend `ViewState` with:

```ts
focus: { nodeIds: string[]; linkKeys: string[] } | null
```

- With no focus, current rendering is byte-for-byte behaviorally unchanged.
- With focus, focused nodes retain normal area colors; other nodes use the existing dim palette.
- Focused links draw normally; unrelated links render at reduced alpha.
- Packets run only on focused non-containment links while focus is active.
- Hit testing remains available for every visible node and link.
- Add `focusNodes(ids: string[]): void` to fit the bounding box of existing focused nodes. Empty/missing IDs leave the camera unchanged.
- Layout switches reapply the active focus and refit its nodes.

Focus comparisons use canonical sorted arrays so `viewChanged` detects real changes without relying on `Set` identity.

## Accessibility and responsive behavior

- Do not add controls to the already crowded header.
- Tour controls wrap within the left rail and do not introduce document-level horizontal overflow at 390px.
- Focus state is conveyed in text, not color alone.
- Reduced-motion preference continues to disable initial packet flow; focus does not restart it.
- Existing canvas keyboard pan/zoom/reset behavior remains intact.

## Error and legacy handling

- Missing coverage on an older Atlas does not affect tours or focus.
- Links with missing evidence/confidence remain traversable because graph topology is still present.
- Links whose endpoint node is absent are ignored by tours and traversals.
- A new Atlas clamps the tour index and clears a focus that references no remaining nodes.
- No path and empty cone conditions are normal UI states, not exceptions.

## Testing

Use strict TDD.

- Pure graph tests cover direction, cycles, missing endpoints, deterministic tie-breaking, no path, and containment exclusion.
- Tour tests cover area order, hub ranking/ties, conditional external boundary, duplicate removal, missing endpoints, and empty Atlas.
- Renderer helper tests cover focus membership and canonical change detection without mocking canvas.
- Component-level function tests call `GuidedTour` and `Inspect` as existing tests call `SystemMap`, asserting native controls, disabled states, and callback wiring through returned React elements.
- Existing keyboard, search, legacy coverage, layout, and standalone tests remain green.
- Final verification includes full tests, typecheck, standalone build, a generated offline HTML smoke check, and a 390px CSS/static contract inspection.

## Non-goals

- No control-flow or runtime trace analysis.
- No source-level symbol drill-down in this milestone.
- No annotations, questions, ADRs, ghosts, or planned components.
- No new layout algorithm.
- No persistence of tour/focus state in exported JSON.
- No web listener, local server, or browser-to-CLI bridge.

## Security and truth constraints

- Repository data remains untrusted and is rendered through React text or existing canvas text APIs; no `innerHTML` or raw HTML.
- Standalone HTML remains fully offline with the existing `embedJson` and `escapeHtml` protections.
- Every focus label includes `visible` or `visible slice` where omission could imply completeness.
- AI summaries never determine chapter membership, graph traversal, or focus results.
- Add no runtime dependency.
