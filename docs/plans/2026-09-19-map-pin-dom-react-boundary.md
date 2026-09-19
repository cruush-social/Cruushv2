# Implementation plan: move the DOM/React boundary for map pins

Status: **plan, awaiting sign-off**. No source changed yet.
Worktree: `/home/user/cruush-map-pin-boundary-20260919`
Branch: `claude/crush-performance-split-he27z3`
Base: `6f52a28`, confirmed live at `https://api.cruush.app/api/build` (`stage: production`) before this
worktree was cut.

The measurement this rests on is in `docs/plans/2026-09-17-map-render-split.md`. This file is the
how, not the why.

**Assumption:** this builds direction **B**, one React root with portals. That is the direction
recommended in the earlier doc. If the one you meant was A (pins as pure hand-written DOM), say so
and I will rewrite this; the staging below would change completely.

---

## The one decision that makes this small

The pin is already split into two halves that change for different reasons:

| Half | What it does | Where |
| --- | --- | --- |
| The shell | `document.createElement('button')`, class names, five `dataset` fields, `aria-label`, `title`, and eleven `addEventListener` calls covering hover, focus, long-press, move tolerance, contextmenu and click | `createMarkerElement`, `MapView.tsx:2054-2318` |
| The artwork | `MapMarkerPin` and everything under it | `MapView.tsx:1955`, rendered into the shell via `createRoot` |

**Only the second half moves.** The shell keeps its hand-written DOM and keeps every native
listener exactly as written.

That matters because the click and pointerdown handlers call `stopImmediatePropagation()`
(`MapView.tsx:2233`, `:2183`), which orders them against MapLibre's own native map listeners.
React synthetic handlers attach at the root container and would fire at a different point in that
ordering. Migrating the event layer would risk the map-click filter, the long-press preview and the
spiderfy behaviour all at once, for no performance gain: the listeners are not what costs anything.

So the diff is: delete one `createRoot` per pin, delete `flushSync`, and render the same
`MapMarkerPin` elements through portals from the root the app already has.

---

## Stage 1: stop paying the cost unnecessarily

Independent of the boundary. Ship first, on its own.

**1a. `MapHome.tsx:1390`** — the 1s `setInterval` that drives `mapPingClock` exists only to decide
whether a ping is past `expiresAt`. Replace with a `setTimeout` scheduled for the next actual
expiry across the loaded pings, rescheduled when that set changes. The pattern is already in the
neighbouring file at `MapView.tsx:2431` for ghost rotation deadlines.

Behaviour change, and the only one in this plan: a ping expires at its exact deadline rather than
within a second after it. Tighter, not looser.

**1b. `MapHome.tsx:3010`** — `useMemo` the object props at the `<MapView>` call site
(`browseArea`, `focusArea`, `focusCoordinates`, `initialViewport`, `radiusCircle`, `ghostLeash`)
and `useCallback` the inline `onMapClick`. Nothing about their values changes, only how often a new
identity is created.

Together these stop `renderedMarkers` re-clustering, `JSON.stringify(renderedMarkers)` re-running,
and the ghost-radius geojson being rebuilt on every unrelated MapHome state change.

## Stage 2: the boundary move

**2a. `RenderedMapMarker` (`MapView.tsx:629`)** — drop the `root` field. Add nothing.

**2b. `createMarkerElement` (`:2054`)** — remove `const root = createRoot(element)` (`:2085`), the
`renderMarker` helper (`:2101-2105`) and its call at `:2311`. Keep the element, every listener, and
`setPreviewed`'s imperative half: `element.dataset.markerPreviewed`, the `zIndex` swap and
`aria-pressed` (`:2106-2126`). `setPreviewed` gains a callback the caller supplies for the React
half.

**2c. MapView holds the hosts.** A `useState` keyed by marker id:

```ts
type PinHost = { id: string; marker: MapMarker; element: HTMLElement; previewed: boolean };
const [pinHosts, setPinHosts] = useState<Map<string, PinHost>>(() => new Map());
```

