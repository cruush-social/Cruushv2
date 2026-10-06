# Clubs implementation handoff

Date: October 2, 2026
Worktree: `/Volumes/good/cruush-1.7-clubs-20261001`
Branch: `feat/1.7-clubs-foundation-20261001`
Current/base commit: `825df13`
Session queue: `.ai-queues/01a0fa0b-48b1-76c3-98e4-66eea0909a91.md`
Start contract: `docs/plans/2026-10-01-parties-clubs-start-contract.md`

## Status

The Clubs product slice is implemented and running locally. It has not been committed, pushed, merged, or deployed. The worktree is intentionally dirty and contains the entire Clubs implementation plus pre-existing/concurrent changes. Preserve it exactly and do not stage unrelated files.

The newly clarified encrypted-enrollment requirement is **not implemented yet**. Julien first requested that Club enrollment be encrypted, then clarified that “both” must be protected:

1. the member-to-Club membership relationship itself; and
2. any private join-request/application answer.

This handoff was requested before starting that migration. Only the queue and `DESIGN_DECISIONS.md` were updated with the resolved boundary.

## Completed Club behavior

- Messages has a `Clubs` tab with `My Clubs` and `Browse Clubs`.
- The shared top Messages search remains consistent and searches joined conversations/Clubs. Browse has a separate `Search Clubs by name, description, or tag` field above its sort control.
- Browse sorts by `Recently active` or `Near me`, using the existing privacy-safe 50-mile discovery boundary without returning creator coordinates or distance.
- Club cards reuse the Messages user-card composition: one gradient Messages heart, circular gradient message/open control, one member count, description, tags, latest joined-Club message preview, and owner/admin delete control. The complete card surface opens the Club.
- Club chat previews do not appear in top-level All or Groups. Per-tab unread dots distinguish All, Unread, Groups, and Clubs.
- Club creation lives under the large Messages `+` menu, is cruush+ gated on client and server, requires at least one selected mutual cruush, and publishes only with owner plus one member.
- Club title, description, and tags are moderated synchronously before persistence. Existing moderated text/media paths protect Club chat content.
- Every tag editor uses the shared `#tag` plus Enter chip editor.
- Owners/admins edit Club metadata and visibility. Admins can make members moderators/admins or remove those roles. Moderators can review join requests and remove Club messages but cannot edit metadata, visibility, roles, timers, or history.
- Only owner/admin/moderator roles receive join-request counts, can list requests, or can approve/deny them. Ordinary members and nonmembers receive no request count and get denied by request endpoints.
- Club, Group, and DM settings use dedicated routed pages with the shared `AppPageHeader` and existing settings-menu treatment.
- Group and Club notification settings support `All messages`, `@me only`, and timed mute per conversation membership.
- Group chats are capped at 100 total members. Clubs are capped at 1,000 total members. Creation, direct additions, and Club request approvals enforce the limits atomically; a full Club keeps the request pending.
- Club visibility controls reuse the existing profile visibility model. The rules are encrypted in `clubs`, apply to Browse discovery and join requests, and remain editable by owner/admin roles.
- A joined Club chat exposes `Share Club`. Public Club detail exposes the same action. The picker can send the structured Club card to selected messageable cruushes/private DMs or an existing Group/other Club conversation and excludes the current Club itself.
- A recipient opens the structured Club card from a DM or Group, lands on `/clubs/:clubId`, sees only the visibility-allowed public Club detail, and submits a pending `Request to join`. Sharing does not expose private Club messages or bypass admission.
- Club member lists are visible inside Club settings. Role controls remain permission-gated.

## Database migrations already added and locally applied

- `197_club_tag_search.sql`: Clubs, normalized tags, and plaintext join requests.
- `198_club_membership_conversations.sql`: owner/conversation links and plaintext Club memberships.
- `199_club_moderator_roles.sql`: moderator role support for Club and conversation memberships.
- `200_group_club_notification_controls.sql`: per-membership notification level and timed mute.
- `201_club_visibility_controls.sql`: encrypted Club visibility payload and key versions.

The local database is `cruush` on `localhost:5432`. Do not assume production has any of these migrations.

## Local runtime and test data

