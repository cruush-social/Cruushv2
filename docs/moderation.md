# cruush moderation

cruush moderation is server-side automod. The browser never receives Stream secret keys, provider results, PhotoDNA keys, or trust-score internals.

Human review tooling is available to active users listed in `moderator_users`. There is still no general pre-publication human profile-photo gate for bank staging or open beta: Stream AI/moderation results, local policy mapping, report evidence, and trust-score enforcement make the save/publish decision before content is exposed. The moderator dashboard handles user reports and ordinary automod follow-up; the legacy bank manual-review code remains inactive whenever shared Stream profile-photo automod is enabled.

## Environment

Use mock moderation for local development and tests:

```env
MEDIA_STORAGE_DIR=media
MEDIA_PUBLIC_BASE_URL=http://localhost:3001
MEDIA_MODERATION_URL_SECRET=
MEDIA_MODERATION_URL_TTL_SECONDS=120
MEDIA_OBJECT_STORAGE_DRIVER=local
MEDIA_S3_BUCKET=
MEDIA_S3_ENDPOINT=
MEDIA_S3_REGION=auto
MEDIA_S3_ACCESS_KEY_ID=
MEDIA_S3_SECRET_ACCESS_KEY=
MODERATION_PROVIDER=mock
MODERATION_TIMEOUT_MS=5000
STREAM_MODERATION_ENABLED=false
STREAM_IMAGE_BRIDGE_ENABLED=false
PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED=false
PROFILE_PHOTO_REKOGNITION_ENABLED=false
PROFILE_PHOTO_REKOGNITION_REGION=us-east-1
PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE=90
PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE=80
PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE=90
PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE=18
PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS=5000
ALPHA_PROFILE_PHOTO_UPLOADS_WITHOUT_PHOTODNA_ENABLED=false
SEVERE_ACCESS_BANS_ENABLED=false
SEVERE_ACCESS_BAN_HMAC_KEY=
TRUST_PROXY_HOPS=0
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=
STREAM_API_KEY=
STREAM_API_SECRET=
STREAM_APP_ID=
STREAM_MODERATION_CONFIG_KEY=
MODERATION_MEDIA_BASE_URL=
STREAM_PSEUDONYM_KEY=
BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED=false
BANK_PROFILE_PHOTO_TESTER_USER_IDS=
PHOTODNA_ENABLED=false
PHOTODNA_API_URL=
PHOTODNA_SUBSCRIPTION_KEY=
PHOTODNA_TIMEOUT_MS=5000
```

`HUMAN_MODERATION_ENABLED` and `VITE_HUMAN_MODERATION_ENABLED` are retained as legacy configuration keys but no longer control route mounting. Moderator authorization is enforced by the backend using the authenticated session, active account status, and `moderator_users` membership.

When `STREAM_MODERATION_ENABLED=true`, `STREAM_API_KEY`, `STREAM_API_SECRET`, and `STREAM_MODERATION_CONFIG_KEY` are required at server startup.

When `STREAM_IMAGE_BRIDGE_ENABLED=true`, the server requires a `STREAM_PSEUDONYM_KEY` of at least 32 bytes. Shared automod uses the signed route under `MEDIA_PUBLIC_BASE_URL`; `MODERATION_MEDIA_BASE_URL` is required only for the dormant legacy manual-review path. Production additionally requires HTTPS and S3-backed encrypted storage. Leave the bridge disabled until provider terms and staging proof are accepted.

When `PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED=true`, the Stream image bridge must also be enabled and `BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED` must be `false`. A complete Stream `keep` is necessary but is no longer sufficient. Rekognition runs face-age detection on profile and message photos. Profile photos additionally require a high-confidence `Person` signal and no animal signal. A face whose estimated range ends below 18 is rejected and triggers the permanent account/session/device/IP enforcement path. A range that overlaps 18 is accepted so an 18+ user is not blocked by an imprecise range. A profile photo with a high-confidence `Person` label and no detected face remains eligible, allowing permitted faceless adult photos.

Deployed profile- and message-photo uploads remain unavailable unless Stream automod, the signed image bridge, and Rekognition age-safety detection are enabled, or an active alpha test temporarily opens uploads before PhotoDNA is ready. For alpha staging only, an active `ALPHA_TEST_ENABLED=true` gate applies the same no-PhotoDNA launch exception to profile- and message-photo uploads. Rekognition returns an estimated age range, not verified age. It does not verify identity, ownership, consent, or exactly one person. The product rule `photos must be of you only.` therefore still includes user attestation and reporting.

