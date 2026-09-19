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
