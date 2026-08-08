# cruush — per-item execution plans

**Version 1.0 · 2026-08-06**
Companion to `docs/plans/cruush-spec.md` v2.2. One plan per item in the
specification's Part XI execution order.

---

## What this document is

The specification says *what* is true and *what* must hold. This document says
*how each outstanding item gets done*: the files it touches, the edits in order,
the tests that move with them, and the evidence each one owes before it can be
called complete.

Nothing here has been implemented. No code was changed to produce it.

**Three things to know before reading further.**

1. **Where the work happens.** Every front-end item below belongs in the
   worktree `/Volumes/corrupt/Cruushv2-1.worktrees/landing-page-liquid-glass-antigravity`
   on branch `feature/landing-page-liquid-glass-antigravity`. The primary
   checkout `/Volumes/corrupt/Cruushv2-1` is on
   `feature/moderation-dashboard-full-access` with 99 modified files and is
   being used by other sessions — R8 forbids a second agent writing there. Only
   this planning document and the specification itself live in the primary
   checkout.

2. **Line numbers are a guide.** The specification's own provenance note applies
   here: values quoted with a `path:line` citation were read from the working
   tree at the time the specification was written, and the tree has moved since.
   Spot-check before relying on one for a decision. Where a plan step depends on
   a line number, it names the symbol as well, so the symbol is what to grep for.

3. **The two spec copies have been reconciled in one direction only.** The
   primary checkout's copy is now v2.2: v2.1's runtime-integrity gate (R14) plus
   the SQL-migration rule and z-index scale ported back from v2.0 as R15 and R16.
   The worktree's copy is still v2.0 and is now stale in both directions. It must
   be overwritten from the primary checkout before any work starts there, or the
   next session reads a specification that is missing four rules.

## What is executable today, and what is gated

The user is deciding the glass style. That decision gates four items and nothing
else. Stated plainly so the gate is not applied more widely than it earns:

| Gated on the glass-style decision | Executable now |
| --- | --- |
| 2 — the `backdrop-filter` blocker | 0 — the three red tests |
| 3 — zoom displacement on the dock | 1 — dead controls |
| 5 — the glass roll-out | 4 — top navigation |
| 6 — heart pins as one surface | 7 — ghost mode (plan only) |
| | 8 — landing copy, colour, Turnstile |
| | 9 — onboarding over the landing background |
| | 10 — application logic (server) |
| | 11 — merges from `main` |
| | 12 — logo re-render |

The gate is real, not procedural. Item 2 exists to find out whether a
per-element displacement lens can run as `backdrop-filter` at all. If the chosen
style is a CSS-only frost, item 2 is not blocked — it is **cancelled**, and items
3, 5 and 6 change shape completely. Spending a day on E1 before that choice is
made is a day that a single sentence could have saved.

**The decision, put as three concrete options.** Each is a real state the code
can reach; the specification's Part II §7 decision table is the source.

| Option | What ships | Cost | Risk |
| --- | --- | --- | --- |
| **A — Freeze where it is.** Bitmap presets on the dock and the nav bubble, dark plates everywhere else, the heart preset on pins. | Nothing new. Items 2, 3, 5, 6 close as "no change". | Zero. | The pins keep their clear 0→2.7-unit gap and the outward neon; Part IV §8's target design is abandoned. |
| **B — Presets everywhere, matched by size.** Keep implementation A, author one preset per surface size so no preset is stretched. | Days. One preset per distinct box, and a rule that a surface may not use a preset whose aspect ratio it does not match. | Every new surface size needs a new preset; the stretch-and-smear failure (regression 8) returns the moment someone reuses one. |
| **C — Per-element generated maps.** Wire implementation B (`liquidGlass.ts` + `LiquidGlassSurface.tsx`), which builds the map at the element's own pixel size. | Item 2 first, then a week. Both files are untracked, unimported, untested, and carry two known defects. | If E1/E2/E3 all refute, `backdrop-filter` cannot host it and the whole option collapses to fallback 1 or 2 in Part III §9.5. |

Option C is the only one that solves the sizing problem structurally. It is also
the only one that can fail outright. That is the trade being decided.

---

# Item 0 — The three red tests

**Not in the specification's execution order.** It is placed first because the
definition of done requires a green suite, so every item below inherits these
three failures until they are cleared. Fifteen minutes of work, and it removes
the standing invitation to "fix" a red suite by reverting correct code.

### Ask

Make the three known-failing assertions describe the behaviour the code actually
ships, per the rule in Part IX §37.3: assert the contract, not the declaration.

### Files

- `src/styles/theme.test.ts`
- `src/app/components/LiquidGlassFilters.test.tsx`
- `src/app/components/MapView.test.tsx`
- `src/app/components/Auth.test.tsx`

### Steps

1. **`theme.test.ts:53`** asserts `--cruush-glass-backdrop: url("#cruush-liquid-glass-dock") brightness(1.12) saturate(0.9);`.
   `theme.css` now sets that token to `var(--cruush-glass-plate-backdrop)` and
   keeps the lens on `--cruush-glass-dock-backdrop`. Lines 51-53 currently assert
   two mutually exclusive values for the same property. Delete the stale
   assertion and replace it with the contract: *the dock token resolves to a
   `url(#…)` lens; the general-surface token resolves to the plate*. Add the
   block-scoping rule from Part II §9 — a token assertion must name the block it
   lives in, because both `:root` and the `@supports` block declare
   `--cruush-glass-backdrop` and a raw `toContain` cannot tell them apart.
2. **`LiquidGlassFilters.test.tsx:41-42`** expects `scale="-170"` and `"-160"` on
   the green and blue channels, from the CodePen reference's `g 10 / b 20`
   offsets. `BASE` sets both offsets to 0 deliberately (the rainbow was
   rejected). Change both expectations to `-180` and rewrite the comment at
   line 39 to record the decision rather than the pen.
3. **`MapView.test.tsx:683`** still locks `heatmap-radius` at the pre-change
   ramp `[10, 34, 14, 68, 16, 96]`. The authorised value is
   `[10, 18, 14, 34, 16, 48]`. Update the lock. This is an authorised map change
   whose assertion never moved with it — see Part V §13.2.
4. **`Auth.test.tsx:524`** is the opposite defect: it matches
   `min-height: var(--cruush-captcha-slot, 65px)` as a bare substring, which now
   appears inside the `active` rule, so it passes for the opposite of what it was
   written to check. Re-scope it to assert the substring appears **only** within
   the `[data-captcha-state='active']` rule, and that the base rule carries
   `min-height: 0`.