Before committing profile-photo upload changes, run the live API smoke with an actual user photo: `PROFILE_PHOTO_SMOKE_IMAGE=/path/to/photo.jpg PROFILE_PHOTO_SMOKE_COOKIE='cruush_session=...' npm run test:profile-photo-apis`. The smoke targets `https://api-staging.cruush.app` by default, preflights `/api/meta`, posts to `/api/profile-photos`, and fetches the returned `/api/media/assets/.../display` image. Do not treat mock/local upload tests as proof that Stream or Rekognition ran.

When `PHOTODNA_ENABLED=true`, `PHOTODNA_API_URL`, `PHOTODNA_OPERATION_PATH`, and `PHOTODNA_SUBSCRIPTION_KEY` are required at server startup. The adapter posts sanitized image bytes to the configured Microsoft API Management endpoint before Stream or Rekognition and blocks known-CSAM match responses. Verify the exact operation path and real allowed/blocked response contract before opening deployed profile-photo uploads. PhotoDNA is hash matching for known material; it is one layer, not a promise that every novel abusive image can be detected.

When `PROFILE_PHOTO_REKOGNITION_ENABLED=true`, the server calls Amazon Rekognition `DetectFaces` with `Attributes=[ALL]` for every photo upload and `DetectLabels` for profile photos. Both calls receive a metadata-free JPEG derived in memory from the sanitized image. Prefer an IAM role restricted to `rekognition:DetectFaces` and `rekognition:DetectLabels`; otherwise set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for a Rekognition-only principal. These credentials are separate from the Cloudflare R2 `MEDIA_S3_*` credentials.

`SEVERE_ACCESS_BANS_ENABLED=true` stores only HMAC hashes of the upload request's device cookie and trusted client IP. A definite child-face or PhotoDNA match permanently suspends the account, revokes all sessions, restricts every app feature, and prevents new signup/login requests carrying the banned device or IP identity. Set `SEVERE_ACCESS_BAN_HMAC_KEY` to an independent secret of at least 32 bytes. Set `TRUST_PROXY_HOPS` only after confirming Coolify/Traefik's actual trusted proxy chain; an incorrect value can ban a shared proxy address. A browser device cookie is a strong deterrent, not an unbypassable hardware identifier.

When `MEDIA_OBJECT_STORAGE_DRIVER=s3`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ENDPOINT`, `MEDIA_S3_ACCESS_KEY_ID`, and `MEDIA_S3_SECRET_ACCESS_KEY` are required at server startup. Cloudflare R2 is S3-compatible and does not require a separate AWS S3 account. For R2, use `MEDIA_S3_REGION=auto` and a staging-bucket-scoped token with object read/write permissions so the API can upload, serve, and delete encrypted objects.

For staging, set `MEDIA_PUBLIC_BASE_URL` to the HTTPS public API origin that serves media routes, for example `https://api-staging.cruush.app`. It must contain only the origin, with no path or trailing slash. Local development and tests may use an HTTP localhost origin. `APP_URL` should remain the user-facing app origin used by auth emails.

## Moderated Surfaces

Moderated before storage or publication:

- Profile display name, bio, pronouns, hobby, kink labels, vibes, scenes, archetypes, dating intent, availability, hosting/travel, position, and role.
- Direct and group message text.
- Local feed post text.
- Profile photo uploads.
- Direct and group message photo uploads when every deployed safety gate is enabled.
- User reports as trust-score evidence.

Not sent to Stream:

- Exact location and encrypted location envelopes.
- Encrypted sensitive profile blobs or token hashes.
- Health fields such as HIV status and prevention fields.
- Plaintext provider payloads in stored moderation records.

## Policy Defaults

Allowed by default when consensual and adult:

- Queer identity, trans identity, pronouns, sexuality, dating preferences, kink terms, and adult dating language.
- Consensual adult nudity in direct and group-message photos only, unless paired with another prohibited category.
- PnP or chemsex discussion in direct/group messages, unless paired with sales, coercion, minor safety, threats, or other prohibited content.
- Fetishization/chaser concerns are handled through user reports and trust evidence, not text blocklists or automod guesses.

Rejected before save/publish:

