# Measured: where the map actually spends its time

Taken on the `ego lite` local space, 2026-09-19. Branch `claude/crush-performance-split-he27z3`,
base `6f52a28`. Postgres 16 on 5470, database `cruush_ego_lite_20260919`, API 3025, frontend 5205.

All numbers are from a real signed-in map in Chromium, 390x844, 6x CPU throttle standing in for a
mid-range phone. The throttle was verified biting: a 20M-iteration spin takes ~175ms instead of
~25ms. No app code was changed to measure; the render counter and the seed scale harness were
temporary and reverted.

## 1. Stage 1 works, and only matters at scale

Idle map, 20s, MapHome renders:

| profiles | before | after |
| --- | --- | --- |
| 19 (seeded) | 41, 41, 42 | 3, 3, 3 |

Blocking on an idle map, 20s, three matched pairs:

| profiles nearby | before blocking | after blocking | before long tasks | after long tasks |
| --- | --- | --- | --- | --- |
| 19 | indistinguishable from noise (0-94ms either way) | | | |
| 475 | 200, 364, 264 ms | 27, 38, 41 ms | 19, 19, 21 | 2, 2, 2 |

At 19 nearby profiles the saving is real but unmeasurable against noise. At 475 it is about a 90%
reduction in blocking. The cost scales with **how many people are nearby**, not with pin count.

## 2. Panning at 243 pins is janky, and stage 1 only halves it

243 distinct seeded pins, six drags plus two zoom pairs:

| | before | after |
| --- | --- | --- |
| fps | 10.7 | 14.1 |
| long tasks | 388 | 347 |
| long-task total | 30.3 s | 23.1 s |
| blocking | 10.9 s | 5.7 s |
| longest task | 372 ms | 193 ms |

Better, and still bad. 14fps is not a smooth map.

## 3. The plan's stage 2 does not target this

Marker elements created during that entire pan: **16, both before and after.** The existing
per-marker diff at `MapView.tsx:3041` keeps markers alive across pans and zooms, so the per-pin
`createRoot` cost is paid at load, not while panning.

That matters, because the plan's stage 2 (one root plus portals) mainly removes N roots at mount.
It will not fix panning. The plan's priority ordering was written before these measurements and
should be revisited.

## 4. What the CPU profile actually says

Sampled during a throttled pan, top self time:

| share | frame |
| --- | --- |
| 66.5% | `(program)` — native style, layout, paint, composite |
| **19.6%** | **`getPointAtLength`** |
| 1.8% | `setAttribute` |
| 1.5% | `getBoundingClientRect` |
| 1.1% | `elementFromPoint` |
| 1.0% | `querySelectorAll` |
| 0.6% | `MapView.tsx:808` |
| 0.5% | `areInSameBuildingDisplayArea` |
| 0.3% | `applyPersonMarkerClusters` |

`JSON.stringify` does not appear at all. The whole-array signature at `MapView.tsx:2463`, which the
earlier plan called out as a headline cost, is not measurably hot at this scale.

### `getPointAtLength` is the largest JS cost, from two markers

`MileHighContrail` (`src/app/components/MileHighContrail.tsx:96-97`) runs a `requestAnimationFrame`
loop that calls `probe.getPointAtLength()` **twice per frame**, plus `setAttribute` twice on each of
18 bands. It renders per marker from `MapView.tsx:1780`, gated on `travellerActive`.

Measured on an idle map: **2 travelling markers, 222 `getPointAtLength` calls per second.** It never
pauses, and the cost is per travelling marker, independent of how many pins are on screen.

The probe path is static, so the geometry it recomputes every frame never changes.

**Decided: leave it alone.** Julien's call, 2026-09-19. Mile High Club is not to be touched for
performance. Recorded because anyone profiling this map will find the same 19.6% and propose the
same fix; it has already been raised and declined. Do not re-propose it.

### The other two thirds are native rendering

`(program)` at 66.5% is style, layout, paint and compositing, not JavaScript. 243 markers are live
in the DOM at once, each an SVG unit with gradients, and the heavier ones carry backdrop blur. No
JavaScript change reaches that. The levers there would be fewer live marker elements or cheaper
marker CSS, neither of which is in the current plan and both of which touch artwork.

## What this changes

- Stage 1 is worth keeping and is done.
- Stage 2 as written is aimed at mount cost, which the diff already makes rare. Its remaining
  justification is the duplicate-pin bug, which keying hosts by id does fix structurally.
- The largest addressable JS win found is `getPointAtLength`, and it is off the table by decision.
- The largest cost overall is native rendering of 243 live marker elements, which is not a React
  problem either.

---

## 5. The dominant cost is marker count, and most markers are invisible

Measured on the map at rest, 390x844:

| | |
| --- | --- |
| marker elements in the DOM | **243** |
| actually on screen | **54** |
| off screen | **189 (78%)** |
| DOM nodes inside all markers | 7,506 |

Person markers are only clipped to the viewport when `fitToMapMarkers` is true
(`MapHome.tsx:2700`), and that is false for any returning user, since it requires no stored
viewport, no known location, no mutual mode and no focused user (`:2688`). So in the normal case
every person within the 50 mile browse radius gets a live DOM element whether or not they are on
screen. Places are already clipped unconditionally at `:2762`; people are not.

The server returns up to **500 profiles, and the default is also 500**, so this is the designed
ceiling, not an edge case.

### What that costs, measured

Same pan, same throttle, changing only how many profiles the client receives:

| | 250 pins | 69 pins |
| --- | --- | --- |
| fps | 11.3 | **24.3** |
| long tasks | 358 | **16** |
| long-task total | 29.7 s | **1.0 s** |
| blocking | 11.8 s | **0.21 s** |
| longest task | 228 ms | 79 ms |

Roughly a 98% reduction in blocking, from marker count alone. That is larger than every other
effect measured in this document combined, including all of stage 1.

**Caveats, so this is not over-read:**

1. The test cut the profiles delivered, which also shrinks the clustering input. Real viewport
   culling would keep the data and only skip rendering, so the gain would be smaller than this.
2. `MapHome.tsx:2695` says the unclipped set is deliberate: clusters need neighbours just beyond
   the camera edge "so panning does not change their membership or center." A naive viewport
   filter would make cluster counts shift as you pan. Culling needs a buffer margin around the
   viewport, not a bare intersection test.
3. Nothing here has been implemented or verified. This is a sizing exercise.

### What this means for the plan

The DOM/React boundary work was aimed at the wrong thing. Marker count dominates, and most
markers are invisible. If any further performance work happens on this map, viewport culling of
person markers with a cluster-safe margin is the candidate worth costing, not stages 2-4.

There is no analytics to say how crowded a real user's map is: the PostHog project records only
`$pageview`, with no cruush product events in the last 30 days. Until the map is instrumented,
whether users hit 243 pins or 20 is unknown, and that determines whether any of this matters yet.
