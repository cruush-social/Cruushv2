# Feed layout and settings pass — handoff

**Read the standing rules document in `docs/` that `CLAUDE.md` points at, in full, first.**
This document only covers the state of one unfinished branch.

Branch: `feat/ghost-pin-flash-animation`
Worktree: `/Volumes/good/Cruushv2-ghost-flash-20260821`
Last clean commit: `304cb54`

## Status in one line

Seven changes are written and compile. **Five tests are red, nothing has been rendered in a
browser, and the branch is three commits behind `origin/main`.** Do not ship any of this
until it has been looked at on a screen.

## What is already on this branch and deployed

The ghost pin countdown animation and its settings copy are finished, merged, and live in
production. `bff0498` and `58e7616` are ancestors of `main`. Nothing there needs attention.

`304cb54` fixes a false-positive drift check in `scripts/release-main-coolify.mjs`. Coolify's
REST API does not return the include-source-commit and inject-build-args toggles, so the
script read absence as "switched off" and aborted the production release while both toggles
were in fact enabled in the dashboard. That commit is not on `main` yet.

## Uncommitted work in the tree

Five files. `npm run build` and `tsc -p server/tsconfig.json` both pass.

| File | Change |
| --- | --- |
| `src/app/components/LocalFeed.tsx` | Composer collapses to one row until tapped; vibe tags moved out of the avatar rail into a wrap under the post; post meta moved onto the name line; expiry and crowd controls moved into the feed settings dialog; distance-label copy corrected; range input uses the new primitive |
| `src/app/components/AlphaBugButton.tsx` | Adds `cruush-alpha-bug-button` class for the D1 rule |
| `src/styles/theme.css` | Adds the `.cruush-range` gradient slider primitive and the D1 dialog rule |
| `src/app/components/ProfileEdit.tsx` | Zoom slider uses `.cruush-range` |
| `src/app/components/LocalFeed.test.tsx` | One assertion updated for the narrower rail |

### Why each change was made

**Measured on production at 390x844 before touching anything.** Header 69px, composer card
266px, first post starting at 412px — 49% of the screen gone before any content. The composer
was 31.5% of the viewport and always expanded. Post text rendered at 236px of 390 because a
fixed 80px rail held the avatar plus a vertical stack of vibe pills that truncated anyway.

**D1 violation, real and still worth confirming.** The bug-report control is `z-[70]` and
fixed to the top right; dialogs are `z-50` with their close button in the same corner, so the
control sat on top of every dialog's X. `check-layout-invariants.mjs` never caught it because
it only tests `/` with no dialog open. The fix hides the control while any dialog is open, via
`body:has([role="dialog"][data-state="open"])`.

**The distance-label setting description was factually wrong.** It said "Show broad ranges like
1-3 mi". `formatDistanceLabel` in `server/src/location-privacy.ts` returns `"Nearby"` for Ghost
Mode or a precise one-decimal value such as `"2.4 mi"`. There are no ranges. It is also a
personal display preference, not a privacy control, and the old copy read like the latter.

## What is broken right now

Five tests in `src/app/components/LocalFeed.test.tsx`:

1. `renders feed profile previews without showing author pronouns`
2. `posts to no crowds or multiple allowed crowds selected from the composer`
3. `lets feed posts use seven-day or never expiry from the composer`
4. `loads and saves the feed expiry choice used by future Pings`
5. `serializes rapid feed expiry saves so the last selection wins`

All five fail for the same two reasons: the expiry and crowd controls are no longer inside
`local-feed-composer`, and the composer now starts collapsed so the textarea placeholder does
not exist until it is opened. The behaviour they cover still works and still matters — update
the queries, do not delete the tests. Opening the composer first is
`fireEvent.click(screen.getByTestId('local-feed-composer-open'))`; the expiry and crowd buttons
now live inside the feed settings dialog.

## Known defect introduced and fixed in the same session

One edit wrapped the per-post action buttons in `<div className="hidden">`, which silently
removed report, block, delete and the map-pin jump from every feed post. It was caught on a
diff re-read and fixed. **Check that region renders before trusting it** — the actions now sit
in their own right-aligned row under the name line. Report and block only render on other
people's posts (`post.user.id !== currentUserId`), which is correct and is why they look absent
when scrolling your own posts.

## Requested and not started

- **Sheen on profile action buttons.** The message and cruush buttons should pick up the
  gradient treatment on hover, matching the cruush+ logo and the landing page buttons. Three
  buttons on a profile should read as one set.
- **Feed profile pins are too small.** Shrinking the rail from `w-20` to `w-14` to reclaim
  width made the avatars too small. Julien suggested moving to 4:5 photos rather than reverting
  the width.
- **Feed settings menu should follow the cruush match settings popup as its style reference.**
- **Rename the cruush match settings popup and drop its tagline** ("Choose who can start a chat
  with you."). The name is undecided — Julien said "Activity", then "or maybe call the page
  Cruushes". Ask before picking.
- **Admin badge.** Either move it next to age or remove it entirely. Julien was thinking out
  loud and did not land on one.
- **The red bug button should be "its own thing"**, not sitting in the top nav bar. Hiding it
  during dialogs was a correctness fix, not this. It is currently `fixed` top-right, which is
  why it lands in the nav's space.
- **"Where are the location pins I asked about"** — no such request exists in this session's
  transcript. The closest shipped feature is `9cf8263 feat(feed): add location pin privacy
  settings`, the "Feed map pin" section already in the feed settings dialog. Clarify before
  building anything.

## Environment notes that cost time

- **The feed cannot be verified with a plain `npm run dev`.** It needs the local API, which
  means `pnpm dev:local` on port 5173. That port was held by another chat's server all session,
  which is the direct reason none of this was ever rendered.
- Server dependencies install with **npm, not pnpm**: `npm --prefix server ci`. The server is
  not a pnpm workspace package and has its own `package-lock.json`.
- Vitest needs `--pool=forks` on this machine.
- `scripts/release-main-coolify.mjs` pushes the source branch **directly onto `main`** before
  deploying, even with `--target staging`. It is not a staging-only operation.
- Staging is down and has been all session: `staging.cruush.app` returns 503,
  `api-staging.cruush.app` returns "no available server". Unrelated to this branch.
- The branch is three commits behind `origin/main`, and `ProfileEdit.tsx` is modified here
  while `c29b7fc` also changed it on `main`. Rebase before doing anything else.

## Suggested order

1. Rebase onto `origin/main`.
2. Free port 5173 or start `dev:local` elsewhere, and actually look at the feed.
3. Fix the five tests.
4. Decide the pin size question, since it changes the layout the rest of the work sits on.
5. Take the naming and admin-badge questions to Julien rather than guessing.