- Feed posts with adult explicit labels, PnP/chemsex discussion, drug sales, hate, threats, harassment, doxxing, location privacy abuse, scams, spam, commercial sex solicitation, non-consensual sexual content, minor/CSAM references, bestiality, revenge porn, or gore.
- Nude or sexually explicit images on profile photos or any other non-message photo surface. Nudity is restricted to authenticated direct and group-message attachments.
- Profile and message content with zero-tolerance labels such as minor/CSAM references, bestiality, revenge porn, credible threats, or drug sales.
- Public/feed/profile coded emoji signals for drug/PnP, commercial sex, underage sexual context, bestiality, threats, and scams. High false-positive emoji categories such as money, minor-coded, animal, weapon, and finance symbols require nearby risky context; ordinary flirting emojis are not blanket-banned.
- Profile photos that Stream, PhotoDNA, or Rekognition rejects.
- Any profile-photo response whose Stream recommendation is not an explicit `keep`, including `flag`, `remove`, `block`, `bounce`, and `shadow_block`.
- Profile photos without a high-confidence person signal or with a detected animal.
- Any profile or message photo with a detected face whose Rekognition age range ends below 18. This triggers permanent account, session, feature, device-cookie, and trusted-IP bans.
- An age range overlapping 18 is allowed because it includes a possible adult age. This protects 18+ users but means age estimation alone cannot guarantee rejection of every older minor.

When shared Stream automod is enabled, publication requires all three synchronous approvals: PhotoDNA non-match, Stream completion, and Rekognition age-safety approval. Profile photos also require person/no-animal approval and reject high-confidence `Explicit` or `Non-Explicit Nudity` labels even when Stream recommends `keep`. Direct and group-message photos may contain consensual adult nudity. Rejected encrypted pending assets are deleted.

Approved direct and group message photos must post through the same transactional photo-message helper after moderation succeeds. That helper separately verifies conversation membership, closed-state, sender account status, trust score, suspensions, feature restrictions, media ownership, and attachment creation. An active trusted sender in an open conversation with an approved photo must receive a created message with its attachment in the response; missing preconditions must return a specific error instead of the generic `Messaging is unavailable for this account.` failure.

If Stream is unavailable, partial, pending, or returns an error, content is not saved. The request fails closed with `MODERATION_UNAVAILABLE`.

## Reports

Reports are created through `POST /api/reports`. The reporter is taken from the session, not the request body, and report creation is rate-limited.

The product exposes report actions for profiles, profile photos, feed posts, conversations, and individual incoming messages. The server verifies that the reporter can see or participate in the targeted content and derives the reported user from stored data.

Each report creates:

- A `reports` row.
- A flagged `content_reviews` audit row.
- An `evidence_events` row when a target user is known.

The trust engine weights reports by reporter trust score and account age. Reports are both automod evidence and human queue items. Fetishization/chaser concerns use this report path.

## Moderator Dashboard

The authenticated dashboard is available at `/admin/moderation` and is linked from Settings only for sessions whose user has an `admin` or `moderator` role.

Provision a moderator with an explicit database grant:

```sql
insert into moderator_users (user_id, role)
values ('<existing-active-user-uuid>', 'moderator')
on conflict (user_id) do update set role = excluded.role;
```

The dashboard and `/api/admin/moderation/*` routes provide:

- one paginated queue for all user reports and every ordinary non-allowed `content_reviews` record;
- report, automod, open, closed, and combined filters;
- decrypted live context for retained posts and messages, recent context for conversation reports, public profile context, and no-store moderator media previews;
- report resolution/dismissal linked to the corresponding content-review state;
- automod review approval/rejection;
- removal of reported posts, messages, and profile photos;
- account restoration, under-review state, and suspension;
- full moderator action history for the selected report or review;
- append-only access events whenever a moderator opens retained content detail or a decrypted media preview.

New reports store their linked `content_review_id` transactionally. Migration `041_unified_moderation_queue.sql` backfills older links from the report audit metadata. The UI uses server-side limit/offset pagination, so older reports do not disappear behind a fixed recent-item cap.

Known-CSAM/PhotoDNA incidents are deliberately excluded from the general moderator queue. They remain in the separately authenticated `/api/internal/csam-incidents/*` reporting workflow. Rejected pre-storage content is represented by its provider labels and policy decision; the system does not retain a new plaintext or media copy merely to populate the queue.

## Stream Setup

In Stream dashboard:

1. Enable Moderation for the app.
2. Create a moderation policy whose key matches `STREAM_MODERATION_CONFIG_KEY`.
3. Enable AI text moderation and image moderation.
4. Configure only `Violence`, `Visually Disturbing`, and `Hate Symbols` to remove at the thresholds committed in `configure-stream-profile-photo-safety.ts`. The shared Stream policy must not globally remove `Explicit` or `Non-Explicit Nudity`, because the app applies the stricter surface rule: reject them outside messages and allow consensual adult nudity only in direct/group-message photos.
5. Configure borderline categories to flag only when cruush should reject or fail closed without human review.
6. Avoid blocklists that treat queer identity terms, trans terms, kink terms, or consensual adult dating language as violations by themselves.
7. Configure every Stream action other than `keep` as a cruush rejection. Ordinary non-allowed decisions are visible as follow-up evidence in the moderator dashboard, but a dashboard review does not make unapproved content public.
8. Run `npm --prefix server run configure:stream-profile-safety` with the Stream environment variables loaded. The command reads the existing policy first and preserves the non-image engines because Stream replaces the full policy on upsert.
9. Verify the saved policy in Stream Dashboard. Stream does not provide a human-presence category; the direct Rekognition gate supplies that signal.
10. Verify PhotoDNA against real allowed and blocked provider responses before enabling deployed photo uploads.

