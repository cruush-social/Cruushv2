# Handoff: `feat/visual-pass`

A branch for the visual work, cut from `codex/carousel-photo-gallery-20260820` at
`efab940` so everything built today is already on it. `origin/main` is `b4621d5`
and neither branch is on it.

Take a separate worktree so the two branches do not fight over one checkout:

```bash
git worktree add /Volumes/good/Cruushv2-visual feat/visual-pass
cd /Volumes/good/Cruushv2-visual && npm install
```

`AI_TASK.json` on this branch still describes the plumbing job. Rewrite it for the
visual work before committing, or the publication hook will refuse the push.

---

## What is already here to play with

**The badge set**, 124 options across ten groups, at `/settings/badges`. The heart sits in
the middle like an avatar screen; left starts as your role, right as your position; either
side takes anything; a side can say give, receive, switch, or service, which reads as
`give/fisting` on hover in white with a dark shadow, under the badge.

- `BdsmEmblems.tsx` — the community set. Frame is role, arrow is position, nested outline
  is depth, four corner dots mean taken. Chevron dominant, square submissive, hexagon switch.
- `OwnershipGlyphs.tsx` — the collar emblems. Shield holds, ring wears, brackets wear none.
- `CommunityGlyphs.tsx` — trans, T4T, nonbinary, labrys, poly, ace, and the interlocking
  gender pairs.
- `PositionRoleGlyphs.tsx` — positions as direction, the hanky way: up gives, down takes.
- `ZodiacGlyphs.tsx` — twelve signs, drawn not set as text.
- `BadgeFrames.tsx` — twenty-one frames. Sixteen gender frames plus heart, square, chevron,
  brackets, hexagon. **The circle never changes size**; a frame only adds arms outside it.
- `HankyFrame.tsx` — twenty-four colours, no icon, colour is the message. Preview at
  `/settings/hankies`.

**Preview routes** already wired: `/settings/badges`, `/settings/hankies`,
`/settings/kelpie-marks`, `/settings/pulse-effects`, `/feed/photo-preview`.

## Known visual problems worth taking

- **Hanky at chip size.** The diamond's points clip inside the round chip. Square it, or
  inset it so the points clear.
- **No preview page for the frames or the zodiac glyphs.** Twenty-one frames and twelve
  glyphs are drawn and have never been looked at. A page like `/settings/kelpie-marks`
  would show them at mark size, control size, on the gradient, and small.
- **The Kelpie marks page has five options and four of them are weak.** Only the water
  horse reads. Pick one and delete the rest.
- **Ghost exit animation.** The idea on the table: the last 40% of the tips fade to white
  and then down to about 10% opacity, with the horns a darker blue falling into the
  electric blue. Worth building against the map's darkest and lightest areas first, or the
  white tips vanish into pale streets rather than fading.
- **Top-bar Ghost icon should match the colours of the ghost in the exit animation.**
- **Controls read small around 880px wide**, which falls between the mobile and desktop
  sizing.
- **Profile**: desktop overlay mode, less scrolling, bigger gallery hearts.
- **Feed**: photos in posts, heart-shaped previews that expand on tap, hover reactions.
- **Page headers on one line** for Messages, Notifications, Settings.
- **Skeleton loading states.**

## Rules the visual work has to hold

From `docs/design-master.md` and the corrections that produced it:

- Signal is **35 characters**, one line, never wraps, and the limit is stated wherever a
  signal is editable.
- Icons are **flat white or gradient**. Two finishes, no others. The hanky is the single
  exception, because the hanky code is a colour code.
- **Green belongs to Pulse.** Red belongs to the bug control and nothing else.
- **Nothing covers the top chrome, the bottom nav, or a popup.** No pin overlaps another
  pin, ever.
- Icon controls are circles. Worded controls are pills.
- Vibe capsules appear on **profile previews only**.
- **No second taglines.** One line, or none.
- Page headers keep the title and the icon buttons on one line at any width, popped out or
  not.
- Public copy never uses an em dash.
- Hearts carry the relationship colour: self `#004BFF`, mutual `#6f00ff`, nearby `#FF0072`.
  Fill and border alike.
- Two fonts. Spectral for everything, UnifrakturMaguntia for the logo. Never a mono.

## Do not touch from this branch

The plumbing branch has these open and will conflict:

`MapView.tsx`, `MapHome.tsx`, `server/src/routes/users.ts`, `server/src/travel-pins.ts`,
`server/src/routes/privacy.ts`, `server/src/profile-schema.ts`,
`server/src/profile-sensitive.ts`, `server/src/routes/profiles.ts`,
`server/src/policy-mapper.ts`, `server/src/push-service.ts`,
`server/src/notification-service.ts`, `ProfileEdit.tsx`.

Everything else is fair game.

## Before the server starts

Three migrations are pending and must run, or profile reads fail with a 500:

```bash
cd server && set -a && . ./.env.local && set +a && npx tsx src/migrate.ts
```

`096_notification_quiet_hours`, `097_travel_pins`, `099_profile_zodiac`. No environment
variables were added, removed, or changed.

Dev server: **http://localhost:5190**, API on **3001**.
