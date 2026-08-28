# Handoff: `feat/visual-pass`

A branch for visual work, cut from `codex/carousel-photo-gallery-20260820` at `10f90ea`
so everything built today is already on it. `origin/main` is `b4621d5`; neither branch is
on it and nothing is deployed.

---

## Setup

Take a separate worktree. Two branches in one checkout will fight.

```bash
git worktree add /Volumes/good/Cruushv2-visual feat/visual-pass
cd /Volumes/good/Cruushv2-visual && npm install
```

Three migrations are pending. Profile reads return 500 until they run.

```bash
cd server && set -a && . ./.env.local && set +a && npx tsx src/migrate.ts
```

`096_notification_quiet_hours`, `097_travel_pins`, `099_profile_zodiac`. No environment
variables were added, removed, or changed.

Dev server **http://localhost:5190**, API **3001**. Never start a dev server with Bash;
use the preview tooling.

`AI_TASK.json` still describes the plumbing job. **Rewrite it before the first commit** or
the publication hook refuses the push: it validates that every staged path appears in
`allowedPaths` and that `publicationTarget` is set.

## How to verify, which is not optional here

The repo rules document that `CLAUDE.md` points at carries rule **B1**: never report a
visual change as done from the diff. Render the route and look at it. For anything on the
map that means the real map, not a mock, because half the geometry is computed from zoom.

```bash
npm run build                                              # must be clean
npx vitest run --pool=forks --no-file-parallelism <file>   # threads pool times out
```

The `--pool=forks --no-file-parallelism` flags are not optional. `node_modules` lives on a
slow volume and the default threads pool hangs.

Green right now, so a red result is yours: client build, `MapHome.test.tsx` (70),
`MapView.test.tsx` (49), `ProfileEdit.test.tsx` (25), `Auth.test.tsx` (17),
`Settings.test.tsx`, `ProfileView.test.tsx`, `NotificationSettings.test.tsx`,
`server/src/app.test.ts` (295).

## Preview routes already wired

| Route | What it shows |
| --- | --- |
| `/settings/badges` | The badge picker, all 124 options, avatar layout |
| `/settings/hankies` | 24 hanky colours at three sizes |
| `/settings/kelpie-marks` | Five Kelpie mode marks |
| `/settings/pulse-effects` | Fourteen ekg treatments on a pin |
| `/feed/photo-preview` | Three ways feed photos could read |

These are the pattern to copy: a page that renders the thing at every size it will
actually appear, including inside a real badge chip, so the decision is made against the
real object rather than a swatch.

## The badge system, since most of the visual work touches it

`src/app/components/BadgePickerPreview.tsx` is the screen. It imports:

| File | Carries |
| --- | --- |
| `BdsmEmblems.tsx` | The community emblem set |
| `OwnershipGlyphs.tsx` | Collar emblems |
| `CommunityGlyphs.tsx` | Trans, T4T, nonbinary, labrys, poly, ace, gender pairs |
| `PositionRoleGlyphs.tsx` | Positions as direction |
| `ZodiacGlyphs.tsx` | Twelve signs |
| `BadgeGlyphs.tsx` | Lips, tongue, keyhole eye, straight edge, party hat, Kelpie |
| `BadgeFrames.tsx` | Twenty-one frames |
| `HankyFrame.tsx` | Twenty-four colours plus their meanings |
| `src/app/lib/badgeIntent.ts` | give / receive / switch / service, and the label format |

**How the emblem set reads.** Four channels at once, which is why one icon never covered
it: the frame is the role (chevron dominant, square submissive, hexagon switch), an arrow
inside is the position, a nested outline is how deep it goes, four corner dots mean taken.
A top and a dominant are not the same thing and this set is what makes that legible.

**How frames work.** Almost every gender symbol is a circle with something attached. So
the chip stays the circle it already was, at the size it already was, and a frame only
adds arms outside it. A framed badge sits further from the heart than a plain one and
never overlaps it. Only the border and the attached arms change.

**The hanky carries no icon.** The hanky code is a colour code. It is the single place in
the app where a badge is not flat white.

## Geometry you will need

Copied from the map so anything you build matches what it draws.

```
heart pin unit        h-20 w-[103px]        (80px tall, 103px wide)
hover scale           scale-[1.38]
badge chip            h-[1.5625rem] w-[1.5625rem]   (25px)
chip offset           left-[-0.25rem] / right-[-0.25rem], top-[62%]
border width          3.2px, on the heart and the chip alike
heart border, self    #004BFF
heart border, mutual  #6f00ff
heart border, nearby  #FF0072
ping green            #C8FF31
marker clearance      MARKER_CLEARANCE_PX in MapView, derived from the unit width
```

CSS tokens in `src/styles/theme.css`: `--cruush-gradient` (bright),
`--cruush-gradient-soft-18` and `-28` (the bright gradient dimmed by a black layer),
`--cruush-logo`.

## Rules that have to hold

From `docs/design-master.md` and the corrections that produced it. These are not
preferences; breaking them is what gets reverted.

- Signal is **35 characters**, one line, never wraps, and the limit is stated wherever a
  signal can be edited.