## Staging Profile-Photo Bridge

Bank-facing staging uses the temporary capability bridge only for profile photos:

```env
APP_DEPLOYMENT_STAGE=staging
STREAM_MODERATION_ENABLED=true
STREAM_IMAGE_BRIDGE_ENABLED=true
PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED=true
PROFILE_PHOTO_REKOGNITION_ENABLED=true
PROFILE_PHOTO_REKOGNITION_REGION=us-east-1
PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE=90
PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE=80
PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE=90
PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE=18
PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS=5000
SEVERE_ACCESS_BANS_ENABLED=true
SEVERE_ACCESS_BAN_HMAC_KEY=<independent-random-secret-at-least-32-bytes>
TRUST_PROXY_HOPS=1
AWS_ACCESS_KEY_ID=<rekognition-only-access-key-or-use-an-iam-role>
AWS_SECRET_ACCESS_KEY=<rekognition-only-secret-key-or-use-an-iam-role>
STREAM_API_KEY=<staging-stream-api-key>
STREAM_API_SECRET=<staging-stream-api-secret>
STREAM_APP_ID=<staging-stream-app-id>
STREAM_MODERATION_CONFIG_KEY=<staging-stream-moderation-config-key>
STREAM_PSEUDONYM_KEY=<random-secret-at-least-32-bytes>
BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED=false
BANK_PROFILE_PHOTO_TESTER_USER_IDS=
MEDIA_OBJECT_STORAGE_DRIVER=s3
PHOTODNA_ENABLED=true
PHOTODNA_API_URL=<verified-microsoft-photodna-api-base-url>
PHOTODNA_OPERATION_PATH=<verified-microsoft-photodna-operation-path>
PHOTODNA_SUBSCRIPTION_KEY=<microsoft-photodna-subscription-key>
CSAM_REPORTING_ENABLED=true
TRUST_SAFETY_ALERT_EMAIL=<private-trust-safety-inbox>
```

Set `MEDIA_PUBLIC_BASE_URL` to the public API origin. Stream receives a signed `GET /api/media/moderation/:assetId/display` URL that expires after 30-300 seconds (120 by default). The route is session-free, serves only the sanitized pending display variant, rejects `HEAD`, sends `no-store`, and returns a generic `404` for invalid, expired, tampered, deleted, inactive-owner, or non-pending assets. The private original is never eligible.

The API sends Stream only the short-lived inspection URL, an opaque moderation correlation ID, and an HMAC-based user pseudonym. Stored moderation records must not contain the signed URL, cruush user ID as the provider identity, original filename, final media URL, or object key.

The route uses silent Fastify request logging. Before launch, inspect Coolify ingress, reverse-proxy access logs, CDN/WAF logs, and APM/error tooling and confirm signed query strings are not retained. Application redaction cannot erase signatures captured by an upstream proxy.

Stream can fetch temporarily decrypted photo bytes and may retain or process submitted media or moderation-derived data under Stream's contract and product terms. The bridge reduces exposure but does not provide zero-knowledge moderation or prove provider-side zero retention.

Run cleanup every five minutes from a private scheduler attached to the API environment:

```cron
*/5 * * * * cd /app/server && pnpm cleanup:moderation-media-grants
```

The command deletes legacy expired grants and abandoned pending media, including canonical and variant ciphertext, purges moderator content-access events after 180 days, and recalculates a batch of trust profiles with decaying negative trust events. Shared automod deletes rejected files during the request; the scheduler covers process crashes and other abandoned uploads after five minutes. Approved photos leave quarantine and remain attached through the normal lifecycle. Message-photo uploads use the same signed display-variant bridge and the same temporary alpha launch exception as profile-photo uploads.

Run `pnpm --dir server trust:recalculate` for a one-time trust recovery pass after deploying trust policy changes.

The legacy internal bank-review endpoints remain compiled but must not be used for bank staging or open beta. With `BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED=false`, they are unavailable. The archived design is documented in `docs/bank-profile-photo-manual-review-architecture-plan-2026-07-13.md`.

