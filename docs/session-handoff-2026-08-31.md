# cruush 1.6 session handoff

Date: 2026-08-31

Status: reactivated by direct user instruction on 2026-08-31. Local work and one local candidate commit are authorized. Push, deployment, provider calls, server process changes, and new account writes are not authorized.

## Exact workspace

- Checkout: `/Volumes/good/Cruushv2-release-1.6-20260828`
- Repository: `cruush-social/Cruushv2`
- Branch: `release/1.6-features-20260828`
- Canonical task contract: `/Volumes/good/Cruushv2-release-1.6-20260828/AI_TASK.json`
- Canonical master to-do: `/Volumes/good/Cruushv2-release-1.6-20260828/docs/todo-execution-plan-2026-08-29.md`
- Canonical design guide: `/Volumes/good/Cruushv2-release-1.6-20260828/docs/design-master.md`
- Local preview frontend observed at `http://localhost:5173/`
- Local preview API previously observed at `http://127.0.0.1:3016`
- Local preview database: `localhost:5432/cruush_release_16_preview`
- Local development login only: `admin@cruush.local` / `admin-password`
- Production remains untouched.

## Read first in the new session

1. `/Users/julienlenaz/.ai/AI_CONTRACT.md`
2. `/Volumes/good/Cruushv2-release-1.6-20260828/AI_TASK.json`
3. `/Volumes/good/Cruushv2-release-1.6-20260828/docs/CRUUSH-RULES.md` <!-- ai-contract-allow-product-example -->
4. This handoff.
5. `/Volumes/good/Cruushv2-release-1.6-20260828/docs/todo-execution-plan-2026-08-29.md`
6. `/Volumes/good/Cruushv2-release-1.6-20260828/docs/design-master.md`

Do not trust an older session summary over the current task contract or a newer direct user instruction.

## Reactivation state and authority

- `AI_TASK.json` is active.
- Julien explicitly requested continued work through the 1.6 to-do and authorized one local candidate commit.
- The ego-lite task space used immediately before this handoff was closed with `keep:false`.
- No push, merge, deployment, or publication is authorized.
- Do not start, restart, stop, kill, or replace any frontend or API process unless Julien explicitly requests that exact process action.
- Do not claim the complete 1.6 list is done. Large portions remain visually or behaviorally unverified.

## Current user priority at the interruption

Julien asked to pause screenshot verification, continue backend work on the master to-do, and create or update a master design document describing the shared user preview unit used by Feed posts, message previews, cruush activity, Spots, Who's Here, and people chooser surfaces.

That design-document request was completed. Backend diagnosis was in progress when Julien stopped the session.

## Work completed in the final continuation

### Shared user preview design contract

Updated `docs/design-master.md` with a new `Shared User Preview Unit` section. It defines `UserActivityCapsule` as the canonical compact person presentation across Feed, Messages, Cruushes, Spot boards, Who's Here, and person pickers.

The documented fixed hierarchy is:

1. Canonical heart at left.
2. Side badges directly below the heart.
3. Name and pronouns leading the identity block.
4. Activity metadata stacked below identity.
5. cruush, Pin, and message-arrow actions aligned right when the surface supports them.
6. Surface content in one shared content slot.
7. Optional expiry, Delete, Report, or Block control in the surface-owned corner or action area.

The design guide now records these rules:

- Compact previews show badges, not vibe capsules.
- Vibe tags remain on profile views and profile editing only.
- Feed uses the shared content slot for post text.
- Messages use the same slot for the last-message preview.
- cruush activity uses the same structure without inventing a second card language.
- Chooser rows use whole-row selection with `aria-pressed`; nested controls must not trigger row selection.
- Distance displays only when viewer authorization permits it.
- Border and state color semantics remain shared across surfaces.

Canonical implementation sources are documented as:

- `src/app/components/UserActivityCapsule.tsx`
- `src/app/components/HeartPhoto.tsx`
- `src/app/components/SideBadgePair.tsx`
- `src/app/components/ProfileActionTrio.tsx`
- `.cruush-user-activity-*` selectors in `src/styles/theme.css`

### Focused backend contract diagnosis

The following six named checks were run together before the stop:

```sh
pnpm exec vitest run src/app.test.ts src/profile-schema.test.ts src/map-pings.test.ts \
  -t 'rejects profile photos without adult-human proof|never stores the capability URL|filters blocked relationships from GET /api/posts|returns cruush activity from GET /api/cruush|limits explicitly capped profile option groups|requires a moderated signal'
```

Result: 3 passed, 3 failed. The test name filter skipped 328 unrelated cases.

Passed:

- Media upload persistence did not store the capability URL, capability token, object key, final URL, or original filename.
- `GET /api/posts` filtered blocked relationships at the query boundary.
- Map Ping required a moderated Signal and a sender inside the beta service area.

Failed:

- Profile photo without adult-human proof expected HTTP 400 but received HTTP 201.
- cruush activity response fixtures lacked the new `travelling: false` field in received and sent user objects.
- Profile schema fixture expected Position to accept one value, while the current server and Profile editor intentionally allow three.

### Mechanical fixture updates applied but not rerun

`server/src/app.test.ts` was updated so the received and sent cruush activity fixtures include `travelling: false`.

`server/src/profile-schema.test.ts` was updated to describe current server and editor caps. Position and Role now expect the last three values from a four-value input, matching `upToThreeArrayField` and the current Profile editor `maxSelections=3` behavior.

These two edits were not rerun because Julien stopped the session. They remain unverified.

## Resolved profile-photo safety decision

`docs/CRUUSH-RULES.md` G2 is authoritative: a profile photo may show the account holder, <!-- ai-contract-allow-product-example -->
any part of their body without requiring a face, or their gear. The gear-only path remains allowed
while every independent prohibited-content, one-person, same-person, and child-face rule remains
enforced. The six focused moderation and response checks and the complete server suite pass under
this rule.

## Earlier completed work and evidence that must be preserved

### Side Quests and rewards

- Local migrations `106_side_quests.sql`, `107_side_quest_first_ping.sql`, and `108_side_quest_catalog.sql` were applied atomically to `localhost:5432/cruush_release_16_preview`.
- The final earned-reward guards were present.
- Existing grant count and total cruush+ days were unchanged by migration application.
- Rewards rendered up to four active Side Quests below Invite people you trust.
- Julien authorized one exact local Side Quest claim. The authenticated admin claimed Send your first
  message once, received one banked cruush+ day plus one notification, and the quest moved under
  Recent rewards while its replacement appeared for the next day.

Older reward-notification restoration implemented:

- Owner-only `GET /api/rewards/grants/:grantId`.
- Read-only owner-bound `getOwnedRewardGrant` query with no entitlement mutation.
- Client `getRewardGrant` support.
- `EarnedCruushPlusCards` loads the exact grant rather than relying on the recent-20 summary.
- Route and component tests were added.

Prior focused evidence: 37 tests passed across Rewards, scratch-card navigation, the reward route, mocked Resend, and key-rotation/media validators. Full suite and build were not run after the latest changes.

### cruush+ scratch card

- The recovered scratch-card source from `/Volumes/good/cruush-card-recovery-20260829/HANDOFF.md` is present in this checkout.
- Preserve its exact recovered interaction and approved visual assets.
- Do not approximate, redraw, or replace the card.
- Julien's separate scratch-card work remains authoritative where newer.
- The earned-card popup now fills the complete viewport on desktop and mobile while preserving the
  recovered card, scratch, flip, Close, and Done behavior.
- Authenticated claim-to-card proof passed at 390x844. Fullscreen bounds passed at 1440x900,
  390x844, and 412x915. Reduced-motion media disables card and pattern animation plus confetti.

### Map provider and production issue #141

- Production still serves a bundle with a CARTO raster fallback.
- That provider can return a PNG visibly saying `API KEY REQUIRED`.
- The local candidate uses the approved OpenFreeMap vector path only.
- Initial empty-render error clearing was fixed in the candidate.
- Production was not changed and issue #141 was not closed.
- Do not claim the production map is fixed until the intended SHA is deployed and the authenticated rendered map is inspected.

Prior focused evidence:

- Six targeted MapView checks passed for vector-only behavior, CARTO exclusion, empty-canvas recovery, and owner Mile High Club decoy behavior.
- A broader MapView file previously retained unrelated stale expectations and reported 14 failures. Four obsolete raster expectations were replaced, but remaining marker and geometry expectations require separate reconciliation.

### Ghost Mode and Mile High Club

- Owner Ghost decoy refresh gained missing or stale deadline handling.
- Focus, online, and visibility catch-up behavior was added.
- Final-minute pulse and exit scale were applied.
- Reduced-motion and owner decoy Mile High Club presentation preserves the static approved plane frame rather than replaying the full traveller animation.
- The exact live Ghost fly-out remained visually unverified.
- Combined Ghost plus Mile High Club state must derive the decoy from the active Mile High Club location, not the saved device location.
- Preserve the approved static frame, canonical heart geometry, and no extra heart border.

### Spots

The current implementation and master to-do contain substantial completed Spots work, including the combined required-message board-post check-in, durations, optional Who's Here visibility, map presence, board content, and map viewport loading. Preserve it.

Previously reported local evidence includes:

- One combined required-message check-in form.
- Durations of 1h, 3h, 6h, 12h, and 24h.
- Optional canonical Who's Here checkbox for the same duration.
- No photo control.
- Board post, board read, post cleanup, and check-in cleanup API smoke actions succeeded locally.
- Ginger's Bar remained visible after two consecutive zoom-ins.

Do not treat these historical checks as proof for the current uncommitted state. Reverify only when the task is reactivated and verification is requested.

### Deferred custom Crowds