Each of the four is a separate edit with its own comment explaining why the
expectation changed (definition of done, clause 3).

### Evidence

`npx vitest run src/styles/theme.test.ts src/app/components/LiquidGlassFilters.test.tsx src/app/components/MapView.test.tsx src/app/components/Auth.test.tsx`
green, with the before/after counts quoted. Do not pass `--reporter=basic`;
vitest 4.1.8 has no such reporter and dies at startup.

### Not in scope

Any change to `theme.css`, `LiquidGlassFilters.tsx`, `MapView.tsx` or `Auth.css`.
This item moves assertions only. If a test cannot be made to pass without
touching source, that is a finding to report, not a licence to edit.

---

# Item 1 — Seeking filter menus and any other dead control

### Ask

Every menu and sheet opens and commits state; a regression test guards the
overlay class of bug.

### Status going in

The root cause is known and the guard is already in the tree: an unlayered
`position: relative` in `theme.css` outranked Tailwind's utility layer and beat
`.fixed` on portalled Radix surfaces, so sheets laid out below the fold while
their full-screen overlay stayed put and ate every click. The `:not(...)`
exclusion list at `theme.css:834-867` is the fix. What does **not** exist is the
test: `glassOverlayRegression.test.ts` is referenced in prose and nowhere in
`src/`.

So this item is one verification pass and one new test, not a bug hunt — unless
the verification pass finds a control still dead, in which case the diagnosis
starts at `document.elementFromPoint`, not at the handler.

### Files

- `src/styles/theme.css` — read only, unless a control is still dead
- `src/app/lib/glassOverlayRegression.test.ts` — new
- `src/app/components/MapHome.tsx` — read only, to enumerate the controls

### Steps

1. **Drive each control in a real browser and record the result.** The four from
   regression 1, plus any other portalled surface on the map:
   SEEKING/MUTUALS (`MapHome.tsx:1951`), VISIBILITY (`MapHome.tsx:1964`), DL
   mode, feed settings. For each: click it, confirm the surface appears in the
   viewport, change a value, confirm the change commits and survives a reload.
   Per Part I §3.4, confirm the *state changed* — a handler that fires is not a
   control that works.
2. **For any control that does not open,** call
   `document.elementFromPoint(x, y)` at the click location before touching the
   handler. If it returns an overlay rather than the control, the cause is
   stacking, and the fix belongs in the `:not(...)` list, not in the component.
3. **Write `glassOverlayRegression.test.ts`** to the four requirements in Part IX
   §37.4: read `theme.css` as text; extract every rule whose selector matches a
   portalled `[data-slot]` surface (`sheet-content`, `dialog-content`,
   `drawer-content`, `popover-content`, `select-content`,
   `dropdown-menu-content`, `dropdown-menu-sub-content`); assert none declares
   `position` at any value, nor `inset`/`top`/`left`/`right`/`bottom`; assert the
   same for any rule outside `@layer`.
4. **Record the ceiling in the test file's own comment.** jsdom cannot confirm
   the surface paints in the viewport. The test proves the cause is absent, not
   the effect present. Without that comment, a future session will believe the
   test covers more than it does.

### Evidence

A per-control table: control, opened yes/no, state committed yes/no, survived
reload yes/no. Plus the new test passing. Behaviour evidence is browser-driven
(Part I §3.4); a jsdom render is not acceptable here.

### Not in scope

Restyling any of the four controls. Item 4 covers the rail's geometry; this item
covers whether the controls work.

---

# Item 2 — The `backdrop-filter` blocker

**Gated on the glass-style decision. Cancelled outright if the answer is option A
or B.**

### Ask

Determine why the generated displacement graph renders as `filter` and not as
`backdrop-filter`, by running experiments E1, E2 and E3 in that order, changing
one variable at a time.

### Files

- `src/app/components/BottomNav.tsx` — E0 call site
- `src/styles/theme.css` — E0 CSS consumer, inside the existing `@supports` block
- `src/app/components/LiquidGlassSurface.tsx` — E1, E3
- `src/app/components/LiquidGlassFilters.tsx` — E1 portal target
- `src/app/lib/liquidGlass.ts` — E2

### Steps

**E0 — precondition, run once.** Import `LiquidGlassSurface` into
`BottomNav.tsx`, pass the dock pill element (`BottomNav.tsx:84`) as `target`, set
`zoom={0.6}`, and add inside the existing `@supports` block:

```css
.cruush-liquid-glass-dock {
  backdrop-filter: var(--cruush-liquid-glass-filter, var(--cruush-glass-dock-backdrop));
}
```

The `var()` fallback is mandatory. An undefined custom property makes the whole
declaration invalid at computed-value time, which resolves `backdrop-filter` to
`none` and silently strips the dock's existing frost — a regression
indistinguishable from the bug under study.

**E1 — placement.** Lift the `<filter>` out of `LiquidGlassSurface`'s own `<svg>`
and portal it, via `createPortal`, into the root `<svg>` that `LiquidGlassFilters`
renders. Every attribute byte-identical. This is the most likely cause: a
`backdrop-filter` element becomes a backdrop root, and `position: fixed` on
`.cruush-liquid-glass-filters` anchors the definition `<svg>` inside the very
element being filtered. Requires an id registry on `LiquidGlassFilters` and
resolves the duplicate-mount problem as a side effect. Roughly an hour.

**E2 — primitive count.** Sum the zoom and bezel offset fields inside
`createLiquidGlassMap` before the 128-centred encode, and emit one `feImage` plus
one `feDisplacementMap` instead of two of each. The summed field must be
renormalised against a single `maximumDisplacement` or the encoded fractions clip
at 0 and 255 and the map goes flat at the rim. Half a day.

**E3 — filter region.** Delete `x`, `y`, `width`, `height` from the `<filter>`
element **in the source file**. Not from the console — R4 exists because exactly
this was done live and left a visibly broken dock on screen. Minutes, but only
meaningful after E1.

**Fix the two known defects while the file is open only if the experiment
requires it, and say so.** The returned `scale` is off by 2× (`feDisplacementMap`
displaces by `scale × (channel/255 − 0.5)`, peak 255 gives `scale × 0.5`, but the
doc comment calls the returned figure the peak in pixels), and the zoom map's
sign is inverted (`dx > 0` on the right half with a positive scale samples away
from centre, which minifies where the comment says magnify). Both will corrupt an
experiment's reading if left. Neither is authorised by the experiment itself, so
each is a separate reported edit.

