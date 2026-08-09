# cruush Codeveloper Handoff

**First read `docs/CRUUSH-RULES.md` in full — it is the standing rules for every agent and
overrides your defaults.** Then continue here for this branch's context.

Start here when opening this branch in Codex.

## Current Branch

`claude/error-fixes-c9dgs3`

This branch was rebuilt from scratch on top of current `origin/main` (via a real `git merge`,
not a cherry-pick) because `main` had absorbed ~120 commits, including the deployed
codex safety-release work, while this branch was still based on an old fork point. The old
tip (`b791933`) is an ancestor of the current tip, so nothing from the original branch was
lost — it was merged in, not replaced.

## What this branch fixes

1. Profile save failing with "could not check this text for harmful content" and feed post
   failing with "could not check this photo for harmful content" — text moderation fallback
   (`moderateTextWithLocalFallback`) widened from feed-only to every text surface
   (profile/feed/direct_message/group_message), and `createModerationProviderOrUnavailable`
   stops incomplete Stream credentials from escaping as a bare 500 instead of falling back.
2. AWS Rekognition fallback added for feed post images (`detectPublicImageSafety` in
   `server/src/profile-photo-human-detection.ts`), gated by `canUseFeedImageRekognitionFallback`.
3. The bug report button no longer floats over page content. It's docked into `BottomNav`
   (`data-testid="bottom-nav-bug-slot"`) instead of being positioned with `fixed`, so it is
   laid out by the nav row on every signed-in route instead of overlapping cards/photos/buttons.
   `src/app/lib/overlaySlots.ts` + `overlaySlots.smoke.test.ts` is a collision registry that
   fails if any two floating overlays claim the same screen space — read the comment at the
   top of that file before adding a new floating element.
4. Every first-run popup (DL Mode notice, map controls intro, beta cruush+ offer, first feed
   post prompt, bug button tip) is now ONE blocking modal tutorial
   (`src/app/components/FirstRunTutorial.tsx`) instead of five independent floating coach
   marks. It dims the screen and must be dismissed to keep using the app. `DialogContent`
   (`src/app/components/ui/dialog.tsx`) grew a `dismissible` prop for this — `false` hides
   the close button and blocks outside-click/Escape dismissal.
5. A notices-API error (Stream/DB down) no longer permanently suppresses a first-run popup.
   Centralized in `src/app/lib/userNoticesApi.ts`: `resolveNoticeDismissal`/`markNoticeDismissed`
   treat an unreachable API as "not yet seen," not "seen forever." `src/app/lib/persistentNotice.ts`
   backs it with a localStorage + cookie flag per notice key.
6. `/dev/onboarding-preview` route: renders nothing of its own, clears the tutorial's seen-flag
   and navigates to `/map` so the REAL app + REAL tutorial replay. Registered once in
   `renderPublicInfoRoutes()` in `src/app/App.tsx`, included by all 5 auth-state routers
   (previously only 2 of 5 had it, so it silently redirected away in the other 3 states).
7. Restored a real regression the merge would otherwise have shipped: `main` had changed the
   minor-face detection policy from permanent ban to human-review suspension
   (`minor_face_review_suspension`) in `server/src/moderation-service.ts`. My wholesale
   `git checkout --theirs` during conflict resolution reverted it back to permanent ban.
   Fixed in commit `37feb3b` — confirmed via `message-photo-child-face-ban.test.ts` and
   `profile-photo-stream-automod-routes.test.ts`.

## Known-not-done from the original ask

- **Stream API key rotation** — Julien floated rotating it; not done, needs his say-so on
  timing since it's a live credential.
- **"Crowds" naming** — Julien wants a friendlier word for the gay/dyke-bar-style crowd
  filters during onboarding. Discussed "Rooms," "Scenes," "Club," keeping "Crowds" with
  better copy. **He has not picked one.** Do not rename anything until he does — this
  touches an enum, DB values, filter UI, and onboarding copy.
