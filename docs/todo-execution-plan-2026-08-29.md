# cruush 1.6 reconciled to-do, 2026-08-29

## Authority and status

This is the current master list. New direct instructions from 2026-08-29 override older
handoff details where they conflict. A checked source item is not visual proof. Nothing in
this list authorizes a commit, push, merge, deployment, production migration, server process
change, dependency, provider, or environment change.

Status:

- `[ ]` missing or not proven complete.
- `[~]` source exists or was patched locally, but the real interaction is not visually proven.
- `[x]` verified in the real affected flow at the stated viewport.
- `[deferred]` deliberately removed from the 1.6 release scope; preserve the work separately.
- `[blocked]` needs an exact source, supplied asset, product decision, migration authority, or
  release authority.

## Current stop point, 2026-08-31

- `[x]` The rejected Cruise Carousel pull-bar lab, preview query, and development route were removed.
  Cruise Carousel retains the current Browse again button unchanged.
- `[x]` The Android message composer now meets the top of the bottom-navigation pill with a measured
  `0px` gap at `412 x 740`; the input and composer do not overlap the pill, and horizontal overflow
  remains absent. Keyboard-open positioning keeps its prior keyboard inset and padding. The supplied
  screenshot and rendered fix were inspected together in a normalized comparison.
- `[x]` Text messages now leave the composer immediately when Send is pressed while the optimistic
  bubble confirms the action. A synchronous guard blocks duplicate submissions. Failed sends restore
  the submitted draft only when the member has not started another message. The real seeded flow
  passed at desktop and 390x844, and all 29 conversation tests passed. Both temporary messages were
  deleted afterward. The production client build passed with 2077 transformed modules.
- `[~]` All seven open GitHub bug reports were rechecked against the current 1.6 candidate. #140 was
  reproduced exactly at 390x844: unchanged Visibility Controls Apply returned `Request validation
  failed` because the profile schema rejected canonical app-owned profile-photo URLs. The corrected
  path validator and visibility-route regression pass, the server build passes, and the authenticated
  mobile retry closed the sheet without an error. #136's definite-height scroll container, #137
  through #139's viewer-authorized discovery filtering, and #141's vector-only map path exist in
  current source. #135 has no screenshot, affected surface, or reachable reporter, so changing
  checkbox visuals would require an unapproved design guess. Safari 18.6 proof for #136 and
  production proof for #141 remain open. No GitHub issue was commented on or closed.
- `[x]` Opening `/survey` while signed out renders the existing Sign In screen. Signing in returns
  directly to the survey after required account gates. The real local flow passed at 412x740 and
  desktop size, the focused App routing test passed, and the generic support endpoint rejects
  signed-out survey writes.
- `[~]` A signed-in member is limited to one open or in-progress survey response. The client blocks
  repeated in-flight submission and removes the form after success; the server returns the existing
  active response after a uniqueness conflict. Migration `109_survey_response_uniqueness.sql`
  preserves historical rows, dismisses older active duplicates, and installs the partial uniqueness
  index. Focused component, route, and migration-source checks pass. Migration 109 has not run.
- `[~]` Bug reports now filter age suspension appeals, use the complete filtered count, page beyond
  25 rows, and map unexpired ID and selfie evidence to the existing moderator-only preview route.
  The empty/error filter state rendered cleanly at mobile and desktop sizes, and focused client and
  server checks pass. A populated evidence card and production appeal count remain unverified.

- `[~]` Focused checks are authorized by "fix the stuff". The subsequent "keep working" answered
  the specific request for local migrations 106 through 108, which are now applied. No other
  migration, server process change, provider configuration, commit, push, or deployment is authorized.
- `[~]` Scratch-card pointer scratching, keyboard reveal, flip, and Done dismissal were exercised
  with the exact imported component. A real clipping bug was reproduced: focusing Flip scrolled
  the hidden card stage upward. The isolated stage now uses `overflow: clip`; desktop 1280x720 and
  mobile 375x812 showed the complete card after flipping with stage scrollTop remaining zero.
  This was an isolated component check, not a real reward grant or purchase. The temporary check
  page is removed after inspection. The signed-in account has no Recent rewards, so actual grant,
  notification replay, onboarding, and purchase flows remain unverified.
- `[~]` GitHub #141 is traced to the deployed bundle's CARTO raster fallback. The served
  `/assets/MapHome-DSxW3OjS.js` includes CARTO tile URLs, and the provider returned HTTP 200 with
  a PNG visibly reading "API KEY REQUIRED". The 1.6 candidate retains OpenFreeMap vector tiles
  and rejects the old fallback. A separate loading defect is fixed: an empty render can no
  longer clear an initial tile error. Source regressions cover failure, slow load, recovery,
  and ignored retired raster flags. Production has not been changed; #141 is not closed.
- `[~]` Sixteen focused tests passed: eight scratch/reward-navigation cases, six vector/Ghost
  marker cases, and two Ghost refresh cases. The initial broader MapView file had 14 failures;
  four obsolete raster cases were replaced with assertions for the approved vector-only behavior.
  Other failures involving old marker labels/badges, Ghost mount behavior, mask geometry, and
  clustering expectations remain unresolved. No tests were deleted or disabled to pass a gate.
- `[~]` The exact Ghost component accepted a fresh deadline, and the owner MHC pulse/exit test
  proves its static plane is preserved. Browser attempts did not capture the brief fly-out;
  animated-frame proof and a complete real decoy-rotation cycle are still open.
- `[x]` Migrations 106 through 108 committed together on localhost:5432/cruush_release_16_preview.
  The exact database and loopback server were checked first. Existing earned-reward guards were
  present; existing grant count and total days were unchanged. No full migration replay ran.
- `[~]` The authenticated Rewards page now loads four Side Quests, with completed quests showing
  enabled Claim controls and unfinished quests disabled. Seven Rewards tests pass, including
  stale-refresh protection, four-card replacement, daily lock state, and focus refresh.
- `[blocked]` The real first-message quest claim was rejected by the browser safety boundary
  because it grants one day of account time and creates a notification. No workaround or grant
  was performed. Explicit approval of that local account mutation is still required. The browser
  later returned to sign-in, so authenticated follow-up also needs the session restored.
- `[~]` Older reward notification links now use `/api/rewards/grants/:grantId`, an authenticated,
  owner-bound read independent of the latest 20 grants. The response omits private audit fields;
  missing or non-owned grants return 404. Reversed grants do not open the card. Replay never
  activates or extends an entitlement. Eight client checks and two focused route checks pass.
  The real historical-notification interaction remains unverified.
- `[~]` Five Resend reconciliation tests pass with mocked requests, including provider backoff,
  ambiguous-create lookup, authorization failure, and address-free error logging. No live provider
  operation was performed.
- `[~]` The targeted `key-rotation.test.ts` and `media-read-validator.test.ts` pair passes all
  15 tests together. This covers old/new key reads, missing-key failure, media ETags, authenticated
  304 responses without object reads, and anonymous denial. No real key was changed. This paired
  run does not establish that broader full-suite order dependence is resolved.
- `[~]` Two concrete Vitest worker leaks are removed. The live Rekognition test now reads local
  credentials without copying every `server/.env` value into `process.env`, and the mailer test
  files restore their global `fetch` stubs after every case. A forced single-worker run passed
  27 tests across the mailer, support-mailer, Rekognition configuration, key-rotation, and media
  validator files; three live AWS checks stayed skipped because no credentials were present. The
  complete server suite remains unrun, so no claim is made that every order-dependent failure is gone.
- `[~]` Five focused Feed-media backend checks pass. Photo posts reject Basic members, reject media
  that is not approved, owner-bound, and unattached, insert approved attachments in request order,
  serve attached public media only to an authenticated unblocked viewer, and deny a viewer outside
  the post's Crowd audience. The upload moderation/provider path and rendered crop, mask, viewer,
  Report, and Close interactions remain unverified.
- `[~]` Server TypeScript no-emit check passes after two test-only fixture corrections. The
  owner-bound reward-route mock now satisfies the generic database interface, and the Mile High
  Club location fixture now uses the current version, subject, GPS source, and key-version fields.
  Both focused files pass 14 tests. Runtime behavior is unchanged.
