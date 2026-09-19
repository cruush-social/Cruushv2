# Plan: move the DOM/React boundary for map pins

Status: **awaiting sign-off**. No code written.
Branch: `claude/crush-performance-split-he27z3`. PR #284.

Supersedes the first version of this file, which led on the re-render cascade. The cascade
is real and is kept below, but it is what multiplies the cost, not the cost itself. The
subject is where the line between hand-written DOM and React is drawn for map pins.

---

## Where the boundary sits today

Every map pin is half raw DOM and half React, and the seam is drawn **once per pin**.

`createMarkerElement` (`MapView.tsx:2054`) builds the outside by hand:

- `document.createElement('button')`, then `className`, then five `dataset` fields
- `addEventListener` for pointerdown, pointerup, pointerenter, pointerleave, long-press

Then, for the inside of that same element, at `MapView.tsx:2085`:

```js
const root = createRoot(element);
```

**One React root per marker.** Each one is an independent fiber tree with its own scheduler
entry, its own effect queue and its own timers. Nothing else in `src/app` calls `createRoot`
or `flushSync`; the whole rest of the app is a single React tree.

Every render of that root goes through `MapView.tsx:2102`:

```js
const renderMarker = () => {
  flushSync(() => {
    root.render(<MapMarkerPin marker={marker} previewed={previewed} />);
  });
};
```

`flushSync` forces a synchronous, unbatched commit. It is called at creation
(`MapView.tsx:2311`) and again on every preview toggle (`MapView.tsx:2125`), which is every
hover in and hover out, and every long-press.

What that root renders is not small. `MapMarkerPin` (`MapView.tsx:1955`) holds its own
`useState` and a `useEffect` deadline timer, and renders one of:

| Path | Components below it |
| --- | --- |
| person | `GhostRotationPulse` (4 hooks) → `MarkerHeart` (1 hook), two `MarkerSideBadge`, `SignalBadge`, `GhostRotationCountdown` (2 hooks, own 1s interval at `MapView.tsx:1268`) |
| person cluster | `PeopleClusterMarker` |
| venue cluster | `VenueClusterMarker` |
| place | `PlaceMarker` |
| event | `LaunchPartyMarker` |

So with N pins on screen there are N React roots, N sets of hooks and timers, and N
synchronous commits.

Mounting is the worst case. The creation loop at `MapView.tsx:3064` runs inside a single
`queueMicrotask` and calls `createMarkerElement` for each new marker, so mounting N pins is
**N back-to-back `flushSync` commits in one task**, with no batching and no yielding to the
browser between them.

Teardown is split the other way: `cleanupRenderedMarker` (`MapView.tsx:2378`) removes the
MapLibre marker synchronously but defers `root.unmount()` to a microtask.

## What multiplies it

The marker diff effect is keyed on `renderedMarkerSignature`, and `renderedMarkers`
recomputes whenever `focusCoordinates` changes identity. That prop is built inline at the
`<MapView>` call site (`MapHome.tsx:3010`), and `MapHome.tsx:1390` re-renders MapHome once a
second via `setInterval(() => setMapPingClock(Date.now()), 1000)`. Every unrelated MapHome
state change does the same, down to a keystroke in the "Request a city" input.

Each pass re-runs person clustering (`applyPersonMarkerClusters`, `MapView.tsx:979`, a
`while (grew) { forEach }` growth loop), `JSON.stringify(renderedMarkers)` over the whole
array (`MapView.tsx:2463`), and `JSON.stringify(marker)` per marker in the diff
(`MapView.tsx:3052`).

The diff spares surviving pins a rebuild, so this is not N re-mounts per second. It is the
work above the pins, every second, feeding a boundary that is expensive to cross.

---

## The two directions

### A. Push the boundary down: pins become pure DOM

Drop `createRoot` entirely. Build the pin with the same imperative DOM already used for the
wrapper, and update it by mutating classes and attributes. Preview state becomes a class
toggle instead of a React commit.

Removes both costs completely. But the pin art is a real component tree with conditional
subtrees, gradients, badge slots and countdown text, and hand-writing it as DOM means
re-expressing Julien's design in a different medium. That is a large, error-prone rewrite
with real regression risk on artwork that is settled.

### B. Pull the boundary up: one root for all pins (recommended)

Keep MapLibre's marker elements as positioning containers. Render into them from the app's
existing React tree with `createPortal`, one portal per marker, all inside the single root
the app already has.

- One fiber tree instead of N
- Normal batching; `flushSync` goes away
- Preview becomes React state in a memoized pin component, so a hover re-renders one pin
- Every existing pin component stays exactly as written

Smaller diff than A, and it keeps the design untouched.

Two things to check before committing to it:

1. The marker element must outlive its portal. Ordering against MapLibre's own
   `marker.remove()` needs to be got right, and is the likely source of the duplicate-pin
   bug already failing CI on `main`.
2. React events through a portal bubble along the React tree, not the DOM tree. The
   map-click filter at `MapView.tsx:2049` uses `target.closest('[data-map-marker-pin="true"]')`,
   which is DOM-based and so unaffected. Worth verifying rather than assuming.

### Either way

Stabilise the props at `MapHome.tsx:3010` with `useMemo`/`useCallback`, and replace the
1s clock with a `setTimeout` for the next real ping expiry, the pattern already used for
ghost rotation at `MapView.tsx:2431`. Both are small, independent of A or B, and cut how
often the boundary is crossed at all.

---

## Verification

- `pnpm vitest run src/app/components/MapView.test.tsx src/app/components/MapHome.test.tsx`
  (targeted per L4).
- `pnpm check:layout` at 375/768/1280 for D1-D7.
- `vite build`.
- Rendered before and after per B1/B2, with a Profiler commit count for one idle minute on
  the map. If `dev:local:seeded` cannot start here I will say so rather than claim the
  improvement (B5).

No visual change is intended. Any pixel that moves is a bug in the change.

## Not in scope

No product, design or behaviour change. No deletions. No map style, label sizing or canvas
filter work (C5). No new dependency. No environment variables.
