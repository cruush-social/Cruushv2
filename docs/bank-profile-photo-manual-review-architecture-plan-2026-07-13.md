# Bank Profile-Photo Manual Review Architecture Plan

**Status:** Superseded; do not deploy as the bank acceptance path
**Date:** 2026-07-13
**Scope:** Bank-facing staging only
**Public production:** Manual review disabled; profile-photo uploads remain fail-closed unless automated moderation positively approves them

> Superseded on 2026-07-14 by [`docs/plans/2026-07-14-open-beta-human-photo-automod.md`](plans/2026-07-14-open-beta-human-photo-automod.md). Bank staging and public open beta use the same fully automated Stream content-safety path with no human moderator, review queue, pending approval, or staff-visible image. The manual-review implementation remains in the repository but is inactive whenever the shared Stream automod flag is enabled.

## 1. Goal

Allow a small, explicit set of real bank-test accounts to submit profile photos when Stream returns a completed `keep` recommendation but does not provide cruush's required positive adult-human proof.

The fallback must not become a general moderation queue. It exists only so the bank can exercise the real upload, encryption, moderation, review, rejection, approval, and publication path while cruush confirms Stream's facial/age-verification product or replaces it with a provider that accepts encrypted server-to-server uploads.

## 2. Non-goals

- Do not enable manual review for public production accounts.
- Do not weaken rejection of unsafe, underage, ambiguous, flagged, partial, unavailable, or malformed provider results.
- Do not enable message-photo uploads.
- Do not implement PhotoDNA until it is separately configured and verified.
- Do not create fake profiles, fake photos, seeded bank accounts, fake messages, or payment fixtures.
- Do not create a large operational moderation queue.
- Do not expose capability tokens, storage object keys, original filenames, or cruush user IDs to Stream.

## 3. Existing upload path

The existing server path already provides the important privacy controls:

1. Decode the uploaded JPEG, PNG, or WebP with `sharp`.
2. Autorotate, resize, strip metadata, and re-encode it.
3. Encrypt the sanitized bytes immediately.
4. Store only ciphertext in private S3-compatible object storage such as Cloudflare R2.
5. Create a random 32-byte, one-use, 90-second provider capability token.
6. Store only the token's SHA-256 hash.
7. Let Stream retrieve plaintext once through the silent moderation-media route.
8. Require successful capability redemption before publication.
9. Publish only an opaque UUID media URL after moderation succeeds.

The manual fallback will preserve this sequence and add a short-lived decision state after Stream redemption.

## 4. Eligibility boundary

Manual review is allowed only when every condition below is true:

```text
BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED=true
+ APP_DEPLOYMENT_STAGE=staging
+ authenticated user is in BANK_PROFILE_PHOTO_TESTER_USER_IDS
+ Stream returned status=complete
+ Stream returned recommended_action=keep
+ ordinary cruush policy mapping returned allow
+ Stream did not provide positive adult_human_body proof
+ the provider capability was successfully redeemed
= short-lived manual review
```

All other outcomes keep the existing fail-closed behavior and delete the encrypted object and grant.

Explicit underage or unsafe labels can never be converted into manual review by this fallback.

## 5. Configuration

Add the following server configuration:

```env
APP_DEPLOYMENT_STAGE=staging
BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED=false
BANK_PROFILE_PHOTO_TESTER_USER_IDS=
```

When the fallback is enabled, startup validation will require:

- `APP_DEPLOYMENT_STAGE=staging`
- At least one valid tester UUID
- `STREAM_IMAGE_BRIDGE_ENABLED=true`
- `STREAM_MODERATION_ENABLED=true`
- S3-compatible encrypted object storage
- HTTPS `MODERATION_MEDIA_BASE_URL`
- `INTERNAL_API_SECRET` containing at least 32 bytes
- A 32-byte-or-stronger `STREAM_PSEUDONYM_KEY`

Public production will use:

```env
APP_DEPLOYMENT_STAGE=production
BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED=false
BANK_PROFILE_PHOTO_TESTER_USER_IDS=
```

## 6. Data model

Create `server/sql/039_profile_photo_manual_reviews.sql` with a new `profile_photo_manual_reviews` table.

The table will retain only what is required to make and audit a short-lived decision:

- Review UUID
- Owner UUID, never returned by the internal review API
- Media UUID
- Linked `content_reviews` UUID
- Encrypted object key and encryption envelope metadata while pending
- Opaque future media URL
- MIME type and byte size
- PhotoDNA status and request identifier, if configured
- Status: `pending`, `deleting`, `approved`, `rejected`, or `expired`
- Expiry, review, deletion, creation, and update timestamps
- Pseudonymous reviewer reference and bounded decision reason

Database invariants:

- At most one pending review per bank tester
- Unique media UUID and pending object key
- Indexed cleanup by status and expiry
- Strict MIME type and status checks
- Public database role receives no table access
- Encryption envelope metadata and object key are scrubbed after approval, rejection, or expiry

The table will not store a plaintext capability token. The 90-second capability grant is deleted after Stream redemption and before the upload response is returned.

## 7. Moderation-service contract

The image moderation service will return a discriminated outcome:

```ts
type ProfilePhotoModerationOutcome =
  | {
      status: "allowed";
      providerResult: ProviderModerationResult;
      decision: PolicyDecision;
    }
  | {
      status: "manual_review_required";
      providerResult: ProviderModerationResult;
      decision: PolicyDecision;
    };
```

The existing reject-by-default behavior remains the default. The upload route must explicitly request the manual outcome after checking both the staging flag and tester allowlist.

No penalty or negative trust event is applied merely because Stream lacks an adult-human proof label.

## 8. Upload behavior

### Immediate automated approval

The existing response remains unchanged:

```http
HTTP/1.1 201 Created

{"data":{"url":"/api/media/profile-photos/<uuid>.jpg"}}
```

### Manual review required

The server will:

1. Confirm the Stream capability was redeemed.
2. Create the pending review and queued `content_reviews` record transactionally.
3. Delete the capability grant transactionally.
4. Retain the already-encrypted ciphertext.
5. Leave `media_objects` and `profiles.photos` unchanged.
6. Return a backward-compatible response with an additive status field.

```http
HTTP/1.1 202 Accepted

{"data":{"url":"/api/media/profile-photos/<uuid>.jpg","status":"pending_review"}}
```

The future media URL returns `404` until approval creates the corresponding `media_objects` record.

### Failure

Any provider error, partial result, rejection, unredeemed grant, database failure before queue creation, or ineligible account follows the existing cleanup path and returns no usable media URL.

## 9. Internal review API

All endpoints require the existing `x-internal-secret` header, timing-safe comparison, UUID validation, bounded payloads, and internal rate limiting.

```text
GET  /api/internal/profile-photo-reviews
GET  /api/internal/profile-photo-reviews/:reviewId/image
POST /api/internal/profile-photo-reviews/:reviewId/approve
POST /api/internal/profile-photo-reviews/:reviewId/reject
```

### List response

Return only:

- Review UUID
- Pseudonymous tester reference
- MIME type and byte size
- Created and expiry timestamps
- Status
- Internal image path

Do not return owner UUIDs, object keys, encryption material, final URLs, original filenames, or raw provider results.

### Image response

The server reads ciphertext from R2, decrypts only in memory, and returns:

```text
Cache-Control: private, no-store, max-age=0
Pragma: no-cache
X-Robots-Tag: noindex, nofollow, noarchive
Referrer-Policy: no-referrer
Content-Security-Policy: default-src 'none'; sandbox
```

No plaintext review copy is written to disk or object storage.

## 10. Approval transaction

Approval will:

1. Lock the pending row using `SELECT ... FOR UPDATE`.
2. Reject expired or previously decided rows.
3. Recheck suspension, trust restrictions, photo-upload restrictions, and the four-photo limit.
4. Insert the existing encrypted object into `media_objects`.
5. Append the opaque URL to `profiles.photos` without duplication.
6. Mark the linked content review allowed.
7. Mark the manual review approved.
8. Scrub duplicated object and encryption metadata from the review row.

Repeated approval is idempotent and cannot add the same photo twice. A database failure publishes nothing; the encrypted pending object remains eligible for expiry cleanup.

Once approved, the photo remains on the tester's profile and follows the normal profile-photo lifecycle. The 30-minute quarantine limit applies only while a photo is pending; it does not automatically remove an approved photo.

## 11. Rejection and expiry

Rejection and expiry use a deletion state so approval cannot race with object deletion:

1. Atomically transition `pending` to `deleting`.
2. Delete the ciphertext from R2.
3. Transition to `rejected` or `expired`.
4. Scrub object and encryption metadata.
5. Retain only the minimal audit record.

If R2 deletion fails, the row remains retryable and cannot be approved. The existing cleanup command will retry it every five minutes.

The proposed pending TTL is 30 minutes. With five-minute cleanup, ciphertext should ordinarily be removed within 35 minutes of upload if no decision is made.

## 12. Cleanup

Extend the existing command instead of creating a second operational job:

```bash
npm --prefix server run cleanup:moderation-media-grants
```

It will clean:

- Expired or revoked provider capability grants
- Expired manual reviews
- Rejected/expired review objects whose prior deletion attempt failed

Coolify continues scheduling it every five minutes.

## 13. Tester experience

The profile editor will distinguish automated approval from pending review:

- Approved: add the URL to the editable profile immediately.
- Pending: close the cropper, do not add an unavailable image, and display `Photo submitted for review.`
- Rejected: keep the existing rejection handling.

