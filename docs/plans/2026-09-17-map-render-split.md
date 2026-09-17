# Plan: split the map render path so cruush runs smoother

Status: **awaiting sign-off**. No code written.
Branch: `claude/crush-performance-split-he27z3` (currently identical to `origin/main` at `ce0c7d0`).

I have no record of the earlier conversation in this session, so this plan is built from
what the code shows rather than from that discussion. If it misses the part you meant by
"splitting elements", say which part and I will redo it.

---

## The measurement

`src/app/components/MapHome.tsx` is 3581 lines with 65 `useState`, 32 `useEffect`,
3 `useCallback`. `src/app/components/MapView.tsx` is 3244 lines. Neither is wrapped in
`React.memo`; there is no `React.memo` anywhere in `src/app/components`.

`MapHome.tsx:1390` runs `window.setInterval(() => setMapPingClock(Date.now()), 1000)`
for as long as the map is open. Every one of those ticks does all of this:

| # | Work | Where |
| --- | --- | --- |
| 1 | MapHome re-renders its whole tree | `MapHome.tsx` |
| 2 | `mapMarkers` rebuilds: map + filter over every displayed user | `MapHome.tsx:2650`, dep `mapPingClock` |
| 3 | `browseVisibleMapMarkers` rebuilds, one haversine per marker | `MapHome.tsx:2815` |
| 4 | MapView re-renders; every prop it receives is a fresh inline literal | `MapHome.tsx:3010` |
| 5 | `denseMarkerResult` recomputes | `MapView.tsx:2443` |
| 6 | `renderedMarkers` recomputes: full person clustering, place clustering, overlap pass | `MapView.tsx:2448` |
| 7 | `JSON.stringify(renderedMarkers)` over the entire array | `MapView.tsx:2463` |
| 8 | `viewportMarkerSignature` rebuilds and sorts | `MapView.tsx:2467` |
| 9 | Marker diff effect runs `JSON.stringify(marker)` once per marker | `MapView.tsx:3052` |
| 10 | Ghost radius circle: polygon recomputed, `setData` called | `MapView.tsx:2823`, dep `radiusCircle` |
| 11 | Ghost leash effect re-runs | `MapView.tsx:2890`, dep `ghostLeash` |

Item 6 is the expensive one. `applyPersonMarkerClusters` (`MapView.tsx:979`) grows each
cluster with a `while (grew) { clusterableMarkers.forEach(...) }` loop calling
`areInSameBuildingDisplayArea` on the whole group each pass.

None of that work produces a different result on a tick where no ping actually expired,
which is almost every tick.

The same cascade also fires on **every unrelated MapHome state change**, because
`radiusCircle`, `ghostLeash`, `browseArea`, `focusArea`, `focusCoordinates`,
`initialViewport` and `onMapClick` are all built inline at the `<MapView>` call site
(`MapHome.tsx:3010-3057`). Typing one character into the "Request a city" input re-clusters
every marker and re-serialises the array.

The marker DOM itself is already diffed per marker (`MapView.tsx:3052`), so pins are not
torn down and rebuilt. The cost is the JavaScript above it, on the main thread, once a
second.

---

## The five steps

Each one is independently shippable and behaviour-preserving. Nothing is deleted.

### 1. Replace the 1s clock with a deadline timer

The clock exists only to decide whether a ping has passed `expiresAt`. Ticking once a
second to answer that is polling; the answer only changes at the deadline itself.

Schedule a single `setTimeout` for the *next* actual ping expiry and re-render then.
This is the pattern already in this file's neighbour: `MapView.tsx:2431` does exactly
that for ghost rotation deadlines.

Ticks per map session drop from 60/minute to one per real expiry. Pings expire on their
exact deadline instead of within a second of it.

**Biggest single win. Contained to `MapHome.tsx`.**

### 2. Stabilise the props MapView receives

`useMemo` the object props and `useCallback` the handler at `MapHome.tsx:3010`. Nothing
about what is passed changes, only when a new identity is created.

This stops items 5, 6, 7, 10 and 11 from running on unrelated MapHome state changes.

### 3. Drop the whole-array `JSON.stringify` signatures

`renderedMarkerSignature` (`MapView.tsx:2463`) serialises every marker with every field.
Replace with the cheap field-join already written twelve lines below it
(`viewportMarkerSignature`), extended to the fields the effects actually depend on, so
the same effects fire on exactly the same changes.

### 4. Split MapHome's overlays off the map's render path

MapHome renders MapView plus roughly fifteen overlay surfaces from one component holding
all 65 state slices. Move the surfaces that own their own state, starting with the
city-request form, into child components that hold that state themselves. Then wrap
MapView in `React.memo`, which only becomes effective once step 2 lands.

This is the largest diff and the one I would ship last and separately.

### 5. The next two screens

`LocalFeed.tsx` (1483 lines, 37 `useState`, 0 `useMemo`) and `DirectMessages.tsx`
(1551 lines, 33 `useState`). Same treatment, lower priority. Out of scope unless asked.

---

## Verification

- `pnpm vitest run src/app/components/MapView.test.tsx src/app/components/MapHome.test.tsx`
  (targeted per L4, not the full suite).
- `pnpm check:layout` at 375/768/1280 for D1-D7.
- `vite build`.
- Rendered before/after on the running app per B1/B2, with a React Profiler commit count
  for one idle minute on the map. This needs a working `pnpm dev:local:seeded`; the
  previous handoff records that failing on a machine without Docker. If it fails here I
  will say so plainly rather than claim the improvement (B5).

No visual change is intended by any step. Any pixel that moves is a bug in the change.

## Not in scope

No product, design or behaviour change. No deletions. No map style, label sizing or
canvas filter work (C5). No new dependency. No environment variables.