- This continuation passed 37 focused tests in total. Full builds and the complete release suite
  were not run. The agent-created Rewards tab was closed; user tabs and server processes were retained.
- Product-name validation and the scoped whitespace check passed. No environment variables changed.
- `[x]` The final local candidate gate passed 93 client files with 644 tests and 100 server files
  with 951 tests. Three live-provider server files and 14 tests remained intentionally skipped.
  Client and server production builds, security, public-copy casing, Coolify release-script, and
  whitespace checks passed. The layout invariant check is blocked because no existing frontend is
  reachable at `http://localhost:5173`; the active contract forbids starting or replacing a server.
  No account write, provider request, process change, push, deployment, or production change ran.

### Prior source-only continuation, 2026-08-30

- `[~]` Latest continuation restores the existing Ghost pulse scale during the final minute.
  Owner decoy refresh retries missing or stale deadlines and catches up after focus, reconnect,
  or foreground resume. Motion-preference changes clear frozen flash/exit state. The exact MHC
  plane and its static decoy frame remain unchanged. A focused regression case is written but
  unrun; the reported local failure still needs runtime reproduction and proof.
- `[~]` Julien supplied and explicitly reopened integration of the scratch-card handoff. The
  selected prototype's moire CSS, scratch foil, confetti, tilt, flip, chrome text, and duration
  styling are now ported into an isolated real dialog. No prototype page, sample grant, alternate
  artwork, or simulated activation timer was copied. Desktop remains 3:2 and phone remains 2:3.
  The card uses the existing shared benefit copy, which still needs release-copy reconciliation.
- `[~]` Confirmed Side Quest/promo grants, post-onboarding reward lookup, and earned-reward
  notification links can open the shared scratch card. The URL carries only a grant ID; the
  amount is read from the authenticated reward summary. Reversed or missing grants do not open.
  Done stores a per-member/per-grant presentation acknowledgement, not a new entitlement.
  Notification replay currently resolves grants present in Recent rewards; older history is
  still an open integration edge. Existing one-time-dialog queuing prevents prompt overlap.
- `[~]` Checkout success preserves the session ID for card lookup and renders a purchase card
  only for that member's server-confirmed completed checkout. It does not complete payment or
  enable the retired checkout UI. Current billing still exposes the fake processor contract;
  real purchase integration and all card interactions remain unverified.
