# Handoff: uncommitted work on `main`

Worktree: `/Volumes/good/Cruushv2-main`
Branch: `main`, HEAD `b4621d5` ("revert: put verification and password reset back on their Resend templates")
Task contract: `AI_TASK.json` still describes the `feat/free-feed-board` job and has **not** been updated for this batch.

**Nothing is committed. Nothing is pushed. Nothing is deployed.** 23 tracked files are modified and one script is new. `cruush.app` is still serving the previous build — verified by downloading `https://cruush.app/assets/index-Ci4rA7AE.js` and grepping it: it contains `More policies` (the old label) and zero occurrences of `Contact & policies`.

The previous contents of this file, the handoff for the free feed branch, are in git history at commit `ed463fc`.

---

## What changed

### 1. The password reset page no longer traps people

`src/app/components/ResetPassword.tsx` — "Back to sign in" was a react-router `<Link to="/">`. It changed the path client-side, but `App` reads `window.location.search` once during render and is not subscribed to router navigation, so `?resetPasswordToken=` stayed live and the app kept rendering `ResetPassword`. The control appeared dead and a manual reload was the only way out. It is now a plain `<a href="/">`, which performs a real document navigation and clears the token. This matches what `VerifyEmail` already does (`window.location.href = '/'`).

Three tests were added in `ResetPassword.test.tsx`: the control is an anchor to `/`, its click is **not** cancelled (a router link cancels it, which is the exact regression), and the way back is still present after a successful reset.

### 2. Auth and reset screens

- Both primary buttons use a new token, `--cruush-auth-button-gradient`, defined in `Auth.css` as the **logo** gradient from `docs/design-master.md` line 57: `linear-gradient(90deg, #FF0072 6.08%, #6F00FF 53.27%, #004BFF 100%)`. Purple sits at the midpoint and the three stops spread evenly, instead of the five-stop button gradient that read as mostly pink.
- "Back to sign in" is now the same full gradient button as "Reset password".
- Every notice and error panel on both screens was a glass card (`bg-white/5 border-white/10`). They now use the red alert treatment (`border-[#d11f3a]/60 bg-[#d11f3a]/22`, white medium text, red shadow) and carry `role="alert"` / `role="status"`.
- Mobile brand block matches desktop: the logo's `opacity: 0.78` plus `blur(0.14px) saturate(0.72) contrast(0.76)` wash is gone, it sits at `opacity: 1` with `z-index: 6` and the desktop drop-shadow stack; the tagline's blur/saturate/contrast wash is gone too.
- The footer disclosure is renamed **Contact & policies**, is white and larger (0.8rem), and now holds the contact links and "Forgot your password?" as well as the secondary policy links. `PublicPolicyLinks` takes `children` for this. While it is closed the screen stays clean; opening it lets the shell grow and scroll on phone and desktop, via a `:has(.launch-login-auth-footer details[open])` rule at the end of `Auth.css`.

### 3. Tutorial teaches instead of doing

`src/app/components/MapControlsTutorial.tsx`

- The pink `StepIcon` chip is gone, along with the component and its lucide imports. The spotlight on the real control is the illustration.
- `SELF_SERVICE_STEP_IDS` is `['install', 'notifications']`. Only those two still render an action button in the card, because they open a browser dialog. Every other step highlights the real control and waits for the person to press it themselves.
- `Settings` → Tutorial now navigates straight to `/map?replayTutorial=1` instead of the `/settings/tutorial` stop-off page. That page and its route still exist.

`MobileInstallPrompt.tsx` — `handleInstallRequested` always opened our own sheet, even when a real `beforeinstallprompt` event had been captured, which is the second popup. It now calls `promptEvent.prompt()` directly and only falls back to the sheet's manual instructions when the browser gives us no prompt (iOS).

`MapControlsTutorial.test.tsx` gained `expectTaughtStep(id, label)`, which asserts the button is absent and the spotlight points at that step. Note the Pulse step's title is `Pulse`, not `Ping`; the old test text was stale.

### 4. Settings

