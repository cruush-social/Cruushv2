# cruush moderation

cruush moderation is server-side automod. The browser never receives Stream secret keys, provider results, PhotoDNA keys, or trust-score internals.

There is no human moderation queue in this implementation. Stream AI/moderation results, local policy mapping, report evidence, and trust-score enforcement make the save/publish decision before content is stored or exposed.

## Environment

Use mock moderation for local development and tests:

```env
MEDIA_STORAGE_DIR=media
MEDIA_PUBLIC_BASE_URL=https://localhost:5173
MEDIA_OBJECT_STORAGE_DRIVER=local
MEDIA_S3_BUCKET=
MEDIA_S3_ENDPOINT=
MEDIA_S3_REGION=auto
MEDIA_S3_ACCESS_KEY_ID=
MEDIA_S3_SECRET_ACCESS_KEY=
MODERATION_PROVIDER=mock
MODERATION_TIMEOUT_MS=5000
STREAM_MODERATION_ENABLED=false
STREAM_API_KEY=
STREAM_API_SECRET=
STREAM_APP_ID=
STREAM_MODERATION_CONFIG_KEY=
PHOTODNA_ENABLED=false
PHOTODNA_API_URL=
PHOTODNA_SUBSCRIPTION_KEY=
PHOTODNA_TIMEOUT_MS=5000
```

When `STREAM_MODERATION_ENABLED=true`, `STREAM_API_KEY`, `STREAM_API_SECRET`, and `STREAM_MODERATION_CONFIG_KEY` are required at server startup.

When `PHOTODNA_ENABLED=true`, `PHOTODNA_API_URL`, `PHOTODNA_OPERATION_PATH`, and `PHOTODNA_SUBSCRIPTION_KEY` are required at server startup. The current adapter posts image bytes to the configured Microsoft API Management endpoint and blocks configured match responses. Verify the exact operation path and sample response from the Microsoft portal before enabling it for staging.

When `MEDIA_OBJECT_STORAGE_DRIVER=s3`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ENDPOINT`, `MEDIA_S3_ACCESS_KEY_ID`, and `MEDIA_S3_SECRET_ACCESS_KEY` are required at server startup. For Cloudflare R2, use `MEDIA_S3_REGION=auto`.

For staging, set `MEDIA_PUBLIC_BASE_URL` to the public API origin that serves authenticated media routes, for example `https://api-staging.cruush.app`. `APP_URL` should remain the user-facing app origin used by auth emails.

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
- Profile photos that Stream or later PhotoDNA cannot approve.

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
7. For profile image moderation, reject anything not confidently an adult human profile photo. PhotoDNA must be enabled with the verified Microsoft operation path before bank/payment-processor staging review.

## Open Beta Storage Direction

Current branch state:

- Messages and feed posts are stored in Postgres.
- Profile photos upload as cruush-encrypted object bytes.
- Development and tests use local encrypted object storage; production config requires S3-compatible object storage.
- Server-side encryption exists for selected sensitive profile/location/relationship fields, message text, feed text, and profile photo bytes.

Recommended next slice:

- Keep chat messages, feed text, profile photo bytes, and DM/group image attachments in cruush-controlled encrypted storage.
- Move production media bytes from local encrypted object storage to private S3-compatible object storage.
- Keep Stream as a moderation signal and possible notification/chat substrate, but do not make it the only plaintext source of truth for sensitive user content.
- Keep cruush Postgres as the source for account, trust score, profile privacy, encrypted content metadata, sensitive profile fields, and payment/compliance state.
- Keep PhotoDNA and trust-score enforcement server-side before media becomes visible.

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
- Upload a safe profile photo and confirm it appears in `profiles.photos`.
- Upload an image filename containing `underage` in mock mode and confirm the file is rejected and removed.
- Submit a report and confirm an evidence signal is created for the reported user.

## Remaining Bank-Readiness Gaps

- PhotoDNA is wired through a configurable adapter, but it still needs Microsoft portal endpoint/path/response verification before staging.
- DM and group image attachments use the encrypted media object flow.
- Stream does not yet replace the app database as the chat/feed/media substrate; this slice keeps the current Postgres routes and adds moderation gates.
- Private photos are represented in moderation surfaces but no separate private-photo product flow exists yet.