- `[blocked]` GitHub issue [#141](https://github.com/cruush-social/Cruushv2/issues/141) reports
  “API key required” across an iPhone map. The current 1.6 source defaults to key-free OpenFreeMap
  vector tiles and does not contain that message or a keyed tile provider. The report has no
  screenshot or build identifier. Identifying the affected served bundle and tile request needs
  read-only runtime inspection, currently excluded by the code-only instruction. No provider,
  key, live configuration, or GitHub issue state was changed; this issue is not marked fixed.
- `[~]` Ghost rotation now has the requested 15-minute, 30-minute, and hourly-through-24-hour
  options using the existing selector. The preference and schedule stay in the encrypted
  visibility policy. A cadence edit retains the current epoch, decoy, and deadline, then begins
  the new interval on the next rotation. Legacy profiles retain 15 minutes. No migration is
  needed; no map artwork or coordinate-derivation changes were made. Focused regression source
  covers cadence changes and supported/default intervals; API, ciphertext, and rendered proof
  remain unverified.
- `[~]` Side Quests refresh through the existing read endpoint while Rewards is visible and on
  return to the page. Background failures retain the displayed list. Claims have a synchronous
  duplicate-request guard and invalidate older reads before updating eligibility and Recent
  rewards. Refreshing does not claim a quest or create another daily check-in. Two focused
  regression cases are written but unrun.
- `[~]` Missing mechanical fixtures from handoff `ba6ce50` are restored: the message-media mock
  supplies `DetectTextCommand` and the sensitive-profile fixture includes `birth_control`.
  Existing cruush permission fixtures were already present and remain untouched. No safety
  assertion was removed or weakened; the test suite has not run.
- `[~]` Missing SEO handoff source is now ported from `0cac0a6` through `1bae38a`: public
  About, Help, and Blog documents, styles, handwritten sitemap, robots and llms files, landing
  metadata, exact JSON-LD hashes, request-URI indexing rules, and matching Vite static routes.
  Existing Vite proxy/cache settings and service-worker release identifiers are retained.
  Three unmatched closing tags from the supplied static pages were removed without changing
  their copy or JSON-LD. Built CSP hashes, public-copy currency, route headers, and rendered
  layouts remain unverified. No build, server process command, or publication ran.
- `[~]` Missing local media-handoff source is now ported from the reviewed `c89f3f7` and
  `005a9d4` hunks. This includes authenticated ETag revalidation, daily-digest read observation,
  health-log filtering, and previous-key selection. New Feed-media authorization and current
  location/privacy work are preserved. Nine optional previous-key fields are documented in
  examples, but no live or local secret values changed. Existing handoff tests are restored;
  no tests, migrations, provider requests, or publication ran.
- `[~]` Resend audience synchronization now paces and bounds requests and retries, preserves
  existing contact preferences, and avoids logging email addresses. Source and focused regression
  cases are present; provider behavior remains unverified.
- `[~]` Spot report links now preserve `placeId` and `placeMessageId` rather than opening an
  untargeted report. Embedded Spot and board-post reports reuse the existing report form inside
  the same popup, with Back returning to the board. Other report-dialog surfaces are unchanged.
  This is source-only; no report was submitted and no interaction proof ran.
- `[~]` Source-only popup and Spot continuation: docked panels fit narrow viewports even below
  their normal minimum width, reject non-finite saved geometry, preserve their bottom edge during
  top resizing, and end interrupted drags. Spot changes clear old content; rating, clear-rating,
  checkout, and board deletion now serialize mutations and surface failures without changing a
  different Spot. Embedded ratings replace the board inside the existing popup and Back returns
  to the board. Rendered interactions and mutation proof remain unverified; no tests or writes ran.
- `[~]` Latest badge-spacing correction moves the smaller map badges 2px outward from the
  previous flush placement so they float beside the heart without touching. Badge size and
  vertical placement are unchanged. The current local map was visually inspected; the full
  marker-state and viewport matrix remains unverified.
- `[~]` Map side badges are now 15% smaller (29.75px instead of 35px), retaining the lower
  70% position and moving inward to compensate for the removed width. Hearts remain 80px;
  Feed and message badge sizes are unchanged. The populated local map was visually inspected
  at its current viewport. The complete marker-state and viewport matrix remains unverified.
- `[~]` Latest placement correction moves map side badges 6.4px lower and 6px inward per side
  at rest. Hearts remain 80px and badges remain 35px; existing hover behavior is preserved.
  This supersedes the restored original badge spacing below. Rendered spacing is unverified.
- `[~]` The requested 15% map-heart increase was canceled and reverted. Hearts remain 80px,
  badges remain 35px, and original spacing is restored. Own pins now use the same 1.38 hover
  enlargement as other people, including the signed-in member's Ghost decoy. Artwork, click
  behavior, Feed/message sizing, and non-person markers are unchanged. Hover proof remains pending;
  no tests or previews ran.
- `[~]` Feed photo reporting now renders above the photo viewer. The viewer handles Escape,
  arrow-key photo changes, contained Tab focus, and returning focus on close; nested Report dialogs
  retain their own keyboard handling. Source-only, with interaction proof pending.
- `[x]` Spot detail, board pagination, and check-in callbacks ignore stale responses after a
  different Spot is selected. Three focused regression tests prove that a late detail response
  cannot replace the selected Spot, a late board page cannot append to another Spot, and a delayed
  location result cannot submit the old Spot check-in.
- `[~]` Spot dialogs hide scrollbar chrome while retaining scrolling. Rendered scrolling proof
  remains pending.
- `[~]` Shared people cards now keep hearts at the map's unchanged 80px resting size and use
  the map's shared 35px badge constant. Pinned-message hearts also use 80px. Container-dependent
  heart and badge scaling is removed; map hover enlargement and full profile photos are untouched.
  This sizing pass is source-only and still needs rendered proof.
- `[~]` The signed-in member's active-MHC Feed profile heart uses the exact existing MHC
  renderer paused at frame 420. It replaces the underlying solid heart stroke without changing
  photo crop or heart size. Other HeartPhoto uses remain unchanged. Rendered proof is pending.
- Source-only work resumed after the Custom Crowds boundary. No tests, builds, browser checks,
  migrations, server changes, commit, push, or deployment were run during this pass.
- `[~]` Mile High Club sky-blue side-badge treatment is wired into Feed, Spot board, Messages,
  New Message, New group, and Cruushes data/card paths. The main heart remains on its normal
  signed-in, mutual, or nearby treatment. Rendered proof is pending.
- `[~]` Spot board cards now receive Mile High Club state from the server and use the shared
  people-card treatment. Rendered proof is pending.
- `[~]` Saved Custom Crowds source is preserved under
  `/Volumes/good/cruushv2/custom-crowds-20260830`. Its migration, owner-only API, encrypted service,
  discovery/Profile/Feed access predicate, and editor remain unverified and deferred from 1.6.
- `[x]` Direct 2026-09-01 correction removes every Crowd Mode update from 1.6. The branch-only
  dedicated Crowds sheet and Hydra assets are removed; the existing main-branch Crowd Mode remains
  inside Visibility and its active notice returns there. At 390x844, Visibility rendered the
  existing Crowd Mode section with no separate Crowds dialog. Three focused files passed 93 tests,
  and the production client build passed with 2077 modules.
  The current numbered migration 109 is the unrelated survey-response uniqueness guard.
- `[~]` Who's Here now uses the shared people card with pronouns, badges beneath the heart,
  relationship-aware heart colors, and MHC side-badge color. The server retains the existing
  active opt-in and bidirectional block filters. The remaining mutual picker also carries MHC
  side-badge color. API and rendered proof are pending.
- `[~]` Spot board and Who's Here avatars now use the existing DL Mode masking rule and
  server media classification instead of hardcoded unmasked photos. Missing classification
  retains the existing conservative masked treatment while DL Mode is active.
- `[~]` Published Spots load through independent 500-item map pages after the camera settles;
  the 50-item drawer never writes map marker state. Focused regression proof covers multi-page
  deduplication and viewport bounds, including an antimeridian crossing. Rendered pan/zoom proof
  remains pending.
- `[~]` Exact-coordinate Spot groups now use the existing pixel-only spiderfy behavior instead of
  stacking after cluster zoom. People and Spots remain independently grouped; desktop source opens
  the Spot board popup and mobile source routes to `/places/:placeId`. Rendered selection proof is
  pending.
- `[~]` The published-Spot list enforces the exact 100-mile request and NYC service-area boundaries.
  All five sort modes now end in a unique ID tie-breaker so offset pages remain stable when ranked
  fields tie. Six focused route cases pass; rendered filters and search remain pending.
- `[~]` Add Spot remains one suggestion form fed by the member's current cruush map pin. New
  suggestions persist only an encrypted envelope and neutral placeholders; duplicate supporters use
  scoped HMAC tokens, shortlist at three, and publication requires moderator access. Five focused
  privacy and route checks pass; no real suggestion was submitted.
- `[~]` All six Spot rating categories validate 1–5 stars. Clear my ratings binds the selected Spot
  and authenticated member. Popular Times returns only 90-day weekday/hour buckets whose aggregate
  reaches three check-ins. Nine focused checks pass; no real rating changed.
- `[~]` Combined Spot board/check-in writes accept only 1h, 3h, 6h, 12h, or 24h. The same duration
  controls both expiries, Who's Here remains opt-in, and expired board/check-in rows are excluded and
  cleanup-indexed. Ten focused checks pass; no real check-in or board post changed.
- `[~]` Side Quests no longer says every quest is completed when only temporarily unavailable
  cruush+ rewards remain. The weekly limit remains absent from visible copy.
- `[ ]` Continue the remaining 1.6 source items at Spots, MHC/Ghost/Pulse, shared cards, popups,
  Feed media, and release blockers. Custom Crowds and the user-owned scratch card stay untouched.

## Sources reconciled

- `docs/parallel-work-handoff-2026-08-22.md`
- `docs/travel-mode-handoff-2026-08-22.md`
- `docs/visual-pass-handoff-2026-08-22.md`
- `docs/plans/2026-08-22-free-feed-handoff.md`
- `docs/plans/2026-08-22-feed-layout-handoff.md`
- `/Volumes/good/Cruushv2-places-board-20260828/docs/plans/2026-08-28-map-improvement-handoff.md`
- `/Volumes/good/custom-crowds-spots-handoff-2026-08-29.md`
- `/Volumes/good/mhc-plane-animation-main-handoff-2026-08-29.md`
- `/Volumes/good/Cruushv2-media-rate-limit-20260829/docs/media-read-hardening-handoff-2026-08-29.md`
- `/Volumes/good/cruush-card-recovery-20260829/HANDOFF.md`
- `/Volumes/good/Cruushv2-seo-20260829/docs/session-handoff-2026-08-29.md`
- Current 2026-08-29 screenshots and direct corrections.

## Current 1.6 slice boundary

- Local candidate only. No commit, push, merge, deployment, production migration, server process
  change, dependency, environment change, or provider activation is authorized.
- Preserve the dirty destination worktree. Port narrow source hunks only. Never merge or copy a
  handoff worktree wholesale.
- Julien owns the scratch-card visual work. Do not edit or replace that prototype while he is
  working on it. Prepare only the integration points and acceptance list.
- Complete the visible 1.6 flows first: map interaction, MHC, Ghost, Side Quests, shared people
  cards, Feed, Messages, Cruushes, popups, Spots, Crowds, and current icon/copy corrections.
- Custom Crowds and privacy-sensitive Spot aggregates remain separate gated milestones. Never fake
  crowd composition, Spot activity, identity signals, or demographic data to make the UI appear
  complete.

## P0. Restore work that is absent from this checkout

### cruush+ scratch card and Side Quests

- [x] Exact scratch-card source located at
  `/Volumes/good/cruush-card-recovery-20260829/layover-card-demo.html`; authoritative integration
  notes are in `/Volumes/good/cruush-card-recovery-20260829/HANDOFF.md`.
- [~] Julien explicitly supplied the finished handoff again and reopened integration on 2026-08-30.
  The original prototype remains untouched; the selected visual source is ported into 1.6.
- [~] Transfer the exact scratch canvas, current front and back artwork, 2:3 phone and 3:2 desktop geometry,
  threshold reveal, confetti, tap-to-flip, drag-versus-flip behavior, tilt, reduced-motion state,
  supported-benefit copy, activation behavior, and explicit post-acceptance dismissal.
- [~] Connect the restored card only to the approved triggers: newly earned cruush+ after
  onboarding, the matching earned-cruush+ notification, and completed purchase. Preserve billing,
  eligibility, persistence, and replay semantics.
- [x] The cruush+ Time Capsule renders directly below the feature accordion in the authenticated
  Rewards flow.
- [~] Source implements the directly specified Side Quests plus additional one-time quests across profile
  setup, photos, profile views, cruushes, Pings, messages, Feed posts, Spots, and Visibility sets.
  Up to four active quests render after Invite people you trust. Claiming one moves it under Recent
  rewards and reveals the next unclaimed quest. The authenticated populated four-quest state is
  rendered; migrations are applied locally, but real claim proof awaits account-mutation approval.
- [~] Source enforces one claim per quest, one total claim per member-local calendar day, idempotent claims,
  rewards of bonus Pings or one promotional cruush+ day, and a maximum of two free cruush+ days
  from Side Quests per member-local calendar week. The weekly cap must not appear in user-facing copy.
- [~] Source routes cruush+ day rewards through the existing promotional entitlement ledger so they bank
  behind active paid access and do not overwrite paid, lifetime, legacy, referral, coupon, or
  previously earned access. Local migration proof passed; real claim proof remains blocked.
- [~] A successful Side Quest claim now updates entitlement listeners before refreshing reward
  history. A history-fetch failure no longer misreports the successful claim as failed. Rejected
  claims reload the server quest summary so another-tab claims and daily-limit state can reconcile.
  Focused client tests pass; the real claim interaction remains unverified.
- [x] Initial visible quest pool includes first Feed post, first message, first cruush sent, first
  mutual cruush, first Ping, completed profile, and four uploaded photos. Keep only four active at
  once and generate the next unclaimed quest as one completes. Relationship-backed completions read
  the encrypted relationship store rather than the retired plaintext cruush and profile-view tables.
- [x] Apply `106_side_quests.sql`, `107_side_quest_first_ping.sql`, and `108_side_quest_catalog.sql`
  atomically on the named local preview database, preserving existing grants and reward guards.
- [~] The authorized real local first-message claim granted one banked cruush+ day and one
  notification, moved under Recent rewards, and revealed the next quest. Repeat-claim and
  daily-limit requests remain unexercised because the authority covered one exact claim only.
- [x] Render and exercise the restored card at desktop, narrow desktop, 390x844, and 412x915.
  The exact popup fills every viewport, prevents underlying map controls from painting above it,
  retains scratch, flip, benefits, Close, and Done, and produces no document overflow.

### Custom Crowds

- [deferred] Custom saved Crowds are removed from the 1.6 release scope by direct instruction.
  Do not update Crowd Mode in 1.6. Preserve the existing main-branch behavior.
- [~] Unverified local source exists for private saved crowds: encrypted persistence, blind tokens,
  owner-only API, Basic/cruush+ limits, downgrade locks, current switching, delete cleanup,
  legacy provenance, reciprocal Crowd Mode, Visibility exclusion, Seeking inclusion, and a shared
  access predicate for discovery, profiles, and Feed.
- [~] Exact Custom Crowds core source and mixed integration snapshots are preserved under
  `/Volumes/good/cruushv2/custom-crowds-20260830`. Migration `109_custom_crowds.sql` is removed
  from the 1.6 migration list and was not run.
- [x] The branch-only dedicated Crowds sheet and Hydra assets are removed. The existing Crowd Mode
  controls remain in Visibility, and the active notice opens Visibility. At 390x844, the real
  Visibility sheet rendered that existing flow without a separate Crowds dialog. No setting changed.
- [deferred] No-crowd, five-crowd, downgrade, lock, conflict, loading, empty, offline, retry,
  deletion, re-upgrade, onboarding templates, and onboarding copy move with the Custom Crowds work.

## P0. Repair the visible profile and people-card flows

### Profile popup actions and duplicates

- [x] Keep cruush, Pin that user, and Message on one row in the popup. A local source patch now
  uses one flex row and always keeps Pin in the middle, dark and disabled when precise location is
  unavailable. The full profile and populated Pop-ups mode profile both rendered this exact row.
- [x] In Pop-ups mode, Message replaces the current profile popup with the conversation. It does not
  navigate away or open a second popup. The populated mari profile-to-thread flow passed on the real
  authenticated map.
- [x] Keep exact action order everywhere: cruush, Pin that user, Message. Shared compact cards, the
  full profile, and the populated profile popup rendered in this order.
- [x] Person-to-person Message always uses the arrow/send glyph. Never reuse the bottom-nav
  Messages icon.
- [~] Every actionable cruush button is reversible from the same surface. A second press unsends
  a sent cruush or removes a mutual. Never disable the button merely because the state is Sent or
  Mutual. Shared actions and both profile implementations route Sent and Mutual through revoke;
  the complete rendered interaction matrix remains pending.
- [x] On the signed-in user's profile popup and full profile, do not repeat Signal or Vibes below
  About because both already appear over the profile image. The authenticated Admin profile popup
  rendered both over the image and no duplicate section below About.

### Shared Feed, Messages, Cruushes, and person-picker card

- [x] Feed, Messages, Cruushes, Spot boards, and the person pickers render through the shared
  `UserActivityCapsule` card. Populated Feed, Messages, and Cruushes states were rendered.
- [x] Keep the purple-reference structure: heart on the left; name and pronouns beside it;
  activity time and distance below; action trio aligned on the right. Current direct correction
  removes vibe capsules from compact Feed, Cruushes, message-list, Spot, New Message, and New group
  cards. Vibes remain only on profile views and profile editing. Feed, Cruushes, Messages, New
  Message, and New group were rendered populated in the existing desktop popup layout.
- [x] Both side badges render side by side directly below the heart through `SideBadgePair`.
  Populated Feed and Cruushes cards rendered the pair with accessible meaning labels.
- [x] Feed post content and message preview render directly below the identity and badge area and
  use the same text size as the member name. Feed, Messages, and Cruushes were rendered with the
  compact no-vibe treatment.
- [x] Feed keeps expiration and owner Trash in the upper-right corner. Other users retain Report
  and Block directly under the side badges without displacing the card content. Both owner and
  other-member populated cards were rendered.
- [x] Person-action rows keep cruush, Pin, and the message arrow visible in that order. Feed now uses
  server-authoritative message eligibility, so a member who is not accepting a new direct message
  renders a disabled arrow instead of opening an unrelated Messages list after a rejected request.
- [~] Keep heart border semantics: signed-in indigo, mutual purple, everyone else pink, Pulse lime,
  Ghost electric blue, and approved Dark Room treatment only in Dark Room. Mile High Club does not
  recolor the main heart; only its side-badge and Signal borders become sky blue `#77B9DA`. Source
  centralizes indigo, purple, pink, and Ghost blue in `HEART_PIN_THEMES`; map source gives Pulse lime
  priority and keeps Mile High Club off the main-heart border. Authenticated map, Carousel, Feed,
  Cruushes, Ghost, and Mile High Club states were sampled, but every cross-surface state is not yet
  visually proven.
- [x] One-way Incoming and Sent hearts must never use mutual purple. At 390x844, authenticated
  one-way Incoming rows rendered `#FF0072` pink while mutual rows rendered `#6f00ff` purple. The
  Cruushes component test now also asserts pink one-way Incoming, pink one-way Sent, and purple
  Mutual hearts; all seven focused tests pass.
- [x] Cruushes count cards and Incoming, Sent, Mutual, Views tabs rendered centered as one unit with
  the same four-column geometry in the populated popup.
- [x] Mutual resolves to the approved double-heart asset in the centralized icon map. The populated
  Cruushes surface rendered without a stray `mutuals` capsule over Map Controls.
- [x] Confirm the populated card at desktop, narrow desktop, 390x844, and 412x915. Populated shared
  cards rendered in the 1440x900 and 900x844 popup checks plus both exact mobile viewports. At
  390x844, rows stayed within x=16 through x=374 with no horizontal overflow and retained identity,
  metadata, badges, and action trio.

## P0. Finish desktop Pop-ups mode

- [x] New group hides its scrollbar, searches mutuals by visible identity or chooser metadata,
  selects the complete person row without a separate checkbox, defaults to Recently online, and
  offers Distance sorting. Search, row selection, both sort states, and the rendered popup were
  exercised in the existing local browser.

- [~] Settings opened from Feed, Messages, Cruushes, Profile, Spots, Seeking, or Visibility replaces
  the active popup content. It never opens a second popup. Feed Settings replaced the populated
  Feed popup and Back restored it. Mile High Club now also replaces embedded Settings in the same
  map panel and Back restores Settings; the remaining launch surfaces still need direct proof.
- [x] Edit profile replaces the signed-in profile preview in the same popup. Back restores the
  populated profile preview without leaving the map.
- [x] Message threads replace the active Messages or Cruushes content in the same popup. Back returns
  to the originating list and Close dismisses the popup. The populated Cruushes to mari thread to
  Cruushes return flow was exercised without leaving the map.
- [~] Popup headers never reserve an internal Bug Fix slot. New Message, Choose someone to message,
  and New group now remove the full-screen Bug Fix gap while embedded and keep Back or Close at the
  popup's right edge. Full-screen variants retain their global Bug Fix clearance. The corrected
  embedded headers were rendered. The long direct-message chooser now also reserves 112px plus the
  device safe area below its scrolling list so bottom navigation does not cover the final cards.
  Remaining popup surfaces still need direct proof.
- [x] Keep the drag handle visible. Right popups may move to the approved near-right inset while
  staying fully visible and constrained to the right half. The authenticated 1440x900 Feed popup
  moved from x=720 to x=820 while retaining its complete 392px width.
- [x] Support both resize corners, raise a clicked overlapping popup, and preserve close/reopen size
  and position. The bottom grip resized Feed to 472x504, the top grip resized it to 512x531 while
  anchoring the bottom edge, and close/reopen restored the exact 820,136,512,531 geometry. An
  overlapping Profile and Feed pair raised Feed from z=202 to z=204 and Profile from z=203 to
  z=205 when each exposed surface was clicked.
- [x] Narrow-viewport width clamping and top-resize anchoring are patched in source. Interrupted
  pointer capture ends dragging. Real pointer drag, both resize grips, overlap raising, and
  persistence passed; the original left and right stored geometries were restored afterward.
- [x] Verify no popup blocks top navigation, bottom navigation, Map Controls, or Bug Fix. At
  900x844, both desktop panels stopped 10px above Recently Active and cleared Map Controls by
  10px; all five bottom-navigation targets and Recently Active remained hit-testable. The
  full-size desktop render retained the same clearances and internal panel scrolling.

## P1. Feed completion

- [x] Every rendered real Feed post uses the shared people-card format. The populated other-member
  and owner states rendered with side badges, compact actions, content, expiry, and report/block or
  Trash controls.
- [x] Preserve the three-action row without routing failed direct-message starts into the generic
  Messages list. The rendered jay post showed the disabled arrow and its exact unavailable label.
- [x] Keep basic text posting free. Preserve trust, suspension, feature restriction, moderation,
  encrypted storage, audience, expiry, delete, report, block, and distance behavior. Existing
  focused client coverage proves a free member posts text with an empty photo list, plus audience,
  expiry, owner deletion, reporting, blocking, and distance presentation. The complete 648-test
  client suite passes; no live post was added during this continuation.
- [x] Feed Seeking sits beside Feed Settings and searches visible member names, bios, configured
  profile fields, and Feed post tags inside the same popup. A leading `#` searches tags. Post text
  is not searched.
- [~] Complete cruush+ posting of up to three policy-compliant photos. Focused backend checks prove
  the cruush+ gate, approved-owner unattached-media boundary, ordered attachment insert, public
  authenticated read, and Crowd-audience denial. Upload moderation/provider and rendered-flow proof
  remain open. Do not assume an unapproved free-photo allowance.
- [~] Feed attachment cleanup no longer resets an already-empty array on every basic-member
  render. Posting and crop confirmation now refuse concurrent operations; crop confirmation also
  rechecks the three-photo limit and current cruush+ access. Runtime proof remains pending.
- [x] Reuse the approved cropper with pan, zoom, continuous rotation, angle readout, and 90-degree
  quick rotation. The exact shared cropper rendered at 390x844 without overflow; pointer pan changed
  the offset, Zoom reached 2.1, continuous Rotation reached 69 degrees with a matching readout, both
  90-degree controls worked, and accepting the crop produced the local heart preview.
- [x] One photo renders as one heart. By direct 2026-09-01 correction, two or three photos render as
  separate equal-size hearts in one horizontal row with visible gaps and no overlap. The exact
  production attachment and viewer components rendered at 390x844 and 1440x900 without horizontal
  overflow. The full rectangular viewer kept Report and Close in the upper-right, cycled between
  photos, closed with Escape, and restored focus to the selected heart.
- [~] Apply explicit classification and DL Mode masking to Feed previews. Backend attachment rows
  preserve explicit classification and media reads recheck post audience authorization. Rendered
  masking and the real upload moderation chain remain unverified. Feed follows message-photo subject
  rules, not single-person profile-photo rules.
- [~] Feed privacy and safety source now has focused proof. New post text stores only encrypted fields
  and a placeholder; sanitized `feed_photo` bytes use envelope encryption; out-of-audience media reads
  return 404; the upload path reuses private-message image moderation; multiple adult subjects and
  allowed non-human imagery remain allowed while child-face enforcement stays active; explicit Feed
  attachments mask under DL Mode. Twenty focused checks passed. No real upload or successful media-byte
  delivery ran, so those integration gates remain pending.
- [x] Feed posts can add up to five moderated `#tags`, display them on the post, and find them through
  Feed Seeking. Migration `110_feed_post_tags.sql` adds normalized post-tag storage.
- [deferred] Feed replies were directly rejected and remain outside 1.6. Reactions remain deferred
  until Julien selects the emoji set. Do not build either from the older backlog entry.
- [blocked] Decide whether crowd targeting and Feed pin visibility remain cruush+ gates after saved
  Crowds replace legacy crowd targeting.

## P1. Badge editor and side badges

- [x] The current Badge editor renders Circle only. Dormant custom frame source remains hidden and no
  frame picker appears.
- [x] Dominant renders the BDSM chevron, empty for Dominant and filled for Dominant, taken.
- [x] Submissive uses an empty circle ring; Submissive, taken uses a filled circle. Top and Bottom use
  plain up and down arrows.
- [~] Keep icon size, centering, black interior, opaque border, heart clearance, map/editor parity,
  Hanky clipping, state colors, and hover labels consistent on every pin and people card. Map and
  embedded Badge editor now share one 29.75px, 70-percent-height, 5.25px edge-offset geometry helper.
  The authenticated signed-in and Ghost-decoy map pins plus editor preview rendered at 1440x900 and
  390x844 without overflow; the meaning-only hover label rendered on desktop. The complete other-user,
  Mile High Club, Pulse, Dark Room, and every-people-card state matrix remains open.
- [x] Badge titles show only the meaning, never the Hanky color name. The rendered Hanky picker and
  `S&M` option title used meaning-only text.
- [x] Under `What this side says`, allow Give, Receive, Switch, Service, or Stone. The rendered
  editor applied `Receive` to an `S&M` draft independently from the Circle frame.
- [x] Selecting another badge replaces the existing Hanky on that side. The rendered left-side
  selection changed directly to `receive/s&m`, and no Remove Hanky action appeared.
- [~] Save remains a real draft/save flow. Source guards Back, Close, browser leave, and profile-tab
  navigation while changes are pending. The browser harness automatically accepted the native
  confirmation, so the prompt itself remains visually unverified. The proof draft was reverted and
  the original `pillow princess` plus `dominant, taken` state rendered with Save disabled.
- [x] The Badge editor rendered embedded under Edit Profile tabs with one profile header, one Save,
  and one Back control.

## P1. Profile, photos, Carousel, and discovery

- [x] Profile photo guidance renders exactly the four supplied compact bullets with no added helper
  sentence.
- [x] Keep Signal one line at 35 characters and Vibes over the photo. Shared client and server limits
  enforce 35 characters and a single line. The authenticated own-profile popup rendered Signal and
  Vibes only over the photo at 412x915, with no duplicate section below About.
- [~] Own and other populated profiles rendered at 1440x900 and 390x844 without horizontal
  overflow. The other profile rendered three photos, badges, tabs, actions, and the full-viewport
  photo viewer. Profile and photo Report dialogs opened and canceled without submitting. The viewer
  now keeps Report and Close clear of the fixed Bug Fix button; real Close clicks worked at both
  viewports. Empty-photo and complete Mile High Club, Dark Room, Ghost, and Pulse profile matrices
  remain unverified.
- [x] The clean Carousel source branch is `codex/carousel-photo-gallery-20260820` at `2342bca`;
  its implemented gallery lineage is already ancestral to this release branch. The later pull-bar
  proposal was mocked and rejected on 2026-09-01. The current Browse again button remains unchanged,
  and the pull-bar preview route and source were removed from the 1.6 candidate.
- [x] The populated fullscreen Carousel result rendered one action row in exact order: cruush, Pin,
  Message. The card reaches the bottom navigation without the removed page fade.
- [~] Profile keyword search is enforced by the discovery API across visible name, bio, configured
  searchable profile fields, and encrypted kink tokens. The map no longer drops valid bio-only or
  kink-only API matches through a narrower client re-filter. Mutual-map Seeking now carries the same
  search query and server-side field matching. Visibility uses the same search input with inverse
  server-side meaning. Both search controls rendered and accepted input; the active travel-pin map
  had no matching populated cards for result proof.

## P1. Spots menu and real Spot behavior

- [~] Existing source includes a rendered Spots sheet, published Spot API paths, search, five sorts,
  facility filters, encrypted suggestions, board, ratings, check-ins, Who's Here, and Popular times.
  The drawer, published results, desktop board popup, and combined check-in form were rendered in
  the existing local browser. Physical-distance-gated write proof remains pending.
- [x] Restore the approved Spots primary icon. The active Map Controls button imports the approved
  handoff asset `places-ghost-source.png` directly and rendered it in the authenticated desktop and
  mobile controls. No category-specific icons were invented.
- [x] Spots renders exactly the approved tagline `Public cruising spaces, healthcare clinics, and
  community spots.` No second tagline appears.
- [~] Show published Spots on the map by default. Opening the menu does not toggle visibility. Active
  styling means filters narrow the Spot dataset.
- [~] Load every published Spot in the settled viewport. The first 50 drawer results must never
  truncate map markers. Pan and zoom refresh people and Spots independently.
- [~] Keep people clusters, Spot clusters, exact-coordinate spiderfy, and selection behaviors
  independent. Desktop opens the full Spot board popup; mobile opens `/places/:placeId`.
- [~] Reconcile the 20 approved facility categories, stored-tag compatibility, maximum two summary
  labels, Ginger's Bar as Bars, and no user-visible legacy Dyke spot tag.
- [~] Verify the exact 100-mile boundary, all five sorts, filters, search, pagination, suggestion
  support/shortlisting, moderation, board expiry, check-ins, six ratings, and Popular times.
- [~] Ratings, clear-rating, checkout, and board deletion now guard concurrent and stale mutations
  and show failures. Embedded ratings and reports stay inside the Spot popup. Spot report links
  carry their target IDs through the existing report API. These paths remain runtime-unverified.
- [~] Add spot remains one flow and may use the current cruush map pin as public suggestion
  coordinates.
- [x] Spot board posts use the same shared person-card structure as Feed and Messages: profile
  heart, both side badges below the heart, content, activity, distance, and owner/report actions.
  Compact Spot, Feed, Message, cruush, and chooser cards do not render vibe capsules.
- [x] A required board message is now the only check-in action. The same atomic API operation creates
  the encrypted board post and timed check-in for 1h, 3h, 6h, 12h, or 24h. One canonical checkmark
  optionally exposes the member in Who's Here for that duration. The old separate board-post write
  endpoint and separate one-hour check-in UI were removed. The form, all choices, checkmark, disabled
  empty state, enabled populated state, no-photo state, and hidden-scrollbar popup were rendered.
  Authenticated local API smoke passed 201 creation, 200 board visibility, and 204/204 cleanup with
  test coordinates. Real-device location permission and physical-proximity proof remain pending.
- [x] Spot board security contracts now have focused route proof. New message text is stored as an
  encrypted payload with only the `[encrypted]` placeholder in the legacy plaintext column;
  authenticated board reads decrypt it. Bidirectional block guards cover board and Who's Here rows,
  deletion binds message, Spot, and authenticated owner, and board plus Who's Here mutual state now
  reads encrypted relationship records instead of legacy `cruush_matches`. Four checks passed.

### New Spot vibes and Crowd fit

- [deferred] Public Spot demographic composition is excluded from the current release by direct
  instruction. Keep voluntary check-in collection; do not add inferred identities or new collection.
- [blocked] Build real Spot records and privacy-safe aggregate snapshots before adding demographic filters.
- [~] Julien directly authorized the Spot taxonomy expansion on 2026-09-01. Never reuse profile
  vibes. `Historical` and `Exposed` are approved; the rest of the taxonomy still requires approval.
- [deferred] Add Crowd fit: Popular with my current crowd, Leans women, Leans men, Mixed, and Strong
  trans/NB presence.
- [deferred] Show category, top three Spot vibes, gender lean, and the positive Strong trans/NB presence
  label only when thresholds are satisfied.
- [x] Never show live or exact sensitive composition, negative trans/NB labels, counts, percentages,
  or inferred identity. Those deferred fields do not exist in the active Spot response or UI, and the
  populated authenticated drawer and board rendered without them.
- [blocked] Approve full Spot vibe, category, and feature taxonomies; usual versus live vibe model;
  crowd-combination semantics; protected-rule cooldown; and trans/NB aggregation ontology.

## P1. Map, heatmap, clustering, and Recently Active

- [x] Preserve the approved in-app vector map theme. The authenticated map rendered the active dark
  vector theme. Focused coverage rejects CARTO, ignores retired raster flags, keeps OpenFreeMap vector
  tiles through slow/error/recovery states, and proves no raster layer is created.
- [x] Derive hearts, people clusters, heatmap, and Recently Active from the same viewer-authorized,
  privacy-adjusted person set. `displayedUsersInViewport` is the single shared people source for map
  markers and Recently Active; clustering and heatmap consume those markers. The heatmap alone removes
  self and developer-demo markers before aggregation.
- [x] Increase far-zoom clustering and show more authorized in-view people and Spots as the viewport
  expands. The zoom-10 authenticated render showed the larger authorized area as independent people
  and Spot clusters. Focused coverage keeps every individual coordinate unchanged across zoom levels.
- [~] Cluster selection fits member bounds in focused coverage, and exact-coordinate people and Spots
  receive distinct pixel-only spiderfy offsets without mixing the two sets. The authenticated map
  rendered populated people and Spot clusters, but this continuation did not find an exact-coordinate
  cluster in the active viewport for a real selection proof.
- [x] Heatmap stays off by default and represents coarse seven-day activity, not one glow beneath
  each current heart. Authenticated zoom-10 and zoom-12 renders showed coarse cohort glows; sparse
  zoom-14 and zoom-16 views correctly stayed empty when enabled.
- [x] Keep self and demo profiles out of density. Never fabricate activity in sparse or empty states.
  Focused source proof filters self, developer demos, activity older than seven days, and cohorts below
  three before creating a heatmap point; the complete MapView file passes 54 tests.
- [x] Recently Active loads up to ten viewer-authorized people, shows five before horizontal scroll,
  hides the scrollbar to reclaim its height, preserves touch, pointer-drag, and mouse-wheel scrolling,
  restores the translucent black-glass container around the complete open unit, and remains centered
  with or without panels. The authenticated populated map rendered ten profiles at 390x844 and
  desktop size. Desktop showed exactly five complete tiles before scroll; horizontal scrolling
  reached the final profiles. Focused coverage proves the ten-profile cap plus wheel and pointer drag.
- [x] Keep the bottom navigation centered with or without panels. Authenticated 1625x963 and
  900x844 renders kept the nav centered while profile and Feed panels were open.
- [x] Render heatmap off/on at identical zoom 10, 12, 14, and 16 camera states. Each authenticated
  desktop pair retained the same camera, toggled `aria-pressed` false to true, and returned the
  heatmap to off afterward without horizontal overflow.
- [~] Source defines the active service area as the complete 100-mile circle around the NYC center
  and allows zooming until the whole edge is visible. Verify the camera never hides the boundary.
- [~] Source adds dark-blue fog outside the allowed 100-mile circle. Verify it masks only the
  out-of-area map and does not capture pointer input inside the active area.
- [x] Require Mile High Club to cruise from a location more than 50 miles from the member's actual
  location. The write route now compares the candidate with the encrypted actual-location envelope
  and never returns or logs coordinates. Focused inside, exact-boundary, outside, and non-finite cases
  pass. The watched local API rejected a near-location request with 403 and left the pin off; the prior
  Philadelphia outside-state activation succeeded and was cleared.
- [x] Spot disappearance on zoom was traced to the server measuring the viewport radius from NYC's
  fixed center instead of the settled map center. The configured local API is available. Ginger's
  Bar remained rendered after selection and two consecutive one-click zoom-ins while its populated
  board stayed open.
- [x] Map Controls, Spots, and Ginger's Bar each opened with one click in sequence. The populated Spot
  board remained interactive without an overlay stealing input.

## P2. Mile High Club, Ghost, Pulse, and top chrome

- [~] Mile High Club migration replay safety, three-hour move cooldown, always-allowed clear,
  viewer discovery center, Dark Room exclusion, Pulse compatibility, and profile Visibility exclusion
  now pass 16 focused checks. Pulse remains allowed while travelling, matching the current lime-over-
  sky-blue priority contract. The 50-mile browse-radius API response now returns the Mile High Club
  invitation contract without querying Pings. The authenticated 412x915 route now also passed a
  real activate, traveller-map render, and clear cycle; the local account was restored to off.
- [~] Use exact `src/app/assets/ui-icons/mile-high-club-white.svg` geometry everywhere. The map plane
  has a white base, subtle edge shading, and length shading. The same shaded white plane appears
  beside the member age on own and other profiles.
- [~] MHC map animation uses a 5,200ms loop, 18 trail bands, 0.52 moving span, 0.26 blue-to-white
  handover, 0.20 blend, 0.55 opacity hold, 0.72 plane scale, 3.2 initial trail width, and colors
  `#DAF3FF`, `#A9DCF3`, and `#77B9DA` before soft white ending poofs. The rejected 6:53 AM
  render-order patch was reversed from its exact session diff. The pre-regression order paints the
  complete traveller animation after the heart artwork and restores traveller heart-border opacity.
  Authenticated frames showed the complete plane instead of white fragments. Reduced Motion and the
  signed-in Ghost decoy freeze the existing animation at frame 420 of 1,000, with the plane at the
  upper-left of the heart; they do not run a second animation. Focused test proof is still pending
  because the attempted runner produced no captured result.
- [~] MHC side-badge borders and Signal capsule border use solid sky blue `#77B9DA`. Do not recolor
  the main heart, badge glyphs, Signal text or background, or profile photo. Pulse lime remains the
  higher-priority temporary treatment.
- [x] MHC location entry places Address or GPS coordinates first, then Use my current location and
  Drop or Move my pin here, then a larger map filling the remaining panel above bottom navigation.
  Authenticated GPS lookup accepted Philadelphia coordinates, rendered the map, enabled the move
  action, and displayed the selected point with the outlined cruush heart rather than a circle. A
  reversible local cycle saved the pin, rendered the traveller state, and cleared it afterward.
- [blocked] Address lookup source exists, but a production geocoding provider, privacy disclosure,
  rate policy, caching policy, and failure behavior require approval before production activation.
- [~] Render traveller map state and distance labels. The 412x915 Philadelphia state rendered the
  traveller heart, approved plane/contrail treatment, Ghost-derived decoy and tether, and nearby
  published Spots. No viewer-authorized people were returned there, so real distance-label proof
  remains unverified. The focused `outsideBrowseRadius` API check returns the Mile High Club
  invitation instead of a silent empty response.
- [removed] Do not build Kelpie. Julien corrected this item to Dark Room Mode on 2026-09-01.
- [x] Active and fly-out Ghost use the exact supplied `ghost-mode-icon-final.svg`; its SHA-256 matches
  `src/app/assets/ui-icons/ghost-colored.svg`. The owner decoy rendered electric-blue side badges.
- [~] Ghost decoy treatment starts fully opaque dark blue, passes through electric blue, holds full
  opacity through halfway down, then fades once to 10 percent at the bottom. Profile photo and both
  side badges share the same fade, and the normal heart clip hides all photo overflow. When Ghost
  and Mile High Club are active together, the decoy keeps the Mile High Club treatment but freezes
  it at the approved Reduced Motion frame rather than duplicating the moving traveller animation.
- [x] Hovering the signed-in member's decoy shows live time remaining until rotation. The authenticated
  owner hover rendered `Rotates in 0:23`; consecutive live samples changed both the countdown and pulse
  transform during the final minute. Source restricts that timer to the owner Ghost decoy, and focused
  coverage preserves the existing final-minute pulse and exit behavior for normal and Mile High Club
  owner decoys.
- [~] The older backlog's missing rotation choices are now implemented in source: 15 and 30
  minutes, then every hour through 24 hours. Both privacy write routes validate the same supported
  values. The existing encrypted policy stores the preference and next-epoch schedule; cadence
  edits never change the current decoy epoch or deadline. Prove persistence, pending-change,
  repeated edits, legacy fallback, reactivation, and MHC compatibility before release.
- [~] Pulse EKG source and focused render proof anchor the trace at `M8 32`, finish it at x=56,
  keep both strokes unfilled, and clip the group to the exact heart-photo clip. The active Pulse stays
  independent and above an adjacent people cluster. The exact live authenticated Pulse and complete
  current, seeded, clustered, and preview state matrix remain unverified.
- [x] Notifications rendered far right in the top-nav pill with Settings immediately before it.
- [~] DL Mode uses Julien's exact supplied balaclava-and-halo PNG, white while inactive and the
  existing cruush gradient while active. Keep the current gradient until Julien selects dedicated
  DL Mode colors.
- [x] At 390x844, DL Mode rendered at the same adjacent visible scale inside the shared 32px button
  canvas without overflow.
- [x] Direct correction removes the branch-only Hydra asset and dedicated Crowds sheet from 1.6.
  The existing main-branch Crowd Mode control and active notice return to Visibility. Three focused
  files passed 93 tests, and the production client build passed.
- [x] Top-nav source explicitly removes hover, focus, and focus-visible fills and uses one shared
  visible canvas. Desktop inactive and active states rendered without a grey hover circle. At
  390x844, the resting icon row had no grey circles, Map Controls opened and closed, Settings opened,
  and Back returned to the map without changing a setting.

## P2. Media, SEO, and release-script follow-up

- [x] Later verified handoff supersedes the older media handoff's deployment snapshot: media ETags,
  authorization revalidation, read observation, health-log filtering, and versioned encryption-key
  fallback were deployed in production at the 2026-08-29 snapshot. Reverify live state before any
  new release claim.
- [~] That production snapshot did not establish source parity in this 1.6 checkout. The missing
  media and key-rotation changes are now integrated locally from the exact reviewed source hunks.
  Integration remains unverified; no encryption keys were rotated and no schema migrations ran.
- [~] The previously missing SEO source is now present locally, including the static public pages
  and default-deny indexing keyed on the original request URI. Inline-script permission retains
  the supplied four JSON-LD hashes rather than adding `unsafe-inline`. The handoff's build and
  production evidence does not verify this candidate. Recheck built hashes and each route before
  any release; the copied public copy and crawler guidance also need a current accuracy review.
- [x] Preserved the exact release-script portion of unpushed `7e0a5d8` from
  `/Volumes/good/Cruushv2-seo-20260829`. The script now keeps the launch signup geofence disabled,
  retains 100 miles as the inactive fallback radius, and describes that state accurately in dry-run
  output. `node --check` and scoped `git diff --check` passed. No release or environment mutation ran.
- [x] Diagnosed and reconciled the six known red server tests. `docs/CRUUSH-RULES.md` G2 resolves <!-- ai-contract-allow-product-example -->
  gear-only profile photos as allowed while independent prohibited-content labels still reject.
  The cruush activity and profile-cap fixtures now match current response/schema contracts. All six
  named checks passed with 328 unrelated cases skipped, and the complete policy-mapper file passed
  34 tests. Capability storage, moderated Signals, and blocked relationship filtering retained their
  existing safety assertions.
- [x] The mechanical `ba6ce50` fixes are present and verified. Child-face enforcement plus
  sensitive-profile encryption passed 13 tests. The three affected cruush activity and profile
  response contracts passed with 296 unrelated cases skipped. Only current fixture fields were
  added: `birth_control`, `relationship_status`, visibility search and Mile High Club defaults,
  cruush permissions/travel state, and `side_badges`. No behavior assertion was weakened.
- [x] Full-suite order dependence exposed by `key-rotation.test.ts` and
  `media-read-validator.test.ts` is resolved in the local candidate. Their targeted pair passed 15
  tests, the forced single-worker five-file gate passed 27 tests with three live AWS checks skipped,
  and the complete server suite passed 951 tests with 14 intentional live-provider skips. Keep both
  tests. Do not bypass the release gate with `--skip-checks`.
- [~] Resend audience reconciliation now serializes contact requests, paces them at one per second,
  honors provider retry delays, bounds attempts and request timeouts, and stops the startup sweep
  on provider-wide failure. Ambiguous creates restart with lookup; existing contacts are not
  updated. Eligibility is unchanged and logs omit addresses. Five focused mocked-provider tests
  passed on 2026-08-31. Live provider behavior remains unverified; no Resend request was made.
- [blocked] Julien must separately authorize and perform provider/security operations: rotate the R2
  media token, decide whether to separate the shared staging-named media bucket, and replace the
  single unaudited `/api/internal/*` shared-secret model.
- [blocked] Media read limits require a representative observation window. No limit was guessed
  from the current local-only evidence.

## P2. Copy and catalog corrections still requiring rendered review

- [x] No new taglines. The authenticated rendered surfaces retained only the approved Visibility and
  Spots descriptions; Seeking rendered without a new description.
- [x] Seeking Filter and Visibility Controls use those exact headers. Crowd Mode receives no 1.6
  redesign and remains inside the existing Visibility flow.
- [x] Visibility keeps its existing single tagline `Pick who should not see you.` Spots keeps its
  approved single tagline. Both rendered in the authenticated 412x915 flow without a second tagline.
- [x] Hanky meanings: white with black paisley is Bondage; lime is Mutual masturbation; orange is
  Anytime/anywhere; dark blue is Fucking; teal is Tribbing/frotting; dark pink is Nipples/tits;
  light pink is Mommy; purple is Toys; tan with black paisley is Heavy petting; lavender is
  Crossdressing; mint green is Discreet; gold is Threesomes/groups. The meaning-only three-column
  Hanky dialog rendered the complete current set.
- [x] Kinks removes tribadism and frottage and lists Tribbing, Frotting, Fingering, and Hand jobs
  under Body & Touch. The rendered category showed all four and no removed duplicate.
- [x] Vibes removes E-Girl/E-Boy. The rendered Style & Energy category showed Blue-collar and
  Discreet, Scenes showed Collegiate, and Archetypes showed Trade and Bull.
- [x] Pride uses the supplied T4T linked-symbol mark and clear matching Gay and Lesbian linked marks;
  uses a standard readable Nonbinary symbol; renames Both to Straight; removes Labrys, Men, and
  Women; and owns Trans and T4T instead of Community. The rendered Pride set showed only Gay,
  Lesbian, Straight, T4T, Trans, Intersex, and Nonbinary.
- [x] The rendered Hanky code popup was substantially larger and showed all 18 meanings in three
  columns at the supported desktop width.
- [x] No color names appear in badge labels and no removed label returns through active catalogs,
  development seeds, or compatibility display data. The legacy saved `frottage` badge ID remains
  readable but now displays `Frotting`. Focused picker and catalog checks pass, and the authenticated
  picker rendered `Frotting` without `Frottage` at 1440x900 and 390x844; all 18 Hanky choices rendered
  meaning-only labels with no color-name button.
- [x] Public copy uses `cruush` and `cruush+` lowercase and contains no Unicode em dash. The
  current public-copy gate scanned 380 files clean after the final local changes.

## P2. Account, Settings, notifications, and global chrome

- [~] Signup source and focused checks keep required Terms of Service and Privacy Policy checkboxes
  plus the optional cruush product-updates checkbox directly below password fields. Focused coverage
  also proves signup and onboarding do not request location. Signed-out rendered proof remains open
  because this continuation preserved the authenticated browser session.
- [~] Popup settings replace the selected current surface and Settings search renders. Cruushes to
  Settings was exercised in one popup. Primary-email and digest work still require real API support.
- [removed] Secondary email came only from the inherited `docs/todo-2026-08-22.md` and
  `docs/parallel-work-handoff-2026-08-22.md`; no verified direct request from Julien was found. It is
  not an active 1.6 requirement. Primary-address replacement must preserve verified ownership and
  recovery safety. Daily/weekly digest delivery still needs approved content, consent, and delivery
  rules; do not activate mail delivery or invent those decisions as part of a source-only pass.
- [~] Notifications implements owner-only single deletion and confirmed bulk deletion. Both server
  queries bind the authenticated member ID; client success removes the item or list and emits the
  updated unread summary immediately. The authenticated empty state rendered both disabled controls.
  Populated deletion remains deliberately unexercised because it would destroy user data.
- [x] Full-screen Feed rendered Seeking and Feed Settings beside the global Bug Fix control. Seeking,
  Visibility, and Spots retain the shared top-layer implementation above both fixed navigation bars.
- [~] The global Bug Fix control stayed outside the rendered Feed, Messages, Cruushes, New Message,
  direct chooser, and New group popups at the top-right viewport layer. Embedded message overlays no
  longer reserve its full-screen slot. Remaining popup surfaces still need direct visual proof.
- [x] The new magnifying-glass Seeking icon and hidden Visibility icon use the approved supplied
  assets. The authenticated map rendered both controls; source imports the supplied SVGs directly.
  No Crowd icon appears in the top navigation.

## P3. Proof, migrations, and release gates

- [~] The earlier source-only restriction was superseded for focused checks and local inspection.
  Only the specifically approved local migrations 106 through 108 ran. Broad suites, builds,
  real reward grants, provider actions, and publication still require their respective authority.
- [~] The runner lists every numbered migration and orders the full 1.6 slice from 096 through 110.
  Focused source checks cover 098 through 109 dependencies and replay guards. Migration 105 now
  scopes its constraint-existence check to `media_objects`, preventing a same-named constraint on
  another table from breaking replay. Three checks passed; disposable-database forward and replay
  execution remains pending and no migration ran.
- [x] Prove the exact local frontend/API pair and local development admin login. Julien authorized
  starting this pair. The 5173 frontend proxied a 200 login for the local-only admin credential to
  the 3016 development API; `/api/auth/me` returned the active admin and `/api/build` returned
  stage `development`. Neither process was restarted, stopped, killed, or replaced.
- [~] Render every changed flow in populated and empty states at desktop, narrow desktop, 390x844,
  and 412x915. The current 412x915 pass covers populated and empty Feed search, Messages search and
  thread, all Cruushes tabs, own Profile top and bottom, Carousel, Spots discovery and empty board,
  Ghost settings top and bottom, Mile High Club entry, and the traveller map. Desktop and narrow
  popup clearance plus full-screen reward proof also pass. The complete matrix remains incomplete.
- [~] Exercise clicks, Back, Close, drag, resize, hover labels, save prompts, deletes, reversible
  cruushes, searches, filters, message open, and popup replacement. Search/filter restoration,
  message open/Back, reward Done, a reversible Mile High Club cycle, real popup movement, both
  resize grips, overlap raising, and close/reopen persistence pass. Destructive and remaining
  mutation cases remain unexercised.
- [~] Focused and complete unit checks, client build, server build, casing check, security check,
  Coolify release-script check, and `git diff --check` pass. The final post-change client suite
  passed 96 files and 653 tests, the client build passed with 2078 modules, and mobile, tablet, and
  desktop layout checks passed. The complete changed-flow viewport matrix remains incomplete.
- [x] Record passed, failed, blocked, and unverified gates separately in `AI_TASK.json`.
- [~] Julien separately authorized local commits on this release branch. Push, merge, deployment,
  production migration, environment changes, and feature activation remain unauthorized.

## Fastest safe execution order

1. Leave Julien's scratch-card prototype untouched. Finish Side Quests, Time Capsule placement,
   visible profile, people-card, Mutual, Message, badge-label, and popup defects.
2. Apply the shared people card to Feed, Messages, Cruushes, Spots boards, and the person picker. Finish Feed text
   and photo paths.
3. Finish popup containment and profile/Carousel interactions.
4. Reconcile the existing Spots implementation and viewport loading before adding new Spot-vibe and
   Crowd-fit data.
5. Keep Custom saved Crowds deferred under `/Volumes/good/cruushv2/custom-crowds-20260830`.
6. Add privacy-safe Spot aggregates only after Crowd semantics and taxonomy decisions are approved.
7. Finish map density, clustering, Recently Active, MHC, Ghost, Pulse, DL Mode, and top chrome.
8. Reconcile media-test order dependence and preserve the release-script geofence fix.
9. Perform rendered desktop/mobile proof, focused builds, migration review, then stop before any
   publication action.
