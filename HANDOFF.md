# Pride flag badge fill, September 20, 2026

Branch `fix/pride-flag-badge-fill-20260920`, one commit on top of `d40a6be` (the commit production serves as of September 20). Worktree `/Volumes/good/Cruushv2-pride-flags-20260920`. Session queue `.ai-queues/bb234b23-d737-4f10-969e-de4810ea8842.md` in that worktree.

Julien's instruction: "I want the pride flags to fill the usual border for the badges, without changing the badge size or changing the badge border." Recorded in `DESIGN_DECISIONS.md` ("Pride flag badges keep the usual border, September 20, 2026"), superseding the September 10 rule that removed the border for flags.

Change, all in `src/app/components/BadgeFrames.tsx` (`BadgeFrame`):
- Flags keep the same stroke as every other badge (the stroke was set to none for flags).
- Flag artwork is rendered in a rounded HTML layer beneath the frame SVG, inset to the border's inner edge (radius 24 of the 64-unit frame), instead of a `foreignObject` inside the SVG that ran over the border. The browser painted that embedded layer above the stroke, which made the flag's border look thinner than an icon's. With the layer underneath, the stroke paints over the flag at full width, exactly as it does over an icon.
- Icons are untouched: they keep the 60 percent inset and the same frame.

Verified locally (this worktree's stack on port 5521, Cruushes list, 412px): a `flag rainbow` left badge and a `Switch` right badge both measure 35px with the same border; the flag fills to the inner edge (26.3px layer inside the 35px badge); the icon keeps its clearance. Not verified on the map pin at 29.75px other than by the same shared component.

Tests: `BadgeFrames`, `MapView`, `CruushActivity`, `SideBadgePair` suites pass (88 tests). Client build passes. `pnpm check:cruush-casing` passes.

To release with the crypto processor: merge this branch into the release branch, bump the service worker release (the five copies of the version string in `index.html`, `public/sw.js`, `public/service-worker-recovery.js`, `src/main.tsx`), and check one flag badge and one icon badge side by side on a profile card before shipping. No environment variables change.

# Spot reduction, September 12, 2026

Active task: `01a094d4-5fda-7853-85e5-ca7f5634e4bb`. Queue: `/Volumes/good/ai-queues/01a094d4-5fda-7853-85e5-ca7f5634e4bb/TODO.md`.

Worktree: `/Volumes/good/cruush-spots-major-reduction-20260912`; branch `codex/spots-major-reduction-20260912`; base `6b0fe06`. New ego lite space 70, p1. Local frontend 5204, API 3024, dedicated database `cruush_spots_review_20260912`. Full screenshot-based manual review is in progress, with actual coverage and decisions in the external VISUAL_REVIEW.md. Full-radius coverage remains incomplete. No publication requested. Local viewing overrides and screenshots must never be committed.

# Historical inherited handoff

# Authorized production release, September 10, 2026

User source: current task transcript line 411, “Deploy this fix ASAP”. Release only the verified owner pin/decoy fix, its tests and required worker-cache version update to v129. Both frontend and server builds, independent review, scoped commit/push, runtime identity and authenticated live mobile verification are required. No environment variables or provider settings change. Status: release in progress. Independent review by `/root/owner_pin_review` approved the exact owner-marker source and rendered evidence; server build, client build and four worker-version checks pass.

The preceding Stop hook incorrectly reported a missing correction write. C30 was written by Python in this turn, all three loaded files contain task01a08e63, and the sync receipt matches. The hook requires `noteIndex >= 0` from changed-file metadata or an apply_patch first target, so it missed that completed Python write. This is a tooling detection limit; no global hook was edited and no duplicate correction was added.

---

# Pre-release verification checkpoint (historical)

- Item: `OWNER-GHOST-CLUSTER-20260910`, local repair verified; production publication awaits explicit authority.
- Worktree: `/Volumes/good/cruush-owner-ghost-pins-20260910`; branch `fix/owner-ghost-pins-20260910`; base `031ab2d5b774a57db1d69e21fc78a2d96583f7ad`.
- Source: `/Users/julienlenaz/.codex/sessions/2026/09/10/rollout-2026-09-10T22-55-12-01a08e63-fb72-7070-886b-c162d77b31d9.jsonl:9`: “Now my icon an ghost mode decoy for signsd in user ar egone what did you do why would you put cluster pins there”. The attached photo shows counts at the owner/decoy link endpoints.
- Responsible change: `17d5b30bc90348283aabbeb5e6faf439dcde8210` removed the owner exclusion in `canClusterMarker` and replaced it with an unconditional inclusion. `MapHome` creates both `me` and `me-ghost-decoy` with `isCurrentUser: true`.
- Scope: exclude only the owner markers from people clustering. Preserve coordinates, artwork, gradients, photos, badges, animation, Ghost visibility deadlines, other-member clustering/spiderfy, Spot behavior and all running servers.
- Source repair is applied. Three existing cluster tests now require owner/decoy preservation, correct other-member counts and unchanged other-member Ghost expiry. No new test suite or product controls.
- Proof directory: `/Volumes/good/cruush-owner-ghost-pins-20260910-proof`. Includes immutable starting source snapshots, inherited unrelated contract and production mobile baseline.
- Production baseline: owner missing on desktop; both owner and decoy missing after changing the page to 412x915. The corrected-owner test fails on the unmodified baseline. Client build passes. The initial MapView run had 68 passes and one unrelated Ping-preview expectation failure; final findings below supersede that checkpoint.
- Final evidence: `final-focused-tests.log` has 8/8 focused checks passed; `final-client-build.log` passes. The broader initial MapView run had 68 passes and one Ping-preview failure; `baseline-ping-test.log` reproduces that same failure on the unchanged baseline. No unrelated test or Ping behavior was changed.
- Final render: browser-local compiled candidate on the authenticated `https://cruush.app/` route, 375x915, 412x915 and 1440x1000. Both owner hearts render individually at their original coordinates with `z-index: 41`; ordinary people clusters retain 40. `elementFromPoint` at each heart center returns that owner marker, and clicking each reveals its own preview. Real Zoom in/out controls increased zoom by more than 0.9 and returned within 0.01 of the initial zoom. All screenshots were opened and inspected. This is a local asset override, not production deployment; app writes and worker registration were suppressed inside that preview page only. Native Android remains unverified.
- A rendered check of the first exclusion-only patch showed a remaining count covering the real pin's click target. The added owner-only stacking condition fixes that demonstrated part of the same symptom without offsets, asset edits, or changes to other-member cluster behavior.
- Scope: only `MapView.tsx`, its existing tests, and required task/decision/worktree/FIXLOG records changed. C30 was updated in `/Users/julienlenaz/.ai/CORRECTIONS.md` and verified synchronized to both Codex and Gemini loaders. No server, asset, style-sheet, dependency, provider, or dev-server changes.
- Final next action: obtain explicit production release authority for this prepared fix. Before any authorized publication, complete the required publication review/server build and live version verification. No publication is authorized by this new report.
- Queue: this task has one item; earlier queues remain with their owning sessions. The inherited handoff below is historical, not this task’s active queue.
- User effort: one direct corrective episode, one reopened user-visible regression. Other episode metrics not reviewed.

---

# Historical inherited handoff

# Handoff: feat/free-feed-board

Worktree: `/Volumes/good/Cruushv2-free-feed-20260822`
Branch: `feat/free-feed-board`
Commit: `2bff9f9`, one commit, branched from `origin/main` at `f00fb48`
Task contract: `AI_TASK.json`, status `active`

**Read this first: the branch is 14 commits behind `origin/main`, which is now `4fec73e`. It must be rebased before anything ships. Conflict points are listed at the bottom.**

Nothing has been pushed. `feat/free-feed-board` does not exist on the remote. No deployment was run.

---

## What changed

### 1. The local feed is free to post

The cruush+ entitlement gate is gone from both sides.

`server/src/routes/posts.ts` — `POST /api/posts` called `requireCruushPlus`, which threw a 402 entitlement error reading "Upgrade to cruush+ to post on the local feed." It now calls `getCruushEntitlement` instead. The entitlement record is still read, because `ownerFullAccess` comes from it and is passed to the insert as `$16`.

`src/app/components/LocalFeed.tsx` — removed `canPost`, the `billingStatus` state, the billing loader, the plus-changed window event listener, and the upsell card, plus the imports that only served them. The composer, the crowd target chips, the Post button, and the `?compose=1` deep link are all unconditional now. 70 lines net removal.

Deliberately unchanged: the trust gate inside the insert CTE (`trust_score > 20`, no active suspension, no `feature_restrictions` row for `feed_posting`) and `moderateTextOrReject` on every post body.

### 2. Nude and faceless photos are allowed

`server/src/policy-mapper.ts` — the `adult_nudity` / `adult_explicit` branch rejected at confidence >= 0.85 on any surface except profile photos and private messages, with reason `nudity_outside_private_messages`. That rejection and its helper `adultExplicitProfilePhotosAllowed` are deleted. The branch now always allows, with reason `adult_nudity_allowed` outside profile photos and private messages.

`server/src/profile-photo-human-detection.ts` — `HUMAN_LABELS` was `human`, `people`, `person`. A close crop of a torso or a body part could miss all three, fail `hasHuman`, and get rejected as `profile_photo_not_adult_human`. It now includes body part labels: torso, back, chest, abdomen, thigh, hand, foot, skin, muscle, undressed, and the rest. Nobody has to show a face.

`server/src/policy-mapper.ts` — `profile_photo_not_adult_human` now allows on the `feed` surface with reason `non_human_feed_photo_allowed`, so object photos, gear, and toys post fine. It still rejects on `profile_photo`, so profile photos remain photos of the account holder.

`server/src/profile-photo-human-detection.ts` — the detector previously folded animals into the `profile_photo_not_adult_human` label. It now emits a separate `animal` label as well, so allowing non-human photos on the feed does not accidentally allow animals. Animals keep rejecting through the existing `animal` branch.

Untouched on purpose: `minor_present`, `minor_age_ambiguous`, `underage_sexual`, and the child face gate in `childFaceLabels`. None of them share a code path with the change above.

### 3. Desktop dock panel fixes

All in `src/app/components/DesktopDockPanel.tsx`.

- **Second resize grip.** There is now a grip on the top right as well as the bottom right. The drag mode is a union: `'move' | 'resize-top-right' | 'resize-bottom-right'`. The top right grip grows the panel right and upward, holding the bottom edge, so `y` moves by the height delta. Test ids are `desktop-dock-{slot}-resize-top` and `desktop-dock-{slot}-resize`.
- **Overlapping panels are clickable.** Both panels rendered with a hardcoded `z-50`, so whichever painted last always swallowed the clicks. Stacking is now per panel, from a module level counter, and `onPointerDownCapture` raises the pressed panel to the front.
- **More transparent.** `bg-black/80` to `bg-black/45`, `backdrop-blur-xl` to `backdrop-blur-2xl`, so the map reads through.
- **A panel can nearly fill the window.** `EDGE_GAP` 24px to 10px.

`src/app/components/MapSidePanel.tsx` — the header row was `pt-9 px-4 pb-3`, which wasted 36px above the content. Now `pt-2 px-3 pb-2`.

### 4. Reopening a closed side panel

`src/app/components/MapHome.tsx` around line 675. Real bug, reported and reproduced from the code.

The side panel opens from router history state `openSidePanel`. Closing it set the local state to `null` but left `openSidePanel: 'messages'` sitting in history. Navigating to the map again with the same intent produced an identical `requestedSidePanelView`, the effect's dependency never changed, so the panel never reopened. Visiting another page first changed the state object, which is why that path appeared to work.

The effect now consumes the request with a `replace` navigation that clears `openSidePanel`.

### 5. Edit Profile icon

`src/app/components/Settings.tsx` line 37. The Edit Profile row masked `humanity-profile-selected-winged-heart-symmetric.png`. It now masks `cruush-white.png`, the heart-with-a-heart-inside glyph. The mask is still filled with `var(--cruush-gradient)`, so the gradient is unchanged.

---

## Verification

Green:

- `vitest src/app/components/LocalFeed.test.tsx` — 15 passed
- `vitest src/app/components/Settings.test.tsx` — 17 passed
- `vitest src/app/components/MapHome.test.tsx` — 70 passed
- `vitest src/app/components/BottomNav.test.tsx` — 15 passed
- `server: vitest src/policy-mapper.test.ts` — 34 passed
- `server: vitest src/moderation-service.test.ts src/profile-photo-human-detection.test.ts src/moderation-provider.test.ts` — 72 passed
- `server: vitest src/app.test.ts -t "POST /api/posts"` — 2 passed
- `vite build` — succeeded

Tests updated to match the new behaviour, none deleted:

- `LocalFeed.test.tsx` — the two paywall tests became one test that a member without cruush+ can post.
- `server/src/app.test.ts` — the 402 test is gone; the creation test now runs with `cruush_plus_enabled: false`, so the success path itself proves free posting.
- `policy-mapper.test.ts` — the nudity rejection test asserts allow, plus new tests for object-allowed-on-feed, animal-still-rejected, and non-human-profile-photo-still-rejected.
- `MapHome.test.tsx` — the dock assertion moved from a `z-50` class to the inline z-index, and asserts the new top grip exists.

Pre-existing failures on `f00fb48`, not caused by this branch. Confirmed by stashing the whole diff and re-running:

- `server: app.test.ts > returns the authenticated profile on GET /api/profiles/me`
- `server: app.test.ts > upserts the authenticated profile on PUT /api/profiles/me`

Both differ by a `custom_condoms` profile field, 50 keys against an expected 49.

**Not verified: none of this has been rendered in a running app.** `npm run dev:local:seeded` exits immediately with "Cannot connect to local Postgres at localhost:5433/cruush", and Docker is not running on this machine, so the bundled Postgres could not be started. The free feed, the panel fixes, and the moderation policy have never been exercised against a live server. Per the standing rules that is not proof, and it is the main gap in this handoff.

---

## Before this ships

1. **Rebase onto `origin/main` `4fec73e`.** Four files conflict:

   - `src/app/components/LocalFeed.tsx` — upstream `e86ae30` "land the feed layout pass with its tests green" rewrote roughly 197 lines of this file. This is the real merge. Keep the upstream layout and reapply the paywall removal on top of it.
   - `src/app/components/MapSidePanel.tsx` — upstream `845e85f` deleted the view tabs and the `onViewChange` prop entirely. Take upstream's version and reapply only the `pt-9` to `pt-2` padding fix to the simpler row it leaves behind.
   - `src/app/components/DesktopDockPanel.tsx` — upstream `64ef8cd` already narrowed the grab strip for the same reason, to `left-1/2 top-0 h-8 w-24 -translate-x-1/2`. Prefer upstream's centred strip over the `left-0 right-20 h-6` version here, and keep the two grips, the per panel z-index, the transparency, and `EDGE_GAP`.
   - `src/app/components/MapHome.tsx` — five upstream commits touch it. The reopen fix is a small isolated effect and should reapply cleanly.

   `Settings.tsx` and all four server files have no upstream changes and should rebase clean.

2. **Start Docker and run `npm run dev:local:seeded`**, then actually click: post to the feed as an account without cruush+, drag and resize a panel from both corners, click an overlapped panel, close and reopen the messages panel without leaving the page.

3. **Amend the standing rules doc under `docs/`.** Invariant **G2** still reads "NSFW is allowed in the favorites gallery and in messages." The code now allows it everywhere. The doc and the code disagree until someone fixes the doc, and the file has an "Amending this file" procedure at the bottom.

4. **Environment variables:** none added, removed, or changed by this branch.

---

## Open questions the next session should ask

- **Which icon goes where.** The instruction landed as "use the heart-in-heart for cruushes only" and "the winged icon is for the feed and nothing else". Edit Profile currently uses the heart-in-heart, which may be wrong if that glyph is reserved for cruush actions. `BottomNav.tsx` lines 9 and 10 still use the winged heart for the Profile tab, which contradicts "nothing else", but the replacement was never named, so it was left alone rather than guessed at. `Changelog.tsx` line 59 also still describes the winged heart as the Profile icon.
- **Crowd targeting and the feed pin setting behind cruush+.** Agreed as the replacement for the removed paywall, never implemented. Crowd targeting would gate on `payload.crowdTargets.length > 0` in `POST /api/posts`; the pin setting would gate `locationPinVisibility` in `PUT /api/feed/settings`. Free members would stay on the current `mutuals` default.
- **Photo posts, reactions, and replies.** Designed, not built. The agreed layout is small square tiles welded into one 3.4rem block beside the body copy, tapping opens a full screen viewer, DL Mode masks them the same way it already masks explicit author avatars. Measured at 380px card width, that layout costs 29px of card height against a 143px text-only post.
- **Stream Feeds.** Investigated and recommended against. Stream is already a dependency but only as the moderation provider. Feeds is a separately priced product; a moderation plan does not include it. The feed's encryption, hashed crowd tokens, geo queries, trust gating, and expiry do not port to their follow-graph model.