**Swap channel selectors with any map swap.** The presets read
`xChannelSelector="R" yChannelSelector="B"`; the generated maps write dy to G and
a constant 128 to B. Feeding a generated map into a preset-shaped graph without
changing the selector reads a flat 128 and produces zero vertical displacement —
a false negative.

### Evidence

All four proofs from Part III §9.4, no exceptions:

1. A structured backdrop under the surface — the map's streets, or an injected
   8px checkerboard. Over a flat panel a lens warps nothing visible, so absence
   of warp proves nothing.
2. A screenshot showing a straight line crossing the surface rim with a lateral
   break.
3. An A/B pair at the same scroll position, filter present versus
   `backdrop-filter: none`, visibly different at the rim.
4. A forced repaint (toggle `opacity` on the target) between applying the change
   and capturing. The generated map is a PNG data URI and decodes
   asynchronously; without the repaint a genuine fix reads as a failure on first
   paint.

At `zoom={0.6}` on a 368px dock the predicted break is ~110px. Under 5px is
refuted, not "subtle".

### Not in scope

Rolling the result out to any other surface. E0's call site is one surface, by
R7, and it is reverted or promoted as a separate decision.

---

# Item 3 — Zoom displacement on the dock

**Gated on item 2 and on the glass-style decision.**

### Ask

Apply zoom displacement to the dock, one surface only, and confirm it by
screenshot before anything else moves.

### Steps

1. If item 2 confirmed via E1/E2/E3, promote the E0 call site from experiment to
   implementation: keep the portal, keep the `var()` fallback, set `zoom` to a
   value chosen and stated (start at the component default of `0.18`, not the
   experiment's `0.6`, which was deliberately exaggerated to make a refutation
   unambiguous).
2. Screenshot over the map at rest.
3. Stop. Nothing else takes the treatment until the screenshot is agreed. This is
   R7, and it exists because a simultaneous roll-out across every surface produced
   several rounds of "it looks worse" with no way to isolate the cause.

### Evidence

The same four proofs as item 2, plus the stated `zoom` value and the reason for
it. Colour claims are not made from the screenshot (Part I §3.3) — if the
question is whether the dock reads warm, the answer is `saturate()` at or below 1
by construction, not an opinion about a PNG.

### Not in scope

Every other glass surface. That is item 5, and it does not start until this
screenshot is agreed.

---

# Item 4 — Top navigation

Four independent changes that happen to live on the same surface. Under R12 they
are four edits and four reported results, not one commit called "top nav".

### 4a — Rail geometry: tokens and a reserved badge slot

**Ask.** The rail's top offset and the gaps between its three controls come from
two custom properties, not from literal Tailwind values repeated per child; the
badge's slot is reserved whether or not the badge renders.

**Files.** `src/app/components/MapHome.tsx`, `src/styles/theme.css`,
`src/app/components/MapHome.test.tsx`.

**Steps.**

1. Introduce `--map-rail-top` and `--map-rail-gap` on the rail element
   (`MapHome.tsx:1932`). Replace `top-[4.5rem]` / `sm:top-[4.75rem]` and the
   per-child gap classes with reads of the tokens.
2. Reserve the badge's slot with a `min-height` on the rail's first row, so
   SEEKING and VISIBILITY do not jump down by badge-height-plus-one-gap the
   moment a crowd mode goes active. Today the badge is conditional
   (`MapHome.tsx:1936`, rendered only when `activeCrowdNotice` is truthy), and the
   two buttons visibly move under the user's finger.
3. Rewrite `MapHome.test.tsx:820`. It currently asserts the literal strings
   `'right-3'`, `'top-[4.5rem]'`, `'sm:right-4'`, `'sm:top-[4.75rem]'` — it pins
   the hardcoded values in place and fails the moment the token lands. Assert
   instead that the token is present on the rail. The *equal-gaps* half of the
   contract cannot be asserted in jsdom at all (no box model), so it is a browser
   measurement, recorded as such in Part IX §37.5 item 7.

**Evidence.** `getBoundingClientRect` on all three controls, in both states —
badge present and badge absent — reporting: badge→SEEKING gap, SEEKING→VISIBILITY
gap, and the vertical positions of SEEKING and VISIBILITY across the two states.
The contract is that the two gaps are equal and that SEEKING does not move.

### 4b — Size increase

**Ask.** Make the rail controls bigger. No magnitude was given.

Under R3's corollary, the smallest change that satisfies the ask, stated so it
can be adjusted: pill height `h-8` (2rem) → `2.25rem`, label `text-[11px]` →
`text-[12px]`, horizontal padding `px-4` → `px-[1.15rem]`, badge matched to the
pills. Roughly +12.5%, expressed as one step so it moves in one place.

**Show it before applying it more widely.** Do **not** apply the increase to the
`size-8 sm:size-9` icon buttons in `map-top-actions` (`MapHome.tsx:1599`, `1611`,
`1623`, `1633`, `1648`): they are already at the edge of the header bar's
`p-0.5 sm:p-1` padding, and enlarging them pushes the bar past the logo column.

**Evidence.** Before/after `getBoundingClientRect` on the pills, plus the
adjacent geometry — the header bar's own box and the logo column's left edge —
because R11 makes side effects part of scope.

### 4c — Corner logo removed

**Ask.** Remove the corner logo.

**This one is ambiguous and must be settled before any edit.** There are two
logos and the request names neither unambiguously:

- the **map corner mark**, `cruush-logo.svg` masked into glass
  (`MapHome.tsx:1557-1570`, `logoGlassMaskStyle` at `MapHome.tsx:65`, styling at
  `theme.css:1218-1265`) — a static SVG, not a video;
- the **landing teaser logo**, `/teasers/cruush-logo-login-alpha-desktop.webm`
  (`LaunchLoginMapTeaser.tsx:13`) — the spinning video.

Plan: screenshot both surfaces, ask which one, then remove the named one.
Do not delete either asset in the same change — remove the render, keep the file,
so reinstating is a one-line revert.

### 4d — Bug button takes the app's glass

**Ask.** The bug button uses the app's glass material.

**Files.** `src/app/components/AlphaBugButton.tsx`,
`src/app/components/AlphaBugButton.test.tsx`.

**Steps.** Replace the hand-rolled `bg-background/88 … backdrop-blur-md`
(`AlphaBugButton.tsx:252`) with the appropriate `cruush-glass-*` class. A
hand-rolled blur diverges from the dock material the moment the glass tokens
change, and the button starts reading as a different app.