- Frontend: `http://127.0.0.1:5174/`, listener PID `96787`.
- API: `http://127.0.0.1:3001/`, listener PID `25371`.
- Both returned HTTP 200 at handoff.
- Port 5173 belongs to another worktree. Do not stop, replace, or reconfigure it.
- The repository's local development authentication is active; no production login is required.
- The local joined Club is `Brooklyn techno`, with two members and a latest preview message: `Meet at 10 under the lights.`
- Local Browse seed Clubs: `Late Night Vinyl`, `Queer Climbers`, `Sunday Coffee Walks`, `Leather Makers`, `Gallery After Dark`, and `Park Picnic Crew`.

## Verification completed

- Focused client run: 6 files, 67 tests passed.
- Final recipient/share/settings run: 3 files, 43 tests passed. This overlaps the broader focused client run and should not be added to 67.
- Club server run: `clubs-routes.test.ts` and `club-role-routes.test.ts`, 20 tests passed.
- Selected message server run using the Group-cap/member-add/notification name filter: 9 passed, 330 skipped. The two newly added assertions cover the 100-member Group creation and later-addition caps; the notification matches came from surrounding existing tests rather than a new dedicated notification-endpoint test.
- Client production build passed.
- Server TypeScript build passed.
- `git diff --check` passed.
- Frontend and API health checks returned HTTP 200.
- Rendered checks in the actual HTTP app confirmed:
  - My Clubs card structure, one member count, latest message, no encrypted sentinel in the preview, and card-surface navigation;
  - Browse search and both sorts with the local seed Clubs;
  - public Club detail with `Share Club` and `Request to join`;
  - dedicated Club settings with notification level, timed mute, visibility controls, join requests, member list, and role controls;
  - joined Club `Share Club` header control and a live recipient picker with private cruush recipients;
  - the current Club is not offered as its own share target.

The in-app browser was left open on the joined Club share picker at `http://127.0.0.1:5174/`.

## Remaining required work: encrypted Club enrollment

### Current plaintext exposure

The requirement is not satisfied by encrypting only a future answer column. A database-only observer can currently recover Club social-graph edges from several places:

- `club_memberships.club_id`, `club_memberships.user_id`, and `club_memberships.role`;
- `club_join_requests.club_id` and `club_join_requests.requester_user_id`;
- `clubs.owner_user_id` for the owner edge;
- `clubs.conversation_id` joined to plaintext `conversation_members.user_id` for every Club-chat member.

There is currently no join-request/application-answer field or UI. Do not invent a question, label, or required answer. The storage/API boundary should support an encrypted optional answer when the product question is later specified.

### Required threat model

Follow the existing design in `docs/encrypted-relationship-activity-storage-implementation.md`: authenticated application-layer encryption plus HMAC blind indexes. The database may retain operational metadata and opaque indexes, but must not expose the raw Club/user pair, role/status, or application answer without server keys. This is protection from database-only access, not end-to-end encryption.

Use dedicated Club-enrollment encryption/index keys with stored key versions. Do not hardcode or log key material. No environment variables have been added or changed yet; any eventual push/deploy requires listing the new variables first.

### Suggested implementation shape

1. Add the next free additive migration after 201 if it is still available.
2. Introduce an encrypted Club enrollment/request ledger with:
   - AES-256-GCM ciphertext, random nonce, auth tag, and encryption key version;
   - HMAC-SHA-256 blind indexes for Club lookup, member/requester lookup, Club-user pair lookup, record type/status, and deduplication;
   - encrypted payload fields for Club id, user id, role, enrollment/request status, and optional application answer;
   - only the minimum operational timestamps/expiry outside the payload.