- Icons are **flat white or gradient**. Two finishes, nothing else. The hanky is the one
  exception.
- **Green belongs to Pulse. Red belongs to the bug control** and nothing else. The bug
  control lives in the top-right corner at every size, may sit on top of other controls,
  and must not be moved.
- **Nothing covers the top chrome, the bottom nav, or a popup. No pin overlaps another
  pin, ever.**
- Your own pin and your Ghost decoy never move. The decoy sits exactly where the server
  placed it until its rotation moves it.
- Icon controls are circles. Worded controls are pills.
- Vibe capsules appear on **profile previews only**.
- **No second taglines.** One line or none.
- Page headers keep the title and the icon buttons on one line at any width, popped out or
  not.
- Public copy never uses an em dash.
- Two fonts: Spectral for everything, UnifrakturMaguntia for the logo. Never a mono.
- Do not add anything nobody asked for. No speculative copy, captions, decoration, or fake
  data.

## The Cruushes page is wrong, and it is the most important note here

Screenshots on 2026-08-22 show the **incoming**, **sent**, and **mutual** tabs all drawing
the same purple heart border. Purple means mutual. It is the colour that tells someone
their interest was returned.

An incoming cruush you have not answered is **not** mutual. A sent cruush they have not
answered is **not** mutual either. Both currently read as though they are, which tells
people they have a match when they do not. That is a lie about the one thing this page
exists to report, and it is worse than a layout bug.

The three tabs should also be near-identical to each other in layout and are not. The
`incoming` rows and the `mutual` rows differ in what they show under the name: mutual
shows a "Mutual" label and a distance line, incoming shows pronouns and a timestamp. Pick
one row and use it in all three.

What the colours mean, from the map:

```
self     #004BFF
mutual   #6f00ff
nearby   #FF0072
```

There is no colour for a one-way cruush yet, and there probably should be. Julien's read:
"maybe we'll have a new state at some point, a new colour for between states when it's one
way." Until that exists, a one-way cruush must not use the mutual purple. Use the nearby
colour, or leave the heart unthemed, but do not claim a match that has not happened.

Files: `src/app/components/CruushActivity.tsx` for the page, `HeartPhoto.tsx` for the
`theme` prop that picks the border, and `server/src/routes/cruush.ts` if the records do not
carry enough to tell the states apart.

## Work worth taking, roughly in order

**1. Frames and zodiac have never been looked at.** Twenty-one frames and twelve glyphs
are drawn and unrendered. Build a page like `/settings/kelpie-marks` showing each at mark
size, control size, on the gradient, and inside a real chip. Expect several to need
redrawing; the gender frames especially, since the arms were placed by arithmetic rather
than by eye.

**2. The hanky clips at chip size.** The diamond's points are cut off by the round chip.
Square it, or inset it so the points clear. `HankyFrame.tsx`, one component.

**3. The Kelpie page has five marks and four are weak.** Only the water horse reads. Pick
one, delete the rest, and wire it into Ghost Mode settings, which is where Julien said it
belongs rather than on the badge picker.

**4. Ghost exit animation.** The idea on the table: the last 40% of the tips fade to white
then down to about 10% opacity, with the horns a darker blue falling into the electric
blue. Build it against the map's darkest *and* lightest areas before committing to the
curve, or the white tips vanish into pale streets instead of fading. `theme.css` carries
the current animation; `MapView.tsx` triggers it.

**5. Top-bar Ghost icon should match the colours of the ghost in the exit animation.**

**6. Controls read small around 880px**, which falls between the mobile and desktop
sizing. `MapHome.tsx` top bar.

**7. Page headers on one line** for Messages, Notifications, Settings. Title and icon
buttons, any width, popped out or not.

**8. Skeleton loading states.** Julien described it as "a ghost of the thing loading
appearing as it loads."

**9. Profile**: desktop overlay mode with the details over the photos and the photos
visible underneath; less scrolling; bigger gallery hearts.

**10. Feed**: photos in posts, heart-shaped previews that expand on tap, hover reactions
in white cruush icons, feed profile pins at 4:5.

## Known asset problem

`dl-mode-white.png` and `dl-mode-colored.png` are 512×512 with the ink running flush to
the top and bottom rows and 87 and 88 pixels of padding on the sides. Beside icons that
have breathing room it reads as cropped. CSS cannot fix it; the asset needs re-exporting
with vertical padding.

## Files the plumbing branch has open

These will conflict. Everything not listed is fair game.

```
src/app/components/MapView.tsx
src/app/components/MapHome.tsx
src/app/components/ProfileEdit.tsx
server/src/routes/users.ts
server/src/routes/privacy.ts
server/src/routes/profiles.ts
server/src/travel-pins.ts
server/src/profile-schema.ts
server/src/profile-sensitive.ts
server/src/policy-mapper.ts
server/src/push-service.ts
server/src/notification-service.ts
```

Map work is the awkward one: `MapView.tsx` and `MapHome.tsx` are both held, and items 4,
5, and 6 above live in them. Either coordinate on those three, or take them after the
plumbing branch lands.