**Watch the placement fallback.** On the map the button is portalled into the
header slot (`registerBugButtonSlot`, `src/app/lib/bugButtonSlot.ts`, slot at
`MapHome.tsx:1652`), so it is a sibling of the other header controls. Off the map
it falls back to fixed placement computed at `AlphaBugButton.tsx:43-49`, whose
comment records the three overlays it must clear: the header row, the
zoom/locate stack, and the Recently Active panel. A material change must not move
it; `src/app/lib/overlaySlots.smoke.test.ts` mirrors its Tailwind position
classes by substring and will fail if they drift.

**Evidence.** Screenshot on the map and off it; `overlaySlots.smoke.test.ts`
green; the button's `getBoundingClientRect` unchanged in both placements.

---

# Item 5 — Glass roll-out

**Gated on item 3's screenshot being agreed, and on the glass-style decision.**

### Ask

Roll the agreed treatment out to the remaining surfaces, in the order given in
Part II, screenshotting each.

### Steps

Per surface, in order, one at a time: apply, screenshot over a structured
backdrop, report, move on. The decision table in Part II §7 sets which
implementation each surface takes — and the roll-out does not override it. In
particular, **panels, sheets, lists and inputs keep the plate tokens**. Flat
backdrops give a lens nothing to bend, so it only warps text and edges; that is
the whole reason `theme.css:512-518` moved off-map surfaces to
`--cruush-glass-plate-backdrop` while the dock kept the lens.

Two rules that will otherwise be rediscovered the hard way:

- **Nested glass double-applies the backdrop.** An inner surface takes a lighter
  treatment or none. Two instances are already enforced — the Activity header's
  count tiles (`theme.css:535-539`) and the nav bubble's `::after`
  (`theme.css:788-794`).
- **A shared preset is only honest on an element whose aspect ratio and corner
  radius match it.** Violating this is regression 8, and it presents as fog or a
  tan cast, not as a wrong-looking lens — which is why it was originally
  misdiagnosed as "too much blur".

### Evidence

One screenshot per surface over a structured backdrop, plus the A/B pair for any
surface where the effect is subtle. `git diff` read line by line before each
report (Part I §3.5).

### Not in scope

The map tiles, under any justification. R1 and Part V §13.1 enumerate the
boundary by symbol. Note the naming trap: `.cruush-map-3d-toggle`,
`.cruush-map-heatmap-toggle` and `.cruush-map-logo-*` are chrome *over* the map
and are ordinary glass surfaces. The boundary is the descendant selector
`.cruush-map …` and the shell selector `.cruush-map-shell`, not the string
prefix.

---

# Item 6 — Heart pins as one surface with inward neon

**Gated on item 3 and on the glass-style decision. The hardest surface, so it goes
last in the roll-out.**

### Ask

One continuous glass surface rather than a band plus a separate rim; neon biased
inward, brightest where it meets the photo, fading to nothing before the outer
rim.

### Files

`src/app/lib/heartPin.ts`, `src/app/components/MapView.tsx`,
`src/styles/theme.css`, `src/app/components/LiquidGlassFilters.tsx`,
`src/app/components/MapView.test.tsx`.

### The two geometry facts that decide the implementation

1. **The band already exists inside the silhouette.** `heartOutlineMask` uses
   `fill="none"` on both strokes, so the 14-unit white stroke covers 7 units
   *inside* the path as well as outside, and the 5.4-unit black stroke knocks out
   only ±2.7. The band therefore already runs from 2.7 to 7 units inside; it is
   invisible solely because the SVG's gradient base and photo are opaque and
   stack above it. Closing the 0→2.7 gap is a question of what covers the inner
   strip, not of generating new geometry.
2. **The mask must stay centred on the path.** A uniformly scaled copy of the
   heart produces a band 26% thinner at the bottom point, because the flanks
   leave the point nearly parallel to the radius (cos θ = 0.737 against 0.946 at
   the left extreme). That is recorded failure (d), and it is why the
   pseudo-element is `inset: 0` and never scaled.

### Steps

1. **Close the inner gap.** Reduce the black knock-out stroke so the band reaches
   the photo edge, or make the artwork's own edge the band's inner boundary. Watch
   the clearance arithmetic: `.cruush-heart-glass-base` carries
   `vector-effect: non-scaling-stroke`, so any stroke wider than 4.06px at the
   48px `HeartPin.tsx` size buries the border under the glass.
2. **Rebuild the neon inward.** Today's gel sits 3.4→6 units *outward* of the
   silhouette and never touches the photo. The model is the sign-in button's gel
   (`Auth.css:403-419`): `inset: 0.18rem`, `filter: blur(0.26rem) saturate(2.1)
   brightness(1.35)`, opacity 1. The lesson transfers directly — blur kills neon
   by spreading the same light over more area, so keep the blur tight and let
   `saturate` carry the intensity.
3. **Keep the neon rect's fill a solid `markerTheme.border`.** Not
   `url(#gradientId)`: a gradient paint server referenced from a masked full-box
   rect resolves in the gradient's own user space, not the mask's, so the colour
   does not track the band — and at `opacity="0.3"` behind a blurred mask the
   three stops average to mud. The concrete failure is a gel that reads grey-brown
   on the mutual theme instead of purple.
4. **Add zoom displacement.** `HEART_FILTER` is a single static definition with
   no zoom dimension. Whether a per-zoom filter is affordable at party density is
   **unverified**; instrument `createMarkerElement` with a frame-time trace at 40+
   visible markers across a pinch-zoom before committing to it. Filters and maps
   must be cached and shared by their full parameter tuple — minting a `feImage`
   data URI per marker is one SVG decode per pin.
5. **Move `theme.css:1195` inside the `@supports` guard.** The pin's
   `backdrop-filter: url("#cruush-liquid-glass-heart")` currently sits outside it
   over `background: transparent`, so on Safari and Firefox the declaration is
   discarded and the band renders as nothing at all. Give the unguarded path the
   same `rgba(255, 255, 255, 0.14)` fill the reduced-transparency rule uses. No
   test catches this today.

### Evidence

Screenshots at rest **and hovered** — R9, and the recorded failure it prevents is
the "You" tag reported fixed twice from resting-state measurements. Measure the
band thickness at four points around the silhouette (left extreme, top lobe,
right extreme, bottom point) and report the four numbers; even thickness is the
acceptance criterion and the bottom point is where it has failed before. Colours
asserted by `data-marker-theme` attribute, not by hex sampled from a screenshot.

### Not in scope

