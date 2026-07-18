# cruush moderation

cruush moderation is server-side automod. The browser never receives Stream secret keys, provider results, PhotoDNA keys, or trust-score internals.

Human review tooling exists but is dormant by default. There is no human profile-photo moderation queue for bank staging or open beta. Stream AI/moderation results, local policy mapping, report evidence, and trust-score enforcement make the save/publish decision before content is exposed. The legacy bank manual-review code remains in the repository, but startup validation and route precedence keep it inactive whenever shared Stream profile-photo automod is enabled.

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
HUMAN_MODERATION_ENABLED=false
STREAM_IMAGE_BRIDGE_ENABLED=false
PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED=false
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

The frontend must also keep `VITE_HUMAN_MODERATION_ENABLED=false`. The API routes and frontend moderator screen are not mounted unless their respective flags are explicitly enabled.

When `STREAM_MODERATION_ENABLED=true`, `STREAM_API_KEY`, `STREAM_API_SECRET`, and `STREAM_MODERATION_CONFIG_KEY` are required at server startup.

When `STREAM_IMAGE_BRIDGE_ENABLED=true`, the server also requires `MODERATION_MEDIA_BASE_URL` and a `STREAM_PSEUDONYM_KEY` of at least 32 bytes. Production additionally requires an HTTPS moderation-media origin and S3-backed encrypted storage. The flag defaults to `false`; leave it disabled on public production until provider terms and staging proof are accepted.

When `PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED=true`, the Stream image bridge must also be enabled and `BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED` must be `false`. A complete Stream `keep` can then publish without the legacy adult-human/manual gate. Every non-`keep`, timeout, partial response, malformed response, or missing capability redemption fails closed.

This Stream-only phase is content-safety moderation. It does not verify age, identity, exactly one person, or even that a real person appears. Do not describe Stream `keep` as age verification or person verification. Age-only visual guesses are ignored and do not reject, reduce trust, or suspend; explicit CSAM or sexual-minor safety signals still reject. The product rule `photos must be of you only.` remains a user attestation backed by reporting until a suitable automated human-photo signal is added.

When `PHOTODNA_ENABLED=true`, `PHOTODNA_API_URL`, `PHOTODNA_OPERATION_PATH`, and `PHOTODNA_SUBSCRIPTION_KEY` are required at server startup. The current adapter posts image bytes to the configured Microsoft API Management endpoint and blocks configured match responses. Verify the exact operation path and sample response from the Microsoft portal before enabling it for staging.

When `MEDIA_OBJECT_STORAGE_DRIVER=s3`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ENDPOINT`, `MEDIA_S3_ACCESS_KEY_ID`, and `MEDIA_S3_SECRET_ACCESS_KEY` are required at server startup. Cloudflare R2 is S3-compatible and does not require a separate AWS S3 account. For R2, use `MEDIA_S3_REGION=auto` and a staging-bucket-scoped token with object read/write permissions so the API can upload, serve, and delete encrypted objects.

For staging, set `MEDIA_PUBLIC_BASE_URL` to the HTTPS public API origin that serves media routes, for example `https://api-staging.cruush.app`. It must contain only the origin, with no path or trailing slash. Local development and tests may use an HTTP localhost origin. `APP_URL` should remain the user-facing app origin used by auth emails.

## Moderated Surfaces

Moderated before storage or publication:

- Profile display name, bio, pronouns, hobby, kink labels, vibes, scenes, archetypes, dating intent, availability, hosting/travel, position, and role.
- Direct and group message text.
- Local feed post text.
- Profile photo uploads.
- User reports as trust-score evidence.

Not sent to Stream:

- Exact location and encrypted location envelopes.
- Encrypted sensitive profile blobs or token hashes.
- Health fields such as HIV status and prevention fields.
- Plaintext provider payloads in stored moderation records.

## Policy Defaults

Allowed by default when consensual and adult:

- Queer identity, trans identity, pronouns, sexuality, dating preferences, kink terms, and adult dating language.
- Adult explicit labels outside public feed contexts unless paired with a prohibited category.
- PnP or chemsex discussion in direct/group messages, unless paired with sales, coercion, minor safety, threats, or other prohibited content.
- Fetishization/chaser concerns are handled through user reports and trust evidence, not text blocklists or automod guesses.

Rejected before save/publish:

- Feed posts with adult explicit labels, PnP/chemsex discussion, drug sales, hate, threats, harassment, doxxing, location privacy abuse, scams, spam, commercial sex solicitation, non-consensual sexual content, minor/CSAM references, bestiality, revenge porn, or gore.
- Profile and message content with zero-tolerance labels such as minor/CSAM references, bestiality, revenge porn, credible threats, or drug sales.
- Profile photos that Stream or PhotoDNA rejects.
- Any profile-photo response whose Stream recommendation is not an explicit `keep`, including `flag`, `remove`, `block`, `bounce`, and `shadow_block`.
- Profile photos with explicit CSAM or sexual-minor safety signals. Age-only visual guesses are ignored because this build has no reliable photo age-verification provider.

When shared Stream automod is enabled, a complete Stream `keep` is sufficient for the automated content-safety gate. It is not proof that the photo is adult, human, single-person, or owned by the uploader. Explicit profile-photo labels still fail closed and the encrypted pending asset is deleted until explicit-content display controls are implemented.

If Stream is unavailable, partial, pending, or returns an error, content is not saved. The request fails closed with `MODERATION_UNAVAILABLE`.

## Reports

Reports are created through `POST /api/reports`. The reporter is taken from the session, not the request body, and report creation is rate-limited.

Each report creates:

- A `reports` row.
- A flagged `content_reviews` audit row.
- An `evidence_events` row when a target user is known.

The trust engine weights reports by reporter trust score and account age. Reports are automod evidence, not a human work queue. Fetishization/chaser concerns use this report path.

## Stream Setup

In Stream dashboard:

1. Enable Moderation for the app.
2. Create a moderation policy whose key matches `STREAM_MODERATION_CONFIG_KEY`.
3. Enable AI text moderation and image moderation.
4. Configure severe categories for remove/block: threats, hate, non-consensual sexual content, minor/CSAM references, doxxing, scams, impersonation, drug sales, bestiality, and severe harassment.
5. Configure borderline categories to flag only when cruush should reject or fail closed without human review.
6. Avoid blocklists that treat queer identity terms, trans terms, kink terms, or consensual adult dating language as violations by themselves.
7. Configure every Stream action other than `keep` as a cruush rejection; there is no human queue behind `flag`.
8. Configure non-human/abstract/object/logo/animal/cartoon/screenshot outcomes to remove where Stream offers those categories, while recognizing that Stream does not provide a contractual exactly-one-person gate.
9. Keep PhotoDNA disabled and describe it as inactive until the Microsoft operation path and response contract are separately verified.

## Staging Profile-Photo Bridge

Bank-facing staging uses the temporary capability bridge only for profile photos:

```env
APP_DEPLOYMENT_STAGE=staging
STREAM_MODERATION_ENABLED=true
STREAM_IMAGE_BRIDGE_ENABLED=true
PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED=true
STREAM_API_KEY=<staging-stream-api-key>
STREAM_API_SECRET=<staging-stream-api-secret>
STREAM_APP_ID=<staging-stream-app-id>
STREAM_MODERATION_CONFIG_KEY=<staging-stream-moderation-config-key>
MODERATION_MEDIA_BASE_URL=https://moderation-media-staging.cruush.app
STREAM_PSEUDONYM_KEY=<random-secret-at-least-32-bytes>
BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED=false
BANK_PROFILE_PHOTO_TESTER_USER_IDS=
MEDIA_OBJECT_STORAGE_DRIVER=s3
PHOTODNA_ENABLED=false
```

Route `moderation-media-staging.cruush.app` directly to the API. Do not attach session cookies, enable CDN caching, or expose the private object bucket. `GET` and `HEAD /api/moderation-media/:token` are intentionally cookie-free; `HEAD` does not consume a grant, while only the first valid `GET` can decrypt sanitized bytes in memory. Used, revoked, expired, and unknown grants return `404`.

The API sends Stream only the capability URL, an opaque moderation correlation ID, and an HMAC-based user pseudonym. Stored moderation records must not contain the capability URL or token, cruush user ID as the provider identity, original filename, final media URL, or object key.

The route uses silent Fastify request logging and never logs the token itself. Before bank review, inspect Coolify ingress, reverse-proxy access logs, CDN/WAF logs, and APM/error tooling and confirm the raw request path and query are not retained for this hostname. Application redaction cannot erase tokens captured by an upstream proxy.

Stream can fetch temporarily decrypted photo bytes and may retain or process submitted media or moderation-derived data under Stream's contract and product terms. The bridge reduces exposure but does not provide zero-knowledge moderation or prove provider-side zero retention.

Run cleanup every five minutes from a private scheduler attached to the API environment:

```cron
*/5 * * * * cd /app/server && pnpm cleanup:moderation-media-grants
```

The command deletes expired grants and abandoned pending media, including canonical and variant ciphertext. It also keeps legacy manual-review cleanup available, although the manual decision path is disabled for shared automod. Revoked grants remain unreadable and become cleanup-eligible at their original 90-second expiry. Uploads also run a small opportunistic cleanup batch. Approved photos leave quarantine and remain on the tester's profile under the normal profile-photo lifecycle. Message-photo uploads are not part of this bridge and must remain disabled for bank review until the profile-photo path is proven.

The legacy internal bank-review endpoints remain compiled but must not be used for bank staging or open beta. With `BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED=false`, they are unavailable. The archived design is documented in `docs/bank-profile-photo-manual-review-architecture-plan-2026-07-13.md`.

## Open Beta Storage Direction

Current branch state:

- Messages and feed posts are stored in Postgres.
- Profile and message photos are decoded with Sharp, normalized, and re-encoded into metadata-free thumbnail/display variants.
- Sanitized canonical bytes and metadata-free variants are envelope-encrypted under separate private object keys. Raw uploaded bytes are never written to object storage.
- New media rows begin in `pending`; only a non-explicit approval atomically attaches a display URL to a profile or message.
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
- Upload a safe profile photo that mock mode can identify, such as a fixture filename containing `adult-human`, and confirm it appears in `profiles.photos`. For the shared Stream path, use a mocked complete `keep` response and confirm no manual-review row is created.
- Upload a non-human or gradient profile photo and confirm its temporary encrypted quarantine object is deleted without publication.
- Upload an image filename containing `underage` in mock mode and confirm its temporary encrypted quarantine object is deleted without publication.
- Submit a report and confirm an evidence signal is created for the reported user.

## Remaining Bank-Readiness Gaps

- PhotoDNA is inactive and must remain described as inactive until Microsoft portal endpoint/path/response verification passes.
- DM and group image attachments are outside the profile-photo bridge and remain disabled for bank review.
- Stream does not yet replace the app database as the chat/feed/media substrate; this slice keeps the current Postgres routes and adds moderation gates.
- Stream does not verify age, identity, or exactly one real human; those guarantees remain out of scope for this Stream-only phase.
- Private photos are represented in moderation surfaces but no separate private-photo product flow exists yet.