The marker sync effect (`:3041`) writes this map instead of calling into a per-pin root. **Keyed by
id, a Map cannot hold the same pin twice.** That is the structural reason this also closes the
duplicate-pin bug currently failing `session-interactions.spec.ts:832` on `main`, where
`Open Nearby Ghost on map` resolves to two elements carrying the same `data-map-marker-id`.

**2d. MapView renders them**, inside the existing return (`:3223`):

```tsx
{Array.from(pinHosts.values()).map((host) => createPortal(
  <MapMarkerPin marker={host.marker} previewed={host.previewed} />,
  host.element,
  host.id,
))}
```

**2e. `cleanupRenderedMarker` (`:2378`)** — delete the host from `pinHosts` so React unmounts that
portal, then `marker.remove()` as now. The deferred `queueMicrotask(() => root.unmount())` goes
away with the root.

## Stage 3: preview becomes React state

`setPreviewed` stops driving a render directly. It does its imperative half, then flips
`previewed` on that one host. With `MapMarkerPin` wrapped in `React.memo`, a hover re-renders one
pin instead of committing a whole root synchronously.

## Stage 4: confirm the cost is gone

`flushSync` and `createRoot` should have no remaining callers in `src/app`. Assert it:

```
grep -rn "createRoot\|flushSync" src/app --include=*.tsx --include=*.ts | grep -v main.tsx
```

`src/main.tsx` keeps the app's single `createRoot`. Nothing else should match.

---

## Risks, and how each is checked

| Risk | Why it might bite | Check |
| --- | --- | --- |
| Pin content arrives a tick later than the container | `flushSync` currently fills the element before it is handed to MapLibre | The shell carries explicit `h-[128px] w-[103px]`, and MapLibre positions by transform on the container, so content timing should not move a pin. Measure pin centres before and after at 375 and 1280. |
| Unmount ordering against `marker.remove()` | This is where the duplicate-pin bug already lives | Pan and zoom hard, then assert every `data-map-marker-id` on the page is unique. Add that assertion to the marker test. |
| Portal event bubbling | React events bubble along the React tree, not the DOM | The map-click filter at `:2049` uses `target.closest('[data-map-marker-pin="true"]')`, which is DOM-based, and the pin's own listeners stay native. Verify rather than assume: click a pin, click the map, confirm the sheet opens and closes as now. |
| Spiderfy and cluster pins | They render through the same `MapMarkerPin` switch | Covered by the existing cluster tests; run them. |

## Verification, per stage

Targeted, per L4. Not the full suite.

```
pnpm vitest run src/app/components/MapView.test.tsx src/app/components/MapHome.test.tsx
```

That is 74 + 82 tests over the two files being changed. Then:

- `pnpm check:layout` at 375 / 768 / 1280 for D1-D7.
- `vite build`.
- `pnpm exec playwright test --config playwright.regression.config.ts` for
  `session-interactions.spec.ts` and `e2e/map-ping.spec.ts`, the two specs that touch marker DOM.
  Note that spec is **already red on `main`**, so the bar is "no test red here that is not red on
  `6f52a28`", compared run to run, not "all green".
- Rendered before and after per B1/B2: 375px mobile and desktop, uncropped, plus a React Profiler
  commit count for one idle minute on the map.

No visual change is intended by any stage. Any pixel that moves is a bug in the change, not a
tradeoff.

## If it goes wrong

Each stage is its own commit and reverts on its own. Stage 1 is independent of 2-4 entirely.
Stage 2 is the only one that changes how pins reach the screen; if the rendered check disagrees
with the before shot, revert that commit rather than patch forward.

## Not in scope

No product, design or behaviour change beyond the ping-expiry timing named in 1a. No deletions. No
map style, label sizing or canvas filter work (C5). No new dependency. No environment variables.
`LocalFeed` and `DirectMessages` carry the same shape of problem and are not touched here.
