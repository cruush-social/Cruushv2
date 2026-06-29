# Stream Moderation Implementation Notes

This file documents the Stream/GetStream moderation integration work, how it was implemented, and why the main choices were made. It is intentionally more detailed than `docs/moderation.md`, which is the operator-facing setup and usage guide.

## Goals

- Add Stream Moderation without exposing Stream secrets to the frontend.
- Keep moderation server-side, modular, and compatible with the existing Fastify/PostgreSQL app.
- Protect users from harassment, threats, hate, coercion, scams, doxxing, CSAM/minor sexual content, non-consensual sexual content, impersonation, spam, and abusive chaser/fetishizing behavior.
- Avoid treating consensual adult dating, queer identity, trans identity, kink language, and NSFW adult language as abuse by default.
- Avoid sending unnecessary sensitive data to moderation providers.
- Add review queue primitives without inventing a full admin UI.

## Files Changed

Configuration and dependency files:

- `.env.example`
- `server/.env.example`
- `server/package.json`
- `server/package-lock.json`
- `server/src/config.ts`
- `server/src/config.test.ts`

Moderation core:

- `server/src/moderation-types.ts`
- `server/src/moderation-provider.ts`
- `server/src/moderation-service.ts`
- `server/src/policy-mapper.ts`
- `server/src/policy-mapper.test.ts`
- `server/src/moderation-provider.test.ts`

Database and migrations:

- `server/sql/023_stream_moderation.sql`
- `server/src/migrate.ts`

Routes:

- `server/src/routes/profiles.ts`
- `server/src/routes/messages.ts`
- `server/src/routes/posts.ts`
- `server/src/routes/media.ts`
- `server/src/routes/reports.ts`
- `server/src/routes/internal.ts`

Tests and docs:

- `server/src/app.test.ts`
- `docs/moderation.md`
- `docs/stream-moderation-implementation-notes.md`

## How The Integration Was Added

### 1. Provider abstraction

The existing moderation code already had a local/mock provider shape and policy mapper. I kept that architecture instead of introducing a separate moderation subsystem.

`server/src/moderation-provider.ts` now contains:

- `MockModerationProvider`, which remains the default for local development and tests.
- `StreamModerationProvider`, which uses `@stream-io/node-sdk` server-side.
- `createModerationProvider`, which returns Stream only when `STREAM_MODERATION_ENABLED=true`.

Why:

- This keeps local development deterministic.
- It avoids pushing Stream dependencies into route code.
- It keeps Stream credentials server-only.
- It lets the app disable provider calls safely when Stream is not configured.

### 2. Stream SDK usage

The server dependency `@stream-io/node-sdk` was added. The installed SDK exposes `client.moderation.check(...)`, so the adapter uses that API for both text and image checks.

The request includes:

- `entity_type`, mapped from the Cruush surface.
- `entity_id`, based on the content id when available.
- `entity_creator_id` and `user_id`.
- `config_key`, from `STREAM_MODERATION_CONFIG_KEY`.
- `moderation_payload.texts` or `moderation_payload.images`.
- `options.force_sync=true`, so route behavior can make an immediate allow/block/pending decision where Stream can return one.

Why:

- The official SDK method gives one integration point for profile text, messages, posts, and images.
- Entity types preserve enough context for Stream dashboard review without sending extra private profile fields.
- Synchronous checks preserve existing request flows better than creating a separate async queue runner at this stage.

### 3. Environment configuration

`server/src/config.ts` now supports:

- `STREAM_MODERATION_ENABLED`
- `STREAM_API_KEY`
- `STREAM_API_SECRET`
- `STREAM_APP_ID`
- `STREAM_MODERATION_CONFIG_KEY`

When `STREAM_MODERATION_ENABLED=true`, config validation requires `STREAM_API_KEY`, `STREAM_API_SECRET`, and `STREAM_MODERATION_CONFIG_KEY`.

Why:

- Missing production moderation secrets should fail clearly at startup.
- Local development should continue to work with Stream disabled.
- `STREAM_APP_ID` is accepted because Stream dashboards commonly expose it and the plan requested it, but the installed SDK check call only requires key/secret/config key for this path.

### 4. Policy mapping

`server/src/policy-mapper.ts` maps normalized provider labels into Cruush decisions:

- `allow`
- `quarantine`
- `reject`
- `remove_existing`

These become stored moderation statuses:

- `allowed`
- `pending_review`
- `blocked`
- `removed`
- `flagged`

Cruush-specific behavior:

- Adult nudity and explicit adult language are allowed on private or profile surfaces by default.
- Explicit adult content is rejected from the feed surface.
- PnP/chemsex discussion is allowed in private messages but restricted from public feed posting.
- Chaser/fetishizing language is queued for review, not treated as generic sexual content.
- Minor sexual content, bestiality, and revenge porn are zero-tolerance.
- Threats, hate, doxxing, scams, harassment, and illegal solicitation apply trust/evidence effects through the existing trust engine.

Why:

- A dating app needs adult-context moderation, not generic content sanitization.
- Queer/trans/kink language should not become a false-positive category by itself.
- Severe safety categories need immediate blocking and trust effects.
- Chaser behavior often needs human review because wording and context matter.

### 5. Provider result minimization

Stream responses are normalized and sanitized before storage.

Stored raw result data is limited to:

- recommended action
- status
- task id
- review queue item id
- triggered rule metadata
- flag type/reason/labels

The app does not store plaintext message/profile content in `moderation_raw_result`.

Why:

- DMs, profile fields, queer identity metadata, and sexual preferences can be highly sensitive.
- Moderation records need enough metadata for review and audit, but not duplicate private user content unnecessarily.

