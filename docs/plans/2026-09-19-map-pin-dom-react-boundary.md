# Implementation plan: move the DOM/React boundary for map pins

Status: **plan, awaiting sign-off**. No source changed yet.
Worktree: `/home/user/cruush-map-pin-boundary-20260919`
Branch: `claude/crush-performance-split-he27z3`
Base: `6f52a28`, confirmed live at `https://api.cruush.app/api/build` (`stage: production`) before this
worktree was cut.

The measurement this rests on is in `docs/plans/2026-09-17-map-render-split.md`. This file is the
how, not the why.

**Assumption:** this builds direction **B**, one React root with portals. If the plan you liked was
A (pins as pure hand-written DOM), the staging changes completely and I will rewrite it.

---

## The constraint

Performance only. No change to appearance, function or behaviour.

Everything below is held to that. One thing genuinely cannot be held to it in the literal sense,
and it is named in full under **What does change** rather than buried.

### What does not change

- **The rendered DOM.** Every pin produces byte-identical markup: same element, same class names,
  same `data-*` attributes, same `aria-label`, same subtree. Stage 4 makes that a checked
  assertion, not a claim.
- **Every interaction.** The shell keeps its hand-written DOM and all eleven native listeners
  exactly as written. Hover, focus, long-press with its move tolerance, contextmenu, click,
  spiderfy, cluster zoom: untouched code.
- **Ping and ghost expiry timing.** Same one-second observation granularity as today, to the tick.
  See 1a.
- **Visible countdowns.** `GhostRotationCountdown` keeps its own 1s interval at `MapView.tsx:1268`.
  It renders seconds to the screen and is not in scope.

### What does change

Removing `flushSync` is the change. That is not a side effect of the work, it is the work, and it
is a timing change by definition:

| | Today | After |
| --- | --- | --- |
| A pin's artwork on mount | Committed synchronously inside the creating task, blocking it | Committed on the next React flush |
| A hover preview | Committed synchronously, blocking the event handler | Committed on the next React flush (stage 3 only) |

In both cases the work lands before the next paint under any normal frame budget, so nothing should
be visible. But "nothing should be visible" is not "nothing changed", and I would rather say so now
than have it surface later. The before/after rendered check and the frame capture below exist to
hold that claim to account.

If even that is more than you want, **stages 1 and 2 stand without stage 3**, and stage 3 is the
only one that touches the hover path.

---

## The decision that keeps the diff small

The pin is already two halves that change for different reasons:

| Half | What it does | Where |
| --- | --- | --- |
| The shell | `document.createElement('button')`, class names, five `dataset` fields, `aria-label`, `title`, and eleven `addEventListener` calls covering hover, focus, long-press, move tolerance, contextmenu and click | `createMarkerElement`, `MapView.tsx:2054-2318` |
| The artwork | `MapMarkerPin` and everything under it | `MapView.tsx:1955`, rendered into the shell via `createRoot` |

**Only the artwork moves.**

That matters because the click and pointerdown handlers call `stopImmediatePropagation()`
(`MapView.tsx:2233`, `:2183`), which orders them against MapLibre's own native map listeners. React
synthetic handlers attach at the root container and would fire at a different point in that
ordering. Migrating the event layer would put the map-click filter, the long-press preview and
spiderfy at risk at once, for no gain: the listeners are not what costs anything.

---

## Stage 1: stop paying the cost, change nothing

Independent of the boundary. Ships first, on its own.

**1a. `MapHome.tsx:1390` — gate the tick instead of replacing it.**

An earlier draft of this plan proposed swapping the 1s interval for a deadline `setTimeout`. That
would have made pings expire at their exact deadline instead of within a second of it. Tighter, but
a behaviour change, so it is out.

Instead: keep the interval, keep the one-second granularity, and make the tick a no-op unless a
deadline was actually crossed. Every read of `mapPingClock` is a deadline predicate:

```
:1022-1023  user.displayExpiresAtMs <= / > mapPingClock
:2653       Date.parse(ping.expiresAt) > mapPingClock
:2663       user.activePing.expiresAt > mapPingClock
:2762,:2797 mapPingStatus.activePing.expiresAt > mapPingClock
```

Nothing formats it for display. So every one of those predicates can only flip when `now` crosses
one of the deadlines in that set. The tick becomes:

```ts
const next = Date.now();
if (deadlines.some((d) => prev < d && d <= next)) setMapPingClock(next);
```

Same interval, same granularity, same predicate results on every tick, provably. The difference is
that the other fifty-nine ticks a minute stop rebuilding every marker, re-clustering, and
re-serialising the array.

**1b. `MapHome.tsx:3010` — memoise the props at the `<MapView>` call site.**

`useMemo` the objects (`browseArea`, `focusArea`, `focusCoordinates`, `initialViewport`,
`radiusCircle`, `ghostLeash`) and `useCallback` the inline `onMapClick`. Same values, fewer
identities. Stops `renderedMarkers` re-clustering and the ghost-radius geojson rebuilding on every
unrelated MapHome state change, down to a keystroke in the city-request input.