The visible photo requirement will use the exact requested copy:

```text
photos must be of you only.
```

After an administrator approves the photo, refreshing the profile loads it from the normal encrypted-media path.

## 14. Privacy and security impact

This design does not remove application-level encryption at rest. Pending photos remain ciphertext in private object storage, using opaque UUID object names.

It is not zero-knowledge. The API already decrypts sanitized bytes in memory to transmit them to Stream, and the internal review image endpoint will decrypt them in memory for an authorized cruush reviewer. This access must be disclosed accurately and limited operationally.

The main additional privacy exposure is the short manual-review window. It is constrained by:

- Explicit tester allowlisting
- One pending photo per tester
- Thirty-minute expiry
- Internal-secret authorization
- No-cache response headers
- No persistent plaintext review copies
- Minimal API metadata
- Automatic ciphertext deletion

## 15. Test plan

### Configuration

- Feature defaults disabled.
- Enabled mode requires staging.
- Empty or invalid tester allowlists fail startup.
- Weak or missing internal secret fails startup.
- Non-S3 storage fails production-mode startup.

### Moderation eligibility

- Stream `complete + keep` without adult proof enters review for an allowlisted tester.
- The same result rejects and deletes for any other user.
- Positive adult-human proof publishes immediately.
- Underage, unsafe, flag, remove, partial, timeout, unavailable, or malformed results never enter review.
- An unredeemed capability grant fails closed.

### Review lifecycle

- Only one pending review exists per tester.
- List responses omit sensitive fields.
- Image access requires the internal secret and returns no-cache headers.
- Approval is atomic and idempotent.
- Reject and expire delete ciphertext.
- Concurrent decisions produce exactly one outcome.
- Approval rechecks restrictions and photo count.
- Failed database transactions do not publish.
- Failed object deletion is retried by cleanup.

### Frontend

- Pending response displays `Photo submitted for review.`
- Pending URL is not added to the profile editor.
- Approved response retains existing behavior.
- Visible guidance is exactly `photos must be of you only.`

## 16. Focused verification commands

Use Node.js 22.12 or newer:

```bash
npm --prefix server test -- \
  src/config.test.ts \
  src/moderation-service.test.ts \
  src/profile-photo-manual-reviews.test.ts \
  src/profile-photo-manual-review-routes.test.ts \
  src/moderation-media-grants.test.ts \
  src/moderation-media-route.test.ts \
  src/app.test.ts

npm test -- src/app/components/ProfileEdit.test.tsx
npm --prefix server run build
npm run build
```

## 17. Bank staging proof

Use real accounts created through the normal visible signup flow and tester-owned, consented images.

1. Upload a consented adult photo from an allowlisted account.
2. Confirm the UI reports pending review.
3. Confirm the final media route returns `404` before approval.
4. View the photo through the authenticated internal endpoint.
5. Approve it and confirm encrypted publication.
6. Upload a neutral nonhuman image and reject it.
7. Replay the captured Stream capability URL and confirm `404`.
8. Inspect application, proxy, Coolify, and APM logs for raw-token absence.
9. Let one pending upload expire and confirm ciphertext cleanup.
10. Report honestly that Stream moderation is active through the ephemeral staging bridge and manual bank fallback, while PhotoDNA is inactive until separately verified.

## 18. Planned files

### Create

- `server/sql/039_profile_photo_manual_reviews.sql`
- `server/src/profile-photo-manual-reviews.ts`
- `server/src/profile-photo-manual-reviews.test.ts`
- `server/src/moderation-service.test.ts`
- `server/src/profile-photo-manual-review-routes.test.ts`

### Modify

- `server/src/config.ts`
- `server/src/config.test.ts`
- `server/src/moderation-service.ts`
- `server/src/routes/media.ts`
- `server/src/routes/internal.ts`
- `server/src/cleanup-moderation-media-grants.ts`
- `server/src/moderation-media-grants.test.ts`
- `server/src/app.test.ts`
- `server/.env.example`
- `src/app/lib/profileApi.ts`
- `src/app/components/ProfileEdit.tsx`
- `src/app/components/ProfileEdit.test.tsx`
- `docs/moderation.md`
- `docs/coolify-env-open-beta.md`
- `docs/bank-test-staging-readiness-2026-07-07.md`

## 19. Confirmed decisions

- Implementation work must remain local, without external Octopus providers.
- Pending encrypted photos expire after 30 minutes.
- Photos that pass manual review remain on the tester's profile normally.
- Review will use the authenticated internal API/command workflow; no browser admin screen will be added.

## 20. Implementation authorization

All architecture decisions are confirmed. Implementation may proceed locally without external provider orchestration, committing, pushing, or deployment unless separately requested.