3. Moderate any future application answer before encryption, using the existing text moderation boundary. Never persist rejected plaintext.
4. Backfill existing `club_memberships`, `club_join_requests`, owner edges, and linked Club `conversation_members` inside a transaction.
5. Cut every Club route and every Club-specific message authorization/count/add/remove/role/notification path over to blind-index lookups plus authorized decryption.
6. Prevent the linked Club conversation from recreating a readable membership graph. Merely encrypting `club_memberships` while continuing to insert Club members into plaintext `conversation_members` does not meet Julien's requirement. Club-chat authorization and per-member notification state need an encrypted or opaque-keyed storage path; ordinary DM/Group behavior should remain unchanged.
7. Replace owner authorization through plaintext `clubs.owner_user_id` with the encrypted owner enrollment. Retain a temporary compatibility column only during backfill/cutover, then purge plaintext edges after validation.
8. Preserve atomic 1,000-member cap checks, request-pending behavior when full, role synchronization, member counts, creator-plus-one publication, and cascade/cleanup behavior at the application layer.
9. Provide dry-run/apply/purge backfill modes and do not purge until row-count, authorization, and rollback checks pass.

### Encryption tests that must exist

- identical payloads produce different ciphertext;
- blind indexes are stable within a key version and change across index-key versions;
- tampered ciphertext/auth tags fail closed;
- insert/update parameters never contain raw Club ids, user ids, roles/statuses, or answers in the encrypted ledger;
- owner/admin/mod/member authorization remains identical after cutover;
- ordinary members/nonmembers still cannot see request counts or records;
- create, add, remove, role change, approve, deny, count, 1,000-cap, notification, visibility, delete, and linked-chat access work from encrypted records;
- backfill dry run, apply idempotence, and purge behavior are covered;
- no Club membership edge remains derivable through `conversation_members` after purge;
- existing ordinary DM and Group membership behavior remains unchanged.

## Files in the current Clubs slice

New/untracked files created during the slice include:

- `server/sql/197_club_tag_search.sql`
- `server/sql/198_club_membership_conversations.sql`
- `server/sql/199_club_moderator_roles.sql`
- `server/sql/200_group_club_notification_controls.sql`
- `server/sql/201_club_visibility_controls.sql`
- `server/src/club-schema.ts`
- `server/src/routes/clubs.ts`
- `server/src/clubs-routes.test.ts`
- `server/src/club-role-routes.test.ts`
- `src/app/lib/clubsApi.ts`
- `src/app/lib/visibilityControls.ts`
- `src/app/components/ClubDirectoryPanel.tsx`
- `src/app/components/ClubDetail.tsx`
- `src/app/components/ClubDetail.test.tsx`
- `docs/plans/2026-10-01-parties-clubs-start-contract.md`

The shared `TagInput` files are also new/untracked, but they are classified under the separate universal-tag merge unit below because Feed and Profile depend on them too.

Modified Clubs/shared files are visible in `git status`. Important ones include `server/src/app.ts`, `server/src/migrate.ts`, `server/src/message-schema.ts`, `server/src/routes/messages.ts`, `src/app/App.tsx`, `DirectMessages`, `PrivateGroupChat`, `InAppShareDialog`, their focused tests, shared tag-editor adopters, `DESIGN_DECISIONS.md`, and message API files.

## Non-Club and shared work in the dirty diff

This section exists specifically for merge decisions. Do not resolve the mixed files below with a whole-file `ours` or `theirs`; that would silently discard either the Club work or an independently requested cross-surface change.

### 1. Universal tag editor: Feed and Profile are changed too

Julien said “every tag editor please,” not only Club tags. The new shared `TagInput` accepts `#tag` plus Enter, normalizes to lowercase storage without `#`, renders removable chips, rejects invalid characters, enforces each surface's limit, and supports surface-specific validation.

Non-Club files:

- `src/app/components/LocalFeed.tsx`: replaces the Feed composer's custom tag draft/Add/chip implementation with `TagInput`. The cruush+ tag gate, ten-tag limit, error state, and submitted `tags` array remain.
- `src/app/components/ProfileEdit.tsx`: replaces the Profile tag draft/Add/chip implementation with `TagInput`. It preserves the profile tag limit and the check that rejects tags already represented by structured profile fields. Saving no longer silently submits an uncommitted draft; Enter/Add commits each tag first.
- `src/app/components/TagInput.tsx`: shared control used by Feed, Profile, Club creation, and Club settings.
- `src/app/components/TagInput.test.tsx`: focused normalize/add/remove coverage.

Merge recommendation: keep these four files/hunks together if the universal tag rule is retained. If a merge intentionally defers Feed/Profile adoption, keep `TagInput` for Clubs but explicitly drop only the two adopter hunks; do not overwrite all of `LocalFeed.tsx` or `ProfileEdit.tsx`.