- Row descriptions are no longer rendered. They remain in the data because `settingsItemText` feeds the settings search on them.
- **Privacy audit** is now its own row (`ShieldCheck`, `/privacy/audit`), next to Map presence, which already had one.

### 5. Map, pulse, and dead controls

- `PulseLedIcon.tsx` was copied from `Cruushv2-carousel-photo-gallery-20260820`, where it had already been updated. `main` still had the 29-line thin ring; the current version draws the heart pin's own ekg trace (`PULSE_EKG_PATH`) and adds a `ring` prop for placements that already draw a circle.
- `MapHome.tsx` — the right-hand control stack moved from `top-[3.875rem]` to `top-[4.625rem]`. At 375×812 the top row occupies `[88,8 → 323,66]` and SEEKING started at `62`, a 4px collision. It now sits at `74`, giving 8px above and below, matching the SEEKING-to-VISIBILITY gap that `expectSeekingTopSpacing` in `e2e/regression/session-interactions.spec.ts` asserts. `MapHome.test.tsx`'s class assertion moved with it.
- `ProfileActionTrio.tsx` — the centre-pin button used to render greyed out and disabled when someone does not share their precise location. It is no longer rendered at all. No dead controls.
- `CruushActivity.tsx` — rows wrap below 400px (`max-[400px]:flex-wrap`), so the action trio drops to its own line instead of squeezing the name and pronouns into a sliver.

The alpha bug button was moved to a bottom corner on phones and then **reverted**. It lives in the top-right corner at every size, is allowed to sit on top of other controls, and must not be repositioned.

### 6. Service worker release gate (new)

`scripts/check-service-worker-release.mjs`, wired into `package.json` as `check:sw-release` and into `scripts/run-regression-gates.mjs` after `check:layout`.

It fails the release when the five copies of the release id disagree, and when any shipped frontend file (`src/`, `public/`, `index.html`, excluding test files) differs from `origin/main` while the id has not moved. Baseline is overridable with `CRUUSH_SW_BASELINE`.

The id was bumped **v26 → v27** in all five places: `public/sw.js` (`CACHE_NAME` and `REFRESH_ID`), `src/main.tsx`, `index.html`, `public/service-worker-recovery.js`, and the expectations in `src/serviceWorkerUpdate.test.ts`.

---

## Verification

Passing:

- `src/serviceWorkerUpdate.test.ts` — 3/3
- `Auth.test.tsx` + `ResetPassword.test.tsx` — 21/21
- `Settings.test.tsx` + `MobileInstallPrompt.test.tsx` — 20/20
- `MapControlsTutorial.test.tsx` — 11/11
- `MapPingSheet.test.tsx` — 7/7
- `CruushActivity.test.tsx` + `DirectMessages.test.tsx` — 16/16
- `npm run build` — clean
- `node scripts/check-service-worker-release.mjs` — passes on the bump, and was confirmed to exit 1 when one copy was set back to v26

Failing, pre-existing, **not** caused by this work:

- `src/app/components/MapHome.test.tsx` — 69 of 70 fail with `No "MapMarkerPin" export is defined on the "./MapView" mock`. Confirmed by stashing every change in this batch and re-running: still 69 failures. The mock in that test file needs a `MapMarkerPin` export.

Not verified:

- Nothing in this batch has been seen rendered on the real local stack. Every visual claim rests on source and unit tests, except the reset page, which was screenshotted at 375×812 on a frontend-only server.
- No e2e run, no server test run, no full vitest suite.

---

## Running it locally

Use `https://localhost:5178`. That is `dev:local` for this checkout: vite plus the API on `:3001` plus Postgres, and it serves this working tree over HMR.

Do **not** use a bare `npm run dev` on an arbitrary port. A frontend-only server on `http://127.0.0.1:5195` was handed over earlier in the session and every write failed with `Request origin is not allowed.` — the API's CORS allowlist does not include that origin. It made working features look broken.

Staging is down: `https://staging.cruush.app` and `https://api-staging.cruush.app/api/meta` both return **503**. `https://cruush.app` returns 200.

---

## Requested and not done

Raised during the session, none of it started:

1. **Quests.** One free day of cruush+ for finishing the tutorial, one day per profile photo uploaded up to four (a full set of four photos is worth four days), and one for the first feed post. Call them **quests** on the cruush+ page, and have the feed encourage a first post with the free day as the reward. Note this collides with the standing reward rule in `AI_CONTRACT.md`: new action-based credits are supposed to be rejected at the database boundary. That conflict needs resolving before anything is built.
2. **Crowds as presets.** Replace crowds with named, customisable presets: one by default, up to four with cruush+, each with its own SF and VC, toggleable through VC and usable as a reverse filter. Set them in a tab in edit profile. Needs a new menu.
3. **Heart pins at a constant size** everywhere they appear — the map's default size, never the hover size, unless stated otherwise.
4. **Vibe pills and actions on message rows.** Requires API work first: `ConversationThread` in `src/app/lib/messagesApi.ts` carries neither vibes nor precise-location permission, so `/api/conversations` has to return them.
5. **Tutorial coverage** of cruush settings, messages, profile edit, Ghost Mode's decoy, and badges; and it should say when something is on by default.
6. **Bottom nav is too big** on the map screen.
7. **Cruise Carousel: make the spin fun.** "Browse again" belongs directly under "Visit full profile" (`src/app/components/ProfileCard.tsx:299`, also used by `CruiseCarouselSlot.tsx:484`), and the plain button reads as boring. The carousel is a slot machine, so the control should behave like one. Proposal to build or argue with:

   - Replace the button with a full-width **pull bar** sitting right under "Visit full profile". Press and drag it to the right; the cruush gradient charges along it as you pull, from 0 to 100 percent.
   - Release past roughly 60 percent and it snaps back with a spring while the card face spins: a short reel of upcoming profile hearts scrolling fast, easing down, settling on the next person. Release short of that and it springs back with nothing spent.
   - A plain tap on the bar spins too, so nothing depends on the drag gesture. Keyboard: Enter or Space on the focused bar.
   - Under `prefers-reduced-motion: reduce`, skip the reel entirely and swap the card, keeping the charge fill as the only movement.
   - If the carousel has a cooldown or a daily quota, the bar doubles as the meter: dim and uncharged while it is spent, with the remaining time on it. That gives the control something to say instead of sitting there grey.

   A slider was the other idea floated. The pull bar is the same gesture with a slot-machine read, and it degrades to a button for taps and keyboards.
8. **Cruise Carousel photos stay 4:5** at every screen size. Keep the aspect ratio fixed and fit the card to the space around it rather than letting the photo crop or letterbox to whatever is left.

9. **Cruise Carousel top bar.** Strip it back to three things: the title, the back button, and the bug report button. Everything else that currently sits up there goes.

   Then lift those onto the photo itself rather than a bar above it: title and back button overlaid on the image, so the image grows into the space the bar used to occupy and fills more of the screen. That in turn frees the bottom of the screen for the browse-again control described in item 7.

10. **Crowds, in full.** Beyond "presets": each crowd gets its own SF and VC, the person names it, it is turned on and off through VC the way crowds are today, and it can be used as a reverse filter. One crowd by default, up to four with cruush+, acting as quick settings. They are selected and edited from a tab in edit profile, which needs a new menu. If someone has no crowd yet, the app should take them to that page to make one.

11. **Controls must be honest.** A control that cannot do anything should not be on screen at all, and a dark gradient reads as "not clickable". Pressing message on a profile that allows messaging must open that person's thread immediately, not sit there. The dead centre-pin case is fixed; the rest of this needs a sweep across the message pages.

12. **Adaptive sizing.** The menus read as cramped, and layouts should adapt to the width rather than squeeze. The Cruushes rows now wrap below 400px, but the same pass is owed across the message pages and the count grid, where labels such as "INCOMING" truncate to "INCOMI…".

13. **Notes about notes.** Every time a request has to be repeated, write it into memory that same turn, and tell future sessions to keep doing the same. Two memory files now cover this: `repetition-means-write-it-down` and `bump-the-service-worker-release`.

14. Reports that pressing cruush on incoming, and message on sent, did nothing were made against the broken `:5195` server. Re-test on `:5178` before treating them as bugs.
