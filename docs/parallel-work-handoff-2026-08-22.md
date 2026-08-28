# Working in parallel, 2026-08-22

One branch does the boring work: `codex/carousel-photo-gallery-20260820`, in the
worktree `/Volumes/good/Cruushv2-carousel-photo-gallery-20260820`, served at
**http://localhost:5190** with the API on **3001**.

This file says what that branch is holding so anyone else knows what not to touch.

---

## Safe to work on right now

These do not overlap anything on this branch. Nothing here shares a file with the
in-flight work below.

**Feed** — `src/app/components/LocalFeed.tsx`, `src/app/components/FeedPhotoPreview.tsx`,
`server/src/routes/posts.ts`. Photos in posts, replies, tag search, hover reactions,
heart-shaped previews. Completely untouched by this branch.

**Profile page** — `src/app/components/ProfileView.tsx` below the tabs. Desktop overlay
mode, less scrolling, bigger gallery hearts. This branch only touched the header row and
the padding above the tabs; the body is free.

**Messages** — `src/app/components/DirectMessages.tsx`, `PrivateGroupChat.tsx`,
`server/src/routes/messages.ts` below the send path. Unread dots, page headers on one
line, chat layout. Careful: the send handler itself was changed on this branch, see below.

**Settings pages** — change email, secondary email, digest, search bar. Only
`Settings.tsx`'s row list was touched here, to add a Travel Mode row.

**Chrome** — skeleton loading states, pop-out panel drag, page headers on one line for
Messages, Notifications, Settings. None of it overlaps.

**The `main` worktree's 23 uncommitted files.** They are somebody's work and this branch
has not touched them. They need committing before a bad checkout eats them, and that
should be done by whoever wrote them, in `/Volumes/good/Cruushv2-main`.

## In flight on this branch, do not edit

Ordered by how badly a conflict would hurt.

- `src/app/components/MapView.tsx` — marker separation, the ghost leash, hover handling,
  the Pulse trace. Heavily reworked.
- `src/app/components/MapHome.tsx` — the Pulse control, the browse-radius refusal, the
  ghost leash endpoints.
- `src/app/components/BadgePickerPreview.tsx` and everything it imports:
  `BadgeGlyphs`, `BdsmEmblems`, `CommunityGlyphs`, `OwnershipGlyphs`, `PositionRoleGlyphs`,
  `ZodiacGlyphs`, `BadgeFrames`, `HankyFrame`, `HankyPreview`, `src/app/lib/badgeIntent.ts`.
- `src/app/components/ProfileEdit.tsx` — the Badges tab, the kink limit, relationship
  status, zodiac.
- `server/src/routes/users.ts` — the Pulse radius check, travel pins, the browse radius.
- `server/src/travel-pins.ts`, `server/src/routes/privacy.ts` — Travel Mode.
- `server/src/profile-schema.ts`, `server/src/profile-sensitive.ts`,
  `server/src/routes/profiles.ts` — relationship status and zodiac.
- `server/src/policy-mapper.ts`, `moderation-provider.ts`,
  `profile-photo-human-detection.ts` — the group photo rule.
- `server/src/push-service.ts`, `notification-service.ts` — quiet hours, deferred push.
- `src/app/components/Auth.tsx` / `Auth.css` — the landing brand and the policy disclosure.

## Migrations

Three are pending and must run before the server starts anywhere:

```
096_notification_quiet_hours.sql
097_travel_pins.sql
099_profile_zodiac.sql
```

They had never run locally, which is what caused the internal server error earlier today.
Run them from `server/` with the local env loaded:

```bash
cd server && set -a && . ./.env.local && set +a && npx tsx src/migrate.ts
```

No environment variables were added, removed, or changed.

## Landmine

The `travel-mode` branch contains commit `33d92dd`, which reintroduces the inline-HTML
mailer change that was reverted on `main` in `b4621d5`. Merging that branch as it stands
breaks Resend delivery tracking. Merge `origin/main` into it first and confirm
`grep -c "TEMPLATE_ID = " server/src/mailer.ts` prints `2`.

That branch has no other code. Its value is the design record and five Mile High Club
SVGs. Take the assets, abandon the branch. Travel Mode is already built here at `6185039`.

## State

Nothing on this branch is on `origin/main` and nothing is deployed. `origin/main` is
`b4621d5`.

Green as of this writing: client build, server typecheck, `server/src/app.test.ts`
(295), `MapHome.test.tsx` (70), `MapView.test.tsx` (49), `ProfileEdit.test.tsx` (25),
`Auth.test.tsx` (17), `Settings.test.tsx`, `ProfileView.test.tsx`,
`NotificationSettings.test.tsx`.

Untested throughout: badge frames, hankies, zodiac glyphs, relationship status, and
Travel Mode itself. All of it compiles; none of it has a test or a rendered check.