Verification note: the final captured focused run included `TagInput.test.tsx` and the client production build, but did not independently rerun the full Local Feed or Profile Edit suites after the final handoff-only edits. Re-run those suites before merging this cross-surface unit.

### 2. DM and ordinary Group settings became dedicated pages

Julien requested the same dedicated-page treatment for DMs, Groups, and Clubs while preserving the existing settings-menu style.

Non-Club/shared files and hunks:

- `src/app/App.tsx`: adds `/chat/:chatId/settings` and `/chat/group/:chatId/settings`, both rendering the existing `PrivateGroupChat` component.
- `src/app/components/PrivateGroupChat.tsx`: the settings control navigates to a routed settings page; settings mode uses `AppPageHeader`, hides the chat/composer, and keeps the existing settings controls.
- `src/app/App.test.tsx` and `src/app/components/PrivateGroupChat.test.tsx`: route and navigation coverage was updated for the dedicated pages.

Merge recommendation: treat the two routes, the `PrivateGroupChat` settings-mode hunks, and their tests as one atomic unit. If the merge target already has a different settings-page implementation, port the requested behavior into that implementation instead of choosing either full file.

### 3. Ordinary Group notification controls

The notification request explicitly covered Groups as well as Clubs. Each Group/Club member can choose `All messages`, `@me only`, and a temporary mute.

Non-Club/shared files and hunks:

- `server/sql/200_group_club_notification_controls.sql`: adds `notification_level` and `muted_until` to `conversation_members` for both ordinary Groups and linked Clubs.
- `server/src/routes/messages.ts`: returns notification state, adds the notification-update endpoint, suppresses muted Group/Club delivery, and delivers mention-only notifications when the message contains the recipient's `@name` or `@everyone`.
- `src/app/lib/messagesApi.ts`: adds notification types/state and the update call.
- `src/app/components/PrivateGroupChat.tsx`: renders the two controls for every Group/Club settings page.
- `src/app/components/PrivateGroupChat.test.tsx`: UI coverage for selecting `@me only` and an eight-hour mute.

Verification gap: no new dedicated server test in this diff directly calls the notification-update endpoint or proves mention-only delivery suppression. The filtered server run passed surrounding existing notification tests, but the merge owner should add focused endpoint and delivery tests before shipping this unit.

Merge recommendation: migration 200, server select/mapping/notification delivery/update endpoint, client API types, settings controls, and tests must move together. Do not merge only the UI or only the migration. Direct-message notification behavior was intentionally left unchanged.

### 4. Ordinary Group chats now cap at 100 total members

This was a separate explicit request paired with the 1,000-member Club cap.

Non-Club/shared files and hunks:

- `server/src/message-schema.ts`: changes `MAX_GROUP_CONVERSATION_MEMBERS` from 500 to 100.
- `server/src/routes/messages.ts`: rejects Group creation with 100 or more invitees because the creator counts toward the 100 total, and atomically rejects later additions when the Group is full.
- `src/app/components/DirectMessages.tsx`: stops Group composer selection at 99 invitees, leaving one slot for the creator.
- `server/src/app.test.ts`: covers creation and later-addition caps.

Merge recommendation: keep the schema constant, create/add guards, client selection limit, and tests together. If another branch also changes Group capacity, resolve the product value deliberately; do not let conflict order choose it.

### 5. Shared Messages navigation and indicators

- `src/app/components/DirectMessages.tsx` adds unread dots to All, Unread, Groups, and Clubs. The All/Unread/Groups dots affect existing non-Club tabs.
- The same file adds the standard Back control to `Start a conversation` and removes its `new message` tagline. The direct-chat and ordinary Group choices remain present and otherwise unchanged.
- The top search retains one consistent presentation across tabs; on Clubs it searches joined Clubs while Browse uses its own field.

Merge recommendation: preserve the unread-dot calculation for existing tabs and the Start-a-conversation menu changes even if the Club tab is ported differently. `DirectMessages.tsx` is heavily mixed and must be merged by behavior/hunk, never whole-file replacement.

### 6. Shared primitives extended for Clubs, with backward-compatible defaults