The photoless fallback gradient. `getProfileGradientStops` is main's behaviour,
restored deliberately, asserted at `MapView.test.tsx:249-251`, and is where the
greens, yellows and teals come from. Do not "fix" it to the relationship colour.

---

# Item 7 — Ghost mode

**Plan-first protocol. No ghost-mode code is touched before approval.**

### Ask

Change the ghost-mode rim, and remove the grey bubble from the selected state so
it appears on hover only.

### Steps, strictly in order

1. Read `src/app/components/GhostModeSettings.tsx` (260 lines) and locate the rim
   treatment and the jump animation.
2. **Record the existing jump animation and send it before anything else.**
   Verified state: there is no keyframe animation in `GhostModeSettings.tsx` and
   no `ghost` rule in `theme.css`. The only motion in the component is the Radix
   switch thumb — `transition-transform` with
   `data-[state=checked]:translate-x-[calc(100%-2px)]`
   (`src/app/components/ui/switch.tsx:24-26`). **Unverified:** whether "the jump
   animation" means a marker animation elsewhere. Settle it by grepping the ghost
   pin path in `MapView.tsx` (the ghost halo test id is at `MapView.tsx:1163`) and
   screenshotting a ghosted pin.
3. Screenshot the current rim. Three rims are in play: the header
   (`border-b border-border bg-card/80 backdrop-blur-sm`,
   `GhostModeSettings.tsx:102`), the card
   (`rounded-2xl border border-border bg-card`, `:116`), and the radius block
   (`border border-white/10 bg-white/[0.025]`, `:145`).
4. Propose two or three concrete rim options **with values, not adjectives**.
5. Only then implement.

### The bubble change

The grey bubble is `bg-white/10 ring-1 ring-white/15`, applied when
`privacySettings.ghostModeEnabled` (`MapHome.tsx:1610-1613`); the hover state on
the same button is already `hover:bg-white/10` (`MapHome.tsx:1611`). Removing the
selected-state bubble without changing hover leaves the active ghost button with
**no** hover affordance — hover and selected then paint identically and the
control looks dead. So the selected state needs a different marker: a rim, a
neon, or a colour on the icon. That choice goes in the same proposal as the rim
options.

### Evidence

Screenshots of each proposed option before implementation; after implementation,
screenshots of all four states — resting inactive, hovered inactive, resting
active, hovered active. Four states because that is where this control fails.

---

# Item 8 — Landing: colour, copy, and the Turnstile popup

Three separate asks. Three edits, three reports (R12).

### 8a — `NYC OPEN BETA` colour

**Ask.** Make the `NYC OPEN BETA` text colour match the sign-up capsule's label.

**Files.** `src/app/components/Auth.tsx`, `src/app/components/Auth.css`.

The capsule's label carries `font-weight: 700`, a colour and a text-shadow at
`Auth.css:620-625`. Take the colour from there rather than re-authoring one, so
the two cannot drift. Note the copy rule: everything on this page is lowercase
**except** `NYC OPEN BETA` — this edit changes the colour, not the case.

**Evidence.** Screenshot, plus the computed colour of both elements reported as
equal strings. This is a colour *equality* claim between two elements on one
screen, which is verifiable; it is not a claim about hue, which is not
(Part I §3.3).

### 8b — Footer legal links to lowercase

**Ask.** Lowercase the footer legal links.

**Files.** `src/app/components/Auth.tsx` (link text), possibly
`AUTH_POLICY_LINKS`.

Change the strings, not `text-transform` — the rest of the page's lowercase is
authored copy, and a CSS transform would make this one line behave differently
from every other. `src/test/releaseSmokeAndE2E.test.tsx` asserts
`/billing-policy` is excluded from `AUTH_POLICY_LINKS`; check that assertion
still matches after the edit.

**Evidence.** Screenshot of the footer; the desktop `≥ 60rem` `nowrap` state
checked too, since the links are `flex-wrap: wrap` below that and `nowrap` above.

### 8c — Turnstile as a floating popup

**Ask.** Turnstile renders as a floating popup in a glass capsule with an X in the
corner, rather than inline.

**Files.** `src/app/components/Auth.tsx`, `src/app/components/Auth.css`,
`src/app/components/Auth.test.tsx`.

**Steps.**

1. Switch the widget to Cloudflare's `appearance: 'interaction-only'` with
   `execute` mode. That is the mechanism: the widget takes zero space and renders
   only when a challenge is actually needed.
2. Remove the inline slot entirely — it is what currently sits between the
   password field and the button.
3. Build the popup as a glass capsule with a close control.
4. **Rework the reserve.** The shell carries `data-captcha-slot="reserved"`
   whenever a site key exists (`Auth.tsx:479`), which swaps the fallback reserve
   from `21.4rem` to `26.2rem`. With no inline slot there is nothing to reserve,
   so that swap must go — otherwise the logo band pays for height the form no
   longer uses.
5. **Update the tests that encode the inline slot.** `Auth.test.tsx:115-152`
   asserts the five-element order including the captcha slot, and `:524` asserts
   the slot's min-height rules. Both describe a slot that will no longer exist.
   Rewrite them to the new contract and comment why the expectation changed.

**Evidence.** Measure the full stack in every state R10 names — sign-in, sign-up,
forgot, captcha present, error shown — and report: overlap none, page scroll
none, footer flush. The failing states are the short window with the error capsule
and the captcha both present; "it fits on my window" is not verification.
Restore the viewport before the turn ends (R11).

**Local testing** uses Cloudflare's published dummy site keys, which always pass.
They are development-only and must never reach a production environment file.

---

# Item 9 — Onboarding over the landing background

### Ask

The onboarding rites render over the landing background in glass popups until the
user enters the map, and the progress bar takes the neon treatment.

### Files

`src/app/App.tsx`, `src/app/components/ProfileOnboarding.tsx`,
`src/styles/theme.css`.

### Steps

1. **Keep the landing background mounted for the whole onboarding branch.**
   `App.tsx` renders onboarding as `path="*"` inside its own router
   (`App.tsx:280-303`), so the background must live **above** `<Routes>`, not
   inside the step component. Only `handleOnboardingComplete` unmounts the
   landing and mounts the map.
2. **Drop the opaque body fill.** `ProfileOnboarding` currently paints
   `min-h-screen … bg-[#050505] p-4` with a `bg-black/82 backdrop-blur` card
   (`ProfileOnboarding.tsx:588-592`). `bg-[#050505]` is opaque, so the teaser
   behind it is not dimmed — it is destroyed, and the user goes from a moving
   glass landing to a flat black form in one frame.
3. **Give the card a `cruush-glass-panel` surface** so it composites against the
   teaser.
