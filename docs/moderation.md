# cruush moderation

cruush moderation is server-side automod. The browser never receives Stream secret keys, provider results, PhotoDNA keys, or trust-score internals.

Human review tooling exists but is dormant by default. Stream AI/moderation results, local policy mapping, report evidence, and trust-score enforcement make the save/publish decision before content is exposed. Keep both human-moderation flags disabled until an approved moderator roster and review procedure are ready.

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
HUMAN_MODERATION_ENABLED=false
STREAM_API_KEY=
STREAM_API_SECRET=
STREAM_APP_ID=
STREAM_MODERATION_CONFIG_KEY=
PHOTODNA_ENABLED=false
PHOTODNA_API_URL=
PHOTODNA_SUBSCRIPTION_KEY=
PHOTODNA_TIMEOUT_MS=5000
```

The frontend must also keep `VITE_HUMAN_MODERATION_ENABLED=false`. The API routes and frontend moderator screen are not mounted unless their respective flags are explicitly enabled.

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
- Profile photos that do not have explicit adult-human/body proof from the image moderation provider. A generic `person`, `portrait`, nudity label, or silent image moderation allow is not enough.
- Profile photos with child, minor, underage, teen, young-looking, or otherwise age-ambiguous signals. Child/minor signals take precedence over adult or nudity labels.

Allowed profile-photo framing includes a clothed or nude adult human, with or without a face, including a clearly adult human body part. The photo still has to be of the uploader only.

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
7. For profile image moderation, reject anything that is not confidently a photo of the uploader. cruush expects a positive adult-human/body signal and rejects profile photos when the provider is silent.
8. Configure non-human/abstract/object/logo/animal/cartoon/screenshot/image-without-person outcomes to remove or return labels such as `non_human`, `no_person`, `object`, `abstract`, `gradient`, `logo`, or equivalent.
9. PhotoDNA must be enabled with the verified Microsoft operation path before bank/payment-processor staging review.

Stream image checks require an internet-accessible image URL. The current authenticated profile-media URL is not provider-readable before the upload is stored, so production Stream image uploads remain a fail-closed integration gate: add a short-lived provider-readable URL before relying on this path for successful profile-photo uploads. Do not make the encrypted media bucket public.

## Open Beta Storage Direction

Current branch state:

- Messages and feed posts are stored in Postgres.
- Profile and message photos are decoded with Sharp, normalized, and re-encoded into metadata-free thumbnail/display variants.
- Original and variant bytes are envelope-encrypted under separate private object keys.
- New media rows begin in `pending`; only a non-explicit approval atomically attaches a display URL to a profile or message.
- Pending, rejected, failed, and `approved_explicit` assets return `404` from normal media routes.
- Development and tests use local encrypted object storage; production config requires S3-compatible object storage.
- The media storage directory is not registered as a static route. All media access is authenticated and purpose-aware.
- Existing encrypted media created by the prior synchronous moderation route is treated as legacy-approved. Profile URLs without a matching approved media row are moved to `legacy_media_quarantine` and removed from visible profile arrays.

Required next media slice:

- Add a short-lived signed moderation-only URL that serves only the sanitized display variant to Stream.
- Never expose the private original through the moderation URL.
- Test token expiry and real Stream decisions for approved, explicit, uncertain, timeout, and malformed responses in staging.
- Until that preflight exists, Stream production image moderation cannot fetch pending media and uploads fail closed without publication.

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
- Upload a safe profile photo that mock mode can identify, such as a fixture filename containing `adult-human`, and confirm it appears in `profiles.photos`.
- Upload a non-human or gradient profile photo and confirm it is rejected before encrypted storage.
- Upload an image filename containing `underage` in mock mode and confirm the file is rejected before encrypted storage.
- Submit a report and confirm an evidence signal is created for the reported user.

## Remaining Bank-Readiness Gaps

- PhotoDNA is wired through a configurable adapter, but it still needs Microsoft portal endpoint/path/response verification before staging.
- DM and group image attachments use the encrypted media object flow.
- Stream does not yet replace the app database as the chat/feed/media substrate; this slice keeps the current Postgres routes and adds moderation gates.
- Private photos are represented in moderation surfaces but no separate private-photo product flow exists yet.