Neither touches rendered output. Stage 1 alone should be most of the win.

## Stage 2: the boundary move

**2a. `RenderedMapMarker` (`:629`)** — drop the `root` field.

**2b. `createMarkerElement` (`:2054`)** — remove `createRoot` (`:2085`), the `renderMarker` helper
(`:2101-2105`) and its call at `:2311`. Keep the element, every listener, and `setPreviewed`'s
imperative half: `element.dataset.markerPreviewed`, the `zIndex` swap, `aria-pressed`
(`:2106-2126`).

**2c. MapView holds the hosts**, keyed by id:

```ts
type PinHost = { id: string; marker: MapMarker; element: HTMLElement; previewed: boolean };
const [pinHosts, setPinHosts] = useState<Map<string, PinHost>>(() => new Map());
```

The marker sync effect (`:3041`) writes this map instead of calling into a per-pin root. **Keyed by
id, a Map cannot hold the same pin twice.** That is the structural reason this also closes the
duplicate-pin bug currently red on `main`, where `Open Nearby Ghost on map` resolves to two
elements carrying the same `data-map-marker-id`.

**2d. MapView renders them**, inside the existing return (`:3223`):

```tsx
{Array.from(pinHosts.values()).map((host) => createPortal(
  <MapMarkerPin marker={host.marker} previewed={host.previewed} />,
  host.element,
  host.id,
))}
```

**2e. `cleanupRenderedMarker` (`:2378`)** — delete the host so React unmounts that portal, then
`marker.remove()` as now. The deferred `queueMicrotask(() => root.unmount())` goes with the root.

## Stage 3 (optional): preview becomes React state

`setPreviewed` does its imperative half, then flips `previewed` on that one host, with
`MapMarkerPin` memoised. A hover then re-renders one pin instead of committing a root
synchronously.

This is the only stage that touches the hover path, and the only one where a frame of difference
could in principle be seen. **Drop it if you want the hover path untouched**; stages 1, 2 and 4
stand alone and keep almost all of the gain.

## Stage 4: prove the output is identical

Two assertions, not prose.

**4a. No roots left.** `createRoot` and `flushSync` should have no callers in `src/app` outside
`src/main.tsx`:

```
grep -rn "createRoot\|flushSync" src/app --include=*.tsx --include=*.ts
```

**4b. DOM equivalence.** Render the map against a fixed marker set covering every `MapMarkerPin`
branch (person, person cluster, venue cluster, place, event, ghost, ping-active, spiderfied), on
`6f52a28` and on the branch, and diff each marker element's `outerHTML`. Identical output is the
whole requirement, so it should be a check rather than a promise.

Per L1 this is new scaffolding during what is not a bug fix, so it is yours to keep or bin once the
change lands. I would keep it: it is the thing that answers "did the appearance change".

---

## Risks, and how each is checked

| Risk | Why it might bite | Check |
| --- | --- | --- |
| Pin content arrives a tick later than the container | `flushSync` currently fills the element before MapLibre gets it | The shell carries explicit `h-[128px] w-[103px]` and MapLibre positions by transform on the container, so content timing should not move a pin. Measure pin centres before and after at 375 and 1280. |
| Unmount ordering against `marker.remove()` | This is where the duplicate-pin bug already lives | Pan and zoom hard, then assert every `data-map-marker-id` on the page is unique. |
| Portal event bubbling | React events bubble along the React tree, not the DOM | The map-click filter at `:2049` uses `closest()`, which is DOM-based, and the pin's listeners stay native. Verify rather than assume: click a pin, click the map. |
| Cluster and spiderfy pins | Same `MapMarkerPin` switch | Covered by 4b and the existing cluster tests. |

## Verification

Targeted, per L4:

```
pnpm vitest run src/app/components/MapView.test.tsx src/app/components/MapHome.test.tsx
```

74 + 82 tests over the two files being changed. Then:

- `pnpm check:layout` at 375 / 768 / 1280 for D1-D7.
- `vite build`.
- `session-interactions.spec.ts` and `e2e/map-ping.spec.ts`, the two specs that touch marker DOM.
  That regression spec is **already red on `main`**, so the bar is "nothing red here that is not
  red on `6f52a28`", compared run to run, not all green.
- Rendered before and after per B1/B2: 375px mobile and desktop, uncropped. Plus a frame capture of
  a hover and of a pan, which is where a timing difference would show if it shows anywhere.
- A React Profiler commit count for one idle minute on the map, before and after. That number is
  the point of the exercise.

## If it goes wrong

Each stage is its own commit and reverts alone. Stage 1 is independent of 2-4. Stage 2 is the only
one that changes how pins reach the screen; if 4b disagrees, revert that commit rather than patch
forward.

## Not in scope

No product, design or behaviour change. No deletions. No map style, label sizing or canvas filter
work (C5). No new dependency. No environment variables. `LocalFeed` and `DirectMessages` carry the
same shape of problem and are not touched here.