4. **Rebuild the progress bar** to the Part VIII §5 spec:
   - *Track* — glass on glass. The bar sits on the glass card, so it takes no
     backdrop pass of its own: translucent rim and fill only.
   - *Fill* — red neon, built the way the sign-in gel is built: an inset
     pseudo-element carrying `--primary` (`#ff0072`),
     `filter: blur(…) saturate(2.1) brightness(1.35)`, `opacity: 1`, with
     `overflow: hidden` on the track so the glow stays inside.
   - *Shell* — frosted like the sign-in button:
     `border: 1px solid var(--cruush-glass-border-strong)`,
     `background: var(--cruush-glass-dock-bg)`,
     `backdrop-filter: var(--cruush-glass-dock-backdrop)`.
   - *Rite marks* — the same red as the fill, not `bg-white/10`.
   - **Flat `--primary`, never `var(--cruush-gradient)`.** The gradient drifts
     pink → violet → blue across the nine steps, so the bar changes hue as the
     user progresses and stops reading as one indicator.

### Evidence

Screenshots at step 1, a middle step and step 9, so the fill's hue can be seen to
hold. The `/dev/onboarding` and `/dev/onboarding-oath` preview routes exist for
exactly this and avoid needing a fresh account. Confirm the teaser is still
animating behind the card, not merely present in the DOM.

### Not in scope

The nine steps themselves, their copy, and their validation.

---

# Item 10 — Application logic

Server-side, independent of every front-end item above. Four sub-items; four
edits; four reports.

### 10a — Login bonuses

**Ask.** Every award is 7 days of cruush+; what escalates is the number of
consecutive active days required for the next award.

**Files.** `server/src/reward-config.ts`, `server/src/rewards-service.ts`,
`server/sql/061_*.sql` (new), `server/src/rewards-service.test.ts`.

**Steps.**

1. **A new migration, never an edit to an existing one** (R15). The next free
   number is 061 — `059_map_presence_duration.sql` and
   `060_first_feed_post_prompt_notice.sql` are taken. Upsert
   `recurring_streak_reward_days = 7` and `long_streak_bonus_days = 7` into
   `reward_settings`. Changing the constants in `DEFAULT_REWARD_CONFIG` alone will
   **not** change production: `loadRewardConfig` overlays `reward_settings` rows
   on top of the defaults, and migration `056` already inserted `1` for both.
2. Replace `isLoginBonusMilestone` — it is periodic, firing every
   `longStreakDays` after `recurringStreakDays` — with an explicit escalating
   schedule: 7, 14, 30, 60, 90, 150, 240, 365, then every further 180 days.
3. Store the schedule in `reward_settings` as a JSON array so it is tunable
   without a deploy, and derive `nextLoginBonusAtDays` from the first entry
   strictly greater than `current_streak`.
4. Call `clearRewardConfigCache` after the migration, or wait out the 60-second
   `CACHE_TTL_MS`.

**Two defects to fix while in this code, each reported separately.** The
timezone read asymmetry: `last_activity_date` is re-read through
`calendarDateInTimeZone(new Date(...), "UTC")` while `activityDate` is computed in
the user's zone, so a user moving west across the date line can have a valid
streak silently broken. Store and compare the calendar string directly rather
than round-tripping through `Date`. And clock skew: reject any caller-supplied
`occurredAt` more than a few minutes ahead of server time — a client timestamp
must never drive streak arithmetic.

**Do not add an elapsed-time guard** to the 23:59-then-00:01 case. Two actions
ninety seconds apart counting as two consecutive days is intended: the day
boundary is a calendar boundary, and a guard would break the legitimate early
riser / night owl pair.

**Evidence.** Unit tests over the schedule table including the 9+ recurrence;
tests for the two idempotency locks (`daily_activity_credits`'
`on conflict … do nothing`, and the `activity:long:${userId}:${streak}` grant
key); a migration applied against a scratch database with the resulting
`reward_settings` rows quoted.

### 10b — Password policy

**Ask.** At least 8 letters, one number, one special character, enforced in
`signUp` on the server, with a live checklist in the form.

**Files.** `server/src/auth-schema.ts`, `src/app/components/Auth.tsx`, tests both
sides.

**Steps.**

1. Write one shared `strongPasswordSchema` and apply it to **all three** call
   sites: signup (`auth-schema.ts:20`), reset (`:48`) and change (`:53`). One
   shared schema is the point — a policy change must not land on sign-up and miss
   reset. The reset path is the strongest hole because it needs no old password.
2. **Sign-in keeps `min(1)`** (`auth-schema.ts:31`). Enforcing the policy at
   sign-in locks out every account created before it.
3. Count letters with `\p{L}` under the `u` flag and digits with `\p{Nd}`, so
   `Ünïcödé1!` and non-Latin scripts are not rejected. Define "special" as
   non-letter, non-digit **and non-whitespace** — a naive "not alphanumeric" test
   accepts a space and the policy is bypassed. Do not trim: trimming silently
   changes a stored password.
4. Add the live checklist to the form — three rows evaluated on every keystroke.
   The current single string after submit (`Auth.tsx:227`) tells the user nothing
   about the rules they have not met, so they retry blind. Client validation
   stays decorative in the security sense; any client can post directly to
   `/api/auth/signup`.

**Evidence.** Server tests for each rule and each of the four edge cases; a
direct `POST /api/auth/signup` with a weak password rejected; a screenshot of the
checklist mid-typing.

### 10c — Content removal

**Ask.** A content-removal form posts to `POST /api/support-requests` and is
delivered to `reports@cruush.app`.

`REPORTS_INBOX_EMAIL` (`server/src/mailer.ts:99`) is already that address. It is
**not** `hello@cruush.app`, which is the `WEB_PUSH_SUBJECT` default and the
reply-to in outbound bodies — do not "correct" one into the other.

**Steps.** Build the form against the existing endpoint. Enforce the attachment
cap client-side **before** upload, quoting the byte figure — `contentBase64` is
capped at 5,000,000 base64 characters, roughly 3.7 MB decoded, and a 413 after a
slow mobile upload loses the whole report. Keep the file-type allow-list closed
at `image/jpeg`, `image/png`, `image/webp`; never widen to `image/*`. Anonymous
submitters must supply `contactEmail`.

**One improvement, called out because it changes behaviour:** the Resend send is
fire-and-forget — it logs `"support inbox email delivery failed"` and the
endpoint still returns 201. The row is committed, so nothing is lost, but the
user is told "sent" when the email did not go. Add a retry queue over the
persisted `support_requests` row and **keep the 201**: telling the user their
report failed when it is safely stored makes them file it twice.