- **3 pre-existing test failures** (`ProfileCard.test.tsx` "Already mutual" vs "Remove mutual
  cruush", `ProfileEdit.test.tsx` DL-mode photo masking, `ProfileView.test.tsx` heart preview)
  — confirmed present on plain `origin/main` too, not caused by this branch. Julien asked
  "what's failing, fix it" twice and got pulled onto the modal/tutorial rework both times.
  Still unfixed, not explicitly deprioritized.
- **Full page-by-page bug-button overlap audit** — the nav-dock fix makes overlap structurally
  impossible on every signed-in route, but Julien's instruction was to check *every* page and
  that visual sweep was never done end to end. The two pre-auth fallback routes
  (verify-email, reset-password) still use the old `fixed` positioning from
  `getBugButtonPlacement` since there's no nav there.

## Immediate blocker — fix this first

`src/app/components/MapHome.test.tsx` has a real infinite render loop, not a mock issue.

Repro:
```
npx vitest run src/app/components/MapHome.test.tsx -t \
  "navigates directly to the full profile on mobile|keeps the recently active button visible above the mobile bottom nav" \
  --reporter=verbose
```

Both tests pass individually. Run back-to-back in that order, the second one
("keeps the recently active button visible above the mobile bottom nav") hits React's
"Maximum update depth exceeded" and spins forever (had to `kill -9` the vitest worker after
13+ CPU-minutes; it does not self-terminate). This also killed the full `npx vitest run`
frontend suite the same way — anything that runs `MapHome.test.tsx` in full will hang.

What's ruled out:
- Not the notices-API mock (`src/app/lib/userNoticesApi.ts` mock) — already fixed in commit
  `2d46ce7` to `importActual` + override, matching every other mock in this file. That fix is
  correct and necessary (it stops an uncaught "no resolveNoticeDismissal export" exception
  the file threw before), but it did NOT fix this loop.
- Not order-independent flakiness — reproduces reliably every time with these two specific
  tests back to back, in isolation from the rest of the file.
- Test 3 ("navigates directly to the full profile on mobile") itself reports as passing
  (green checkmark, 338ms) before the next test starts looping — so whatever is leaking is
  leaking *after* test 3 is reported done, most likely something not awaited to settle before
  the test body returns (it does `fireEvent.click` then asserts synchronously with no
  trailing `await waitFor`/`findBy`, so a pending promise from that click could still be
  in flight when test 4's fresh component mounts).
- Confirmed NOT present on plain `origin/main` baseline (worktree at
  `/tmp/claude-0/-home-user-Cruushv2/99737962-a377-5447-833b-2d6db8ac50fd/scratchpad/main-baseline`,
  same two tests run back to back there: clean, fast, no warning).

Where to look next: the new `useEffect` this branch added at
`src/app/components/MapHome.tsx` around line 468-487 (the `resolveNoticeDismissal` /
`setMapControlsIntroOpen` / `setMapControlsNoticeOffline` effect, dependency array
`[currentProfile?.id, profileLoaded]`) is the most-changed code in this file versus
`main` and the prime suspect, but running it in isolation didn't obviously loop — the loop
needs test 3's leftover state to trigger. Compare this effect's shape against `main`'s
version of the same block (`git diff origin/main HEAD -- src/app/components/MapHome.tsx`)
line by line before assuming it's the cause; it's also possible test 3's un-awaited
`fireEvent.click` navigation is the actual leak and this effect is just what the leaked
state happens to loop through.

## Once that's fixed

1. Re-run the full frontend suite (`npx vitest run`) and compare failures against the
   `main-baseline` worktree above — as of the last clean comparison this branch fixed 2
   pre-existing `overlaySlots.smoke.test.ts` failures on `main` and had 0 new regressions
   other than this loop.
2. Run the server suite from `server/` (`npx vitest run`).
3. Run `vite build` and whatever this repo's release-readiness script is
   (`pnpm check:layout`, `pnpm check:copy` per `docs/CRUUSH-RULES.md`).
4. Push to `claude/error-fixes-c9dgs3` (already the branch this worktree is on — just
   `git push -u origin claude/error-fixes-c9dgs3`, do not push to `main` directly, and do
   not open a PR unless Julien asks).

## Rules

- Keep `cruush` lowercase.
- Do not add fake accounts, fake profiles, fake messages, fake DMs, fake groups, or fake bank/reviewer content.
- Do not put secrets in frontend `VITE_*` variables.
- Do not make private media buckets public.
- Do not claim end-to-end encryption, real identity verification, or physical safety guarantees.
- Use focused tests for touched code first, then full test/build before release readiness.