- Custom saved Crowd work is excluded from 1.6.
- Preserve it separately under `/Volumes/good/cruushv2/custom-crowds-20260830`.
- Keep the deployed fixed Crowd behavior.
- Keep the Crowd icon out of the 1.6 top navigation.

## Ego-lite state immediately before stop

- One isolated ego-lite task space was created for screenshot verification.
- `http://localhost:5173/` loaded at 1625 by 963.
- Local seeded sign-in succeeded with the local-only administrator credential.
- The authenticated map rendered seeded members, Spots, current and decoy pins, a Ghost rotation timer, map controls, and navigation.
- Julien interrupted before claim-matched screenshots were captured.
- The ego-lite task space was closed with `keep:false`.

This is observation only. It is not final screenshot proof for affected routes.

## Dirty worktree warning

The checkout is heavily dirty with user and prior-agent work across client, server, SQL, docs, assets, configuration, and generated Vite cache files. `git status --short` reported well over one hundred modified or untracked paths.

Never:

- Run `git reset --hard`.
- Run `git checkout --` over broad paths.
- Clean the worktree.
- Delete untracked files as presumed generated junk.
- Revert whole files that contain mixed work.
- Cherry-pick or merge without a file-by-file scope audit.

Treat every existing change as user work unless exact provenance proves otherwise.

## Exact restart sequence

After Julien explicitly reactivates the task:

1. Set `AI_TASK.json` status back to `active` and record the new exact objective and proof limits.
2. Confirm the same checkout and branch still exist. Inspect the dirty worktree without cleaning it.
3. Read the current master to-do and design guide. Do not reconstruct requirements from chat alone.
4. Resolve the gear-only profile-photo policy before editing the remaining moderation failure.
5. Rerun only the six focused backend checks above after the decision and fixture updates.
6. Record exact pass, fail, and skipped counts. Do not call a safety behavior fixed from a fixture edit alone.
7. Continue backend items from `docs/todo-execution-plan-2026-08-29.md` in small isolated batches.
8. Keep screenshot verification paused until the user requests it or backend work reaches the agreed verification gate.
9. If screenshot verification resumes, read the ego-browser skill, create a fresh isolated task space, use the exact local frontend/API pair, sign in with the local-only seed account, capture the requested routes and states, then close the task space.
10. Before any release claim, separately report source status, focused tests, build, authenticated rendered behavior, remote SHA, deployment state, and production behavior.

## Evidence status at stop

| Area | State | Evidence |
| --- | --- | --- |
| Shared preview design guide | Implemented, not rendered | `docs/design-master.md` updated with canonical hierarchy and surface rules |
| Backend six-check batch | Partial | 3 passed, 3 failed before fixture edits |
| cruush activity fixture | Edited, unverified | `travelling: false` added to received and sent fixtures |
| Profile selection caps fixture | Edited, unverified | Position and Role aligned to current three-selection behavior |
| Profile gear-only moderation | Resolved and tested | `docs/CRUUSH-RULES.md` G2 allows gear-only photos while independent safety rules remain enforced | <!-- ai-contract-allow-product-example -->
| Side Quest migrations | Applied locally previously | 106, 107, and 108 applied to the dedicated local preview database |
| Side Quest real claim | Verified locally | One Send your first message claim created one banked day, one notification, a Recent rewards row, and the next quest |
| Scratch card | Verified locally | Exact scratch, reveal, flip, benefits, Done, Close, reload, reduced motion, and full-viewport desktop/mobile states passed |
| Spots | Substantial local implementation present | Earlier focused browser and API evidence; current whole state not rerun |
| Complete client suite | Passed after follow-up UI work | 94 files, 646 tests |
| Complete server suite | Passed with intentional live-provider skips | 100 files and 951 tests passed; 3 files and 14 tests skipped |
| Production builds | Passed | Latest client Vite build transformed 2078 modules; server TypeScript build passed before the CSS-only follow-up |
| Static release gates | Passed | Security, public-copy casing, Coolify release-script, and whitespace checks |
| Layout invariant gate | Passed | Mobile, tablet, and desktop checks passed against `http://localhost:5173/` |
| Exact local pair | Passed | Frontend 5173 proxied a 200 local-only admin login to API 3016; authenticated session and development build reads returned 200 |
| Ghost plus Mile High Club | Source changes present | Targeted checks passed earlier; exact fly-out remains visually unverified |
| Local authenticated map | Observed before stop | Loaded in ego-lite; claim-matched screenshots not captured |
| Full client/server suite | Not run | Explicitly incomplete |
| Current production | Unchanged | No deploy or live fix claim |

## Completion truth

The complete cross-handoff 1.6 master list is not proven done. The authoritative list is `docs/todo-execution-plan-2026-08-29.md`. Items without current claim-matched source, focused checks, and required rendered proof remain open or unverified even if an older session reported them working.

The next session must preserve this distinction:

- Implemented in source.
- Focused checks passed.
- Authenticated rendered behavior verified.
- Production deployed and verified.

These are separate gates.