**Evidence.** A submitted report appearing in `support_requests`; the delivery
failure path exercised with the queue picking it up; rate limits confirmed at 5
per 10 minutes authenticated, 3 per 10 minutes per IP otherwise.

### 10d — Screenshot restrictions

**Ask.** Only the bug report button may capture the screen.

**Steps.** Audit for any other caller of `getDisplayMedia`, `getUserMedia` with
video, or a canvas-of-the-viewport routine, and add a lint rule or a test that
fails if one appears. The one sanctioned path is `captureBugScreenshot`
(`AlphaBugButton.tsx:74-132`); its `finally`-block track-stop is mandatory,
because a stream left open keeps the browser's screen-sharing indicator lit
indefinitely, which on a dating app reads as covert recording.

**The honest limitation must be written into the product copy review, not just
the code.** A web app can only decline to expose capture APIs to itself. It
cannot stop the operating system's screenshot, the browser's screenshot, a screen
recorder, or a second phone pointed at the display. `getDisplayMedia` is a
user-consented prompt, not a capability the page controls. Device-level blocking
needs a native wrapper — `FLAG_SECURE` on Android, a secure-surface overlay on
iOS — and is out of scope for the web build. **Any copy promising that
screenshots are prevented is false and must not ship.** If such copy exists, that
is a finding to raise, not a thing to quietly leave.

---

# Item 11 — Merges from `main`

**Do this before the logo re-render** so conflicts land on a stable tree.

### Ask

Bring `main` into the branch.

### The shape of it

43 commits on `main` only, 102 on the branch only. Six of the 43 are already
applied by equivalent patch (`git cherry` matches `5ccc0f3`, `6f3c5f6`,
`1f1145d`, `d22f40d`, `654d110`, `ed7aaaf`) and **must not be cherry-picked
again** — re-applying conflicts against identical text.

### Order

1. **First, urgently: `8c38de5`** — drops the `node_modules` symlinks that broke
   the image build. This worktree still has `node_modules` and
   `server/node_modules` as symlinks into `/Volumes/corrupt/Cruushv2-1`. Also
   `bae1346` and `273b9c7`, which bring `main`'s `.gitignore`, whose first Node
   entry is `node_modules` where this branch has `node_modules/` — a trailing
   slash does not match a symlink, which is exactly why `git status` lists them
   as untracked.
2. **Then `538fa4b`** — without it Vitest collects specs from all 28 worktrees and
   the suite is unusable in this repo layout.
3. **Then the server-only groups, which have no file overlap with the glass or
   landing work:** `409dd63`/`4ed8737`/`2b813ef`; `8b95e76`/`e5eb3f5`;
   `d4ee595`/`a9f90d0`/`0a95592`/`6be0828` (the moderation fail-closed chain —
   ordered, and splitting them leaves the build broken between steps);
   `168d0eb`; `8aad8b3`.
4. **Then the two known conflicts, resolved by hand:**
   `535fae3`/`d3f6ba6`/`b3123df`/`c74b7c1`/`22474bd`/`bd531e6` (DL Mode masking —
   the branch already carries `57b28fe` "Mask explicit map pins in DL Mode", so
   expect a `MapView.tsx` conflict; **resolve, do not re-apply**), and
   `716f6cb` (spiderfy — the branch already has `58df2c8`, so cherry-picking
   would double-apply the logic).
5. **Then the cherry-picks:** `6bdfc86`, `afcb495`, `419c72c`.
6. **Ignore:** `5963b5d`/`2b8c3b7` (the branch carries `47ccadd` with the
   identical subject; re-applying repeats the same schema change), `84963cb`
   (infra only — take it when merging to `main`), and the seven merge commits,
   which carry no unique content.

### Before starting: clean the worktree

Three things in the working tree are not work in progress and must be dealt with
first, or they ride along into a merge commit:

- **`server/sql/036_…sql` and `041_…sql` are a revert, not a change.** Both drop
  `'ban_user'`/`'unban_user'` from the check-constraint lists, undoing `74199c0`.
  **Discard them.** They also violate R15 — an existing committed migration was
  edited in place.
- **`server/sql/059_…sql` and `060_…sql` are byte-identical copies of `main`'s
  files**, copied in rather than merged. Delete them and take them with
  `e5eb3f5`/`535fae3`.
- **The four `text-size` ramps in `MapView.tsx`** are authorised map changes
  (Part V §13.2) but sit in a branch about the landing page and the glass system.
  They are legitimate; they should be committed as their own unit with the
  authorisation stated in the message, not folded into a merge.

### Evidence

Full suite green on both sides — `pnpm test` and `pnpm --dir server test` — after
each group, not only at the end. `git diff` of each hand-resolved conflict read
line by line. **Never push to `main`:** `main` and `origin/main` are identical,
and a push of 102 unreviewed commits would put the whole glass rewrite into
production in one step.

---

# Item 12 — Logo re-render

**Status 2026-08-06: done.** The re-render described below was executed. The
camera margin went from `1.04` to `1.45`, and the result measures **0 of 400
frames with artwork on row 0** against the old asset's 164 of 200. Both loops
were re-encoded from the same render at 60fps: desktop 1340×1340 and mobile
720×720, 400 frames, 6.667s, alpha intact. The content extent in the encoded
files matches the extent measured on the raw frames exactly, which is the proof
that the crop discarded nothing.

Three findings worth keeping from doing it:

- **The notch and the clipping are different defects, and no clipping test can
  see a notch.** A row-0 alpha scan measures whether artwork touches the frame
  edge. The notch is missing geometry where the wordmark crosses the flame. The
  four renders in git split cleanly: two 16:9 ones that do not clip but carry
  the notch, and one square one that is notchless but clips. None was both.
- **`df7cc9e`'s commit message is wrong.** It reads "Use notchless VP9 video
  loops" and its render has the notch.
- **`cropdetect` under-reports extent.** It gave 1064×1048 where a direct
  per-frame scan gave 1146×1211, and cropping to its figure sliced the logo on
  all four sides. Measure with a scan, not the heuristic.

The mobile asset also changed shape — 720×1280 portrait to 720×720 square. The
logo band is square, so a portrait source was letterboxing and rendering the
phone logo smaller than the desktop one.

The original plan follows, kept because its reasoning about margin, loop
integrity and the flake pass still governs any future re-render.

**Hours, not minutes. Schedule deliberately. Do it after item 11 so conflicts
land first.**