### 6. Database migration

`server/sql/023_stream_moderation.sql` extends `content_reviews` with:

- `content_id`
- `content_ref`
- `moderation_status`
- `flagged_reason`
- `moderation_provider`
- `moderation_raw_result`
- `reviewed_by`
- `reviewed_at`

It also backfills `moderation_status` and `moderation_provider` from existing columns and adds queue-oriented indexes.

Why:

- The existing `content_reviews` table was the right place to add provider/status metadata.
- Backfilling keeps old rows compatible.
- `content_ref` gives route-specific review context without a large schema split.

### 7. Profile moderation

`server/src/routes/profiles.ts` moderates user-editable public/freeform-like profile text before saving:

- display name
- bio
- custom pronouns
- custom hobby
- kink labels
- vibes
- scenes
- archetypes
- looking for
- availability
- hosting/travel
- position
- role

It intentionally does not send encrypted sensitive profile blobs, exact location, health fields, or private identity metadata to Stream.

Why:

- Public/freeform fields are the highest moderation value and lowest privacy risk.
- Exact location and health/identity metadata are not needed for text abuse classification.
- The app already encrypts sensitive profile data, so moderation should not break that boundary.

### 8. Message and feed moderation

`server/src/routes/messages.ts` and `server/src/routes/posts.ts` use the reusable moderation service before content is persisted.

Allowed content writes a single `content_reviews` row with provider metadata through `approvedContentReviewCte`.

Blocked or queued content is not persisted as the original message/post.

Why:

- Existing flows already gated content before save.
- Keeping the review write in the same database query for allowed content preserves route behavior and test shape.
- Rejected content should not become visible or deliverable.

### 9. Profile photo moderation

`server/src/routes/media.ts` validates image type and size, writes the upload to the profile-photo media directory, sends a public `APP_URL` image URL to moderation, and then:

- appends the photo to `profiles.photos` only when allowed;
- queues review and leaves the upload out of `profiles.photos` when moderation is pending/unavailable;
- deletes the file when moderation rejects it.

Why:

- Stream image moderation needs a reachable image URL.
- Pending images should not become profile photos until reviewed.
- Rejected images should not remain on disk.

Audit correction made during this follow-up:

- I found that a queued profile photo file could remain in public static media if a moderator later chose `remove` or `block`.
- I fixed `server/src/routes/internal.ts` so remove/block actions for queued profile photos delete the stored file.
- I added a regression test in `server/src/app.test.ts` for that behavior.

### 10. Reports

`server/src/routes/reports.ts` preserves the existing report creation, validation, rate limiting, and evidence behavior. After a report is created, it now calls `createUserReport(...)`, which creates a flagged `content_reviews` queue item.

The report review item stores:

- reporter id
- reported user id when available
- target type
- conversation id when available
- message id when available
- reason
- whether details were present

It does not duplicate the freeform report details into `moderation_raw_result`.

Why:

- Reports should flow into the same moderation queue as provider-flagged content.
- Reviewers need routing context, but freeform report details can contain sensitive content.

### 11. Internal review endpoints

`server/src/routes/internal.ts` adds:

- `GET /api/internal/moderation/queue`
- `POST /api/internal/moderation/reviews/:reviewId/actions`

Both require `x-internal-secret` to match `INTERNAL_API_SECRET`.

Review actions:

- `approve` sets `moderation_status='allowed'`.
- `remove` sets `moderation_status='removed'`.
- `block` sets `moderation_status='blocked'`.
- `mark_reviewed` keeps the review flagged but records reviewer/timestamp.

Self-review is rejected when the reviewer is:

- the content owner;
- the reporter;
- the reported/target user.

Why:

- There is no existing admin UI, so backend endpoints are the smallest useful admin surface.
- `INTERNAL_API_SECRET` matches the existing internal route model.
- Self-review prevention is required for trust and abuse-report integrity.

### 12. Tests

Added or updated tests for:

- safe queer/dating profile language allowed;
- consensual adult/kink terms not auto-blocked;
- threats labeled for enforcement;
- explicit minor-safety content blocked;
- chaser/fetishizing language flagged;
- missing Stream env vars failing clearly;
- provider pending/error states queued;
- Stream recommended actions handled case-insensitively;
- report creation creating flagged moderation queue items;
- profile text moderation rejection;
- internal queue secret protection;
- internal queue listing;
- self-review rejection;
- moderation action status updates;
- queued profile photo cleanup on remove/block.

Validation run after the audit fix:

- `npm --prefix server run build`
- `npm --prefix server test`

Both passed.

## Reasoning Checks And Fixes

During this follow-up, I rechecked the implementation against the plan and found two issues worth fixing:

1. Stream recommended actions were compared case-sensitively in a few places.
   - Fix: normalize `recommended_action` to lowercase before mapping `flag` and `remove`.
   - Why: provider output should not bypass policy mapping because of response casing.

2. Queued profile photo files could remain publicly served if a moderator removed or blocked them later.
   - Fix: remove/block actions now delete pending profile-photo files from the configured media directory after validating the stored URL shape.
   - Why: a hidden or removed photo should not remain available through the static `/media` route.

No other reasoning errors were found in the audited paths.

## Important Limitations

- Stream webhooks are not wired yet. The current integration relies on synchronous checks and local review endpoints.
- There is no full moderator UI because the app does not have an existing admin dashboard.
- Private photos and feed comments are not fully implemented as app features yet; the moderation service has reusable hooks for those future routes.
- Provider raw results are minimized but not encrypted at the database layer.
- Pending profile-photo uploads require `APP_URL` to be publicly reachable by Stream for real image moderation.