- `src/app/components/MapVisibilitySurface.tsx` adds optional `description` and `searchPlaceholder` props. Existing profile/map callers receive the exact prior defaults; Clubs supply Club-specific wording.
- `src/app/components/HeartPhoto.tsx` adds optional `hideDefaultMark`. Its default is `false`, preserving every existing heart; Club placeholders set it to avoid duplicate artwork.
- `src/app/components/InAppShareDialog.tsx` keeps the existing Profile/Spot single-recipient path and adds a conditional Club recipient path. Its existing Profile share test still passes.
- `src/app/lib/messagesApi.ts` extends the structured share marker parser with `club`; existing `place` and `profile` markers remain supported.

Merge recommendation: these are shared files but their new behavior is opt-in/conditional. Keep the small primitive/API extensions with the Club callers; preserve any newer upstream implementation around them.

### 7. Documentation and worktree registry

- `DESIGN_DECISIONS.md` contains the lasting Club rules plus non-Club rules for universal tag entry, Group notifications/cap, dedicated conversation settings pages, unread dots, and the deferred future Groups-to-Parties direction.
- `docs/worktrees.md` has exactly one added row registering this worktree. This is task-owned registry work, not an unrelated source change. If the worktree is retired during merge, omit or update that row rather than copying the entire file.
- `.ai-queues/01a0fa0b-48b1-76c3-98e4-66eea0909a91.md` is git-ignored session evidence and is not a merge artifact.

### Complete dirty-file classification

Club-only/new implementation:

- `server/sql/197_club_tag_search.sql`
- `server/sql/198_club_membership_conversations.sql`
- `server/sql/199_club_moderator_roles.sql`
- `server/sql/201_club_visibility_controls.sql`
- `server/src/club-schema.ts`
- `server/src/routes/clubs.ts`
- `server/src/clubs-routes.test.ts`
- `server/src/club-role-routes.test.ts`
- `src/app/lib/clubsApi.ts`
- `src/app/lib/visibilityControls.ts`
- `src/app/components/ClubDirectoryPanel.tsx`
- `src/app/components/ClubDetail.tsx`
- `src/app/components/ClubDetail.test.tsx`
- `docs/plans/2026-10-01-parties-clubs-start-contract.md`
- `docs/plans/2026-10-02-clubs-handoff.md`

Shared/mixed source that contains Club work and must be hunk-merged:

- `server/src/app.ts`
- `server/src/app.test.ts`
- `server/src/message-schema.ts`
- `server/src/migrate.ts`
- `server/src/routes/messages.ts`
- `src/app/App.tsx`
- `src/app/App.test.tsx`
- `src/app/components/DirectMessages.tsx`
- `src/app/components/DirectMessages.test.tsx`
- `src/app/components/HeartPhoto.tsx`
- `src/app/components/InAppShareDialog.tsx`
- `src/app/components/InAppShareDialog.test.tsx`
- `src/app/components/MapVisibilitySurface.tsx`
- `src/app/components/PrivateGroupChat.tsx`
- `src/app/components/PrivateGroupChat.test.tsx`
- `src/app/lib/messagesApi.ts`
- `src/app/lib/messagesApi.test.ts`
- `DESIGN_DECISIONS.md`

Non-Club source changed only for the universal tag request:

- `src/app/components/LocalFeed.tsx`
- `src/app/components/ProfileEdit.tsx`
- `src/app/components/TagInput.tsx`
- `src/app/components/TagInput.test.tsx`

Registry-only:

- `docs/worktrees.md`

No additional unrelated source change was identified in the current `HEAD` diff. That conclusion is based on inspecting every dirty tracked path against `825df13`; preserve any newer upstream edits during the eventual merge even when a current path is classified as task-owned.

## Scope and release boundary

- Parties remain deferred. Do not rename Groups to Parties in this worktree.
- No commit, push, merge, deployment, provider change, or environment-variable change was authorized or performed.
- Preserve unrelated dirty work and the other active local server on port 5173.
- Before any future publication, inventory the exact diff, resolve ownership of every dirty file, list environment-variable changes, run the focused and build checks again, and perform authenticated rendered verification from the actual candidate artifact.