### Ask

Re-render the logo loop so the flame is not clipped at the top, folding the
glitter work into the same pass.

### The defect, measured

Across all 200 frames of the shipped desktop asset: **164 frames have artwork on
row 0** at alpha > 24. Only 36 are clean, and those are the ones nearest rotation
0. Top slack is **0 px at every threshold tested** (0, 8, 24, 64, 128). Near the
edge-on positions the row-0 profile is a flat ~121 px slab across at least nine
rows — that is a vertical section of the extruded side face missing, not a tip.

This makes the layout contract self-contradictory: `--cruush-logo-clearance` is
defined as "top of window to highest flame tip", and on 82% of frames the highest
flame tip is not in the asset. `object-fit: contain` guarantees the *frame* is
never cut, and it does that correctly — but the artwork was already cut before
the frame reached CSS. No CSS can honour "never cut off" against an asset that is
already cut.

### The lever

`logoRender.ts:340` — `const margin = Number(params.get('margin') ?? 1.04)`,
applied to `Math.max(fitForHeight, fitForWidth)`. The camera is fitted to the
*static* SVG bounds, so it makes no allowance for the silhouette growing under
perspective as parts of the mesh rotate toward the camera — which is precisely
what happens at the edge-on angles where the clipping is worst.

### Steps

1. Re-render with increasing `margin`, decoding all frames to RGBA, asserting
   **max alpha on row 0 is 0 across the whole sequence**. That is the same check
   that produced the measurement above, so it is directly comparable. The value
   that clears every frame is **unverified** and is what this sweep determines.
2. **Preserve the closed loop.** `group.rotation.y = phase * Math.PI * 2` closes
   by construction at any `FRAME_COUNT`; at 200, each frame advances exactly
   1.8°. The flake pass can lose that: `TWINKLE_CYCLES = 3` and
   `DRIFT_PIXELS = 24` are integers precisely so both complete a whole number of
   cycles across the sequence. Any change to frame count must keep them integral.
3. **Keep the flake rules.** Brighten along the paint's own hue, never per
   channel — per-channel addition on a saturated primary is a hue rotation the
   moment a channel clips, and that is the green-flake bug. Keep
   `NoToneMapping` (ACES turns the brand pink and blue pastel) and multiplicative
   shading only (ambient, IBL, specular and emissive all *add* white, which lifts
   the zeroed channel of a saturated primary).
4. **Do not repurpose the UV channel for colour.** The brand ramp is baked into
   vertex colours specifically so UVs stay free for the flake normal map;
   overwriting them with a constant `v` is what made flake read as an overlay
   sliding across the logo.
5. **Hold the framing target.** The re-render must reproduce ≈95% × 99% of a
   square frame, horizontally centred, or the band the shell reserves stops
   matching the logo. Note that the percentages quoted in `logoRender.ts:337-339`
   (36%/67% desktop, 60%/35% portrait) are from the superseded
   `object-fit: cover` era and will mislead — correct or delete them in the same
   pass.
6. **Re-measure `Auth.css:101`.** The `--cruush-logo-band * 0.0092` clearance
   correction is the asset's bottom slack, a property of the asset and not of the
   layout. A re-render invalidates it. There is no top counterpart because top
   slack is currently exactly zero; after the fix there will be, and the constant
   may need both terms.
7. **Bump `CACHE_NAME` in `public/sw.js`.** The service worker serves cache-first
   for every same-origin GET outside `/api/` and `/media/`, which includes
   `/teasers/*`, and invalidates only on `activate` when `CACHE_NAME` changes. A
   re-rendered `.webm` at the same path is otherwise served from the old cache
   indefinitely. Note the existing disagreement: `public/sw.js:1` is
   `cruush-app-shell-v6` while `src/serviceWorkerUpdate.test.ts:12` asserts
   `cruush-app-shell-v20`. Reconcile those two before bumping, or the bump lands
   on an already-broken assertion.
8. **Keep the two 6.66 s periods in step.** The video loop is 200 ÷ 30 =
   6.6667 s; the CSS glitter period is `6.66s` in three places. Any change to one
   must change the other.

### Also worth doing in this pass, since it is the same round trip

Four of the eight teaser assets are referenced by nothing — the portrait logo
loop and the entire pre-alpha teaser set, retired by `4d7913c`. That is 3.6 MB of
dead weight shipped in `public/`. Deleting them is a separate reported edit, and
it needs a stated cause in the commit message: a deletion with no reason cannot
be told apart from an accident during a later bisect.

### Evidence

The row-0 alpha assertion passing across all 200 frames — that is the acceptance
criterion, and until it passes "never cut off" is a property of the CSS only, not
of the screen. Plus a seam SSIM measurement showing the wrap sitting inside the
distribution of consecutive-pair scores rather than at its tail. **Note the
recorded discrepancy:** `README.md` and commit `514602a` quote 0.965 at the seam,
while a direct measurement of the shipped asset gives 0.8730, ranked 35th of 200
pairs. The structural claim held; the absolute figures did not match. Which
pipeline stage produced 0.965 is unverified, so quote the tool and the stage
alongside any new number.

---

# Standing obligations on every item

These are not per-item steps; they apply to all of the above and are collected
here so they are not repeated twelve times.

1. **Restate the ask in one sentence before editing.** If the restatement
   contains a second verb — "and also", "which needs" — that is a second ask and
   it does not happen (R13).
2. **One ask, one edit, one report.** When several asks arrive together, do them
   as separate edits and report them as a numbered list, so any one can be
   reverted without disturbing the others (R12).
3. **Measure the adjacent geometry, not only the property you changed.** A
   narrowed button that silently parks itself on the left edge is a placement
   change nobody asked for (R11).
4. **Restore the browser pane.** Viewport size, navigation, form mode and scroll
   position are all the user's screen; anything mutated to reproduce a condition
   is restored before the turn ends (R11).
5. **Measure in the state that fails** — hovered as well as resting, sign-up as
   well as sign-in, captcha present as well as absent, error shown as well as
   hidden (R9).
6. **Report what was not done in the same message as what was** (R6).
7. **The runtime gate before any visual or login claim** (R14): `/health` 200 and
   parseable from the API actually serving the Vite proxy; `/api/meta` 200 with
   the full typed contract; a login exercised against a known test account
   returning a documented 2xx or a documented 4xx; every `lazy()` import resolved
   in the signed-out path; no uncaught React error and no unexpected `/api/*` 5xx
   in the console. A screenshot taken over a broken console is not evidence.

---

*End of execution plans.*