## Open Beta Storage Direction

Current branch state:

- Messages and feed posts are stored in Postgres.
- Profile and message photos are decoded with Sharp, normalized, and re-encoded into metadata-free thumbnail/display variants.
- Sanitized canonical bytes and metadata-free variants are envelope-encrypted under separate private object keys. Raw uploaded bytes are never written to object storage.
- New media rows begin in `pending`; only non-explicit approvals can attach to profiles. Adult explicit approvals are eligible only for authenticated direct/group-message attachments.
- Pending, rejected, failed, and `approved_explicit` assets return `404` from normal media routes.
- Development and tests use local encrypted object storage; production config requires S3-compatible object storage.
- The media storage directory is not registered as a static route. All media access is authenticated and purpose-aware.
- Existing encrypted media created by the prior synchronous moderation route is treated as legacy-approved. Profile URLs without a matching approved media row are moved to `legacy_media_quarantine` and removed from visible profile arrays.
- Stream receives a short-lived signed URL for only the sanitized pending `display` variant. The moderation route works without a user session, validates an HMAC-bound asset, purpose, method, variant, and expiration, and then reads and decrypts the private variant through the existing storage abstraction.
- Signed moderation responses are `no-store`, reject `HEAD`, and return a generic `404` for invalid, expired, tampered, deleted, inactive-owner, or non-pending assets. Private originals are never eligible.

Signed moderation URL operations:

- Generate `MEDIA_MODERATION_URL_SECRET` independently from session, profile, token, and storage-encryption secrets.
- Rotate it by replacing the environment value and restarting the API. Rotation intentionally invalidates inspections already in flight; clients should retry the upload after the new deployment is healthy.
- Never log full inspection URLs, query signatures, or the signing secret.
- Invalid or expired inspection requests fail closed without changing media state.

Provider follow-up:

- Test real Stream decisions for approved, explicit, uncertain, timeout, and malformed responses in staging.
- Prefer encrypted server-to-server byte upload under no-retention terms when a provider supports it. The provider-neutral bridge can then be replaced without changing the frontend upload contract.

Recommended beta storage setup:

- Add private S3-compatible object storage such as Cloudflare R2 or AWS S3.
- Encrypt photo bytes on the API server before upload using envelope encryption.
- Store only object keys, ciphertext metadata, moderation status, and key version in Postgres.
- Serve media through authenticated API routes or short-lived signed URLs, not public buckets.

Do not rely on the API container filesystem for open beta media. Local filesystem media is only for local development and tests.

## Local Testing

Recommended commands:

```bash
npm --prefix server test
npm --prefix server run build
corepack pnpm test
corepack pnpm build
```

Manual checks:

- Save a profile with queer/kink/dating terms and confirm it saves.
- Try a threatening profile bio and confirm it is rejected before profile storage.
- Create a feed post with chemsex/PnP language and confirm it is rejected.
- Send a DM with chemsex/PnP language and confirm it is allowed.
- Send a threat or drug-sales message and confirm it is rejected before message storage.
- Upload a safe profile photo that mock mode can identify, such as a fixture filename containing `adult-human`, and confirm it appears in `profiles.photos`. For the shared Stream path, use a mocked complete `keep` plus a mocked high-confidence Rekognition `Person` result and confirm no manual-review row is created.
- Upload a nude profile photo and confirm it is rejected, its encrypted quarantine objects are deleted, and no profile URL is attached.
- Upload the same permitted adult-nudity fixture in a direct or group message and confirm the route returns `201`, the response contains the `message_photo` attachment, `viewOnce` is preserved when requested, the attachment is available only through authenticated message-media access, and the user is never shown `Messaging is unavailable for this account.` when the conversation and sender are otherwise eligible.
- Upload a non-human or gradient profile photo and confirm its temporary encrypted quarantine object is deleted without publication.
- Upload an image filename containing `underage` in mock mode and confirm its temporary encrypted quarantine object is deleted without publication.
- Submit a report and confirm an evidence signal is created for the reported user.

## Remaining Bank-Readiness Gaps

- Bank-facing open-beta readiness still requires Microsoft PhotoDNA endpoint/path/response verification before describing the deployed profile- and message-photo path as fully ready.
- DM and group image attachments use the same photo-safety pipeline; verify the message upload path separately from the profile-photo smoke.
- Stream does not yet replace the app database as the chat/feed/media substrate; this slice keeps the current Postgres routes and adds moderation gates.
- Rekognition verifies a visible person signal, but age, identity, ownership, and exactly-one-person guarantees remain out of scope.
- Private photos are represented in moderation surfaces but no separate private-photo product flow exists yet.
