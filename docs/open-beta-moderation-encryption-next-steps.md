# Open Beta Moderation And Encryption Next Steps

> Update (2026-07-21): the automod save/publish decision remains fail-closed, and authorized human follow-up is now available through the unified moderator dashboard. Known-CSAM incidents remain in the separately restricted internal reporting workflow.

## Summary

Current branch: `codex/stream-moderation-merge`

Local commit: `5c43b9b Integrate Stream automod foundation`

This branch merged the first Stream automod foundation into the app. The system is designed around automated moderation, not human moderators. Stream AI and moderation tools act as automod inputs, and the cruush trust-score automod uses those inputs, local policy mapping, reports, and trust evidence to decide what can be saved, published, restricted, or rejected.

Chaser and fetishization concerns are report-driven. They should not be handled by a broad text blocklist or guessed from message/profile language unless a later policy step defines exact public-surface terms, emoji patterns, and coded phrases.

The current media upload implementation stores profile photo files on the API server filesystem. That is acceptable for local testing, but it is not open-beta ready. Open beta should use private object storage plus cruush-controlled application-layer encryption.

The open beta encryption target is server-side, cruush-controlled application-layer encryption, not end-to-end encryption. The backend can decrypt when authorized for product, moderation, safety, export, deletion, and compliance workflows. Do not claim E2EE unless keys are user-held and the server truly cannot decrypt the data.

## What Was Implemented

- Added the Stream moderation provider/config foundation with fail-closed policy behavior when automated moderation cannot approve content.
- Added moderation policy mapping and trust-score enforcement for unsafe content, public feed restrictions, suspensions, feature restrictions, and evidence events.
- Added report backend routes and frontend report UI, including a fetishization report reason for report-driven trust evidence.
- Added profile photo upload backend route and profile edit upload UI with a moderation gate before photos are saved to the profile.
- Added moderation gates before feed posts, profile text, messages, and profile photos are saved or published.
- Added PhotoDNA configuration placeholders, but the PhotoDNA adapter is not implemented yet because it still needs Microsoft API Management operation path and sample request/response details.
- Added documentation clarifying that there is no human moderation queue in this implementation.

## Encryption Decision

Use cruush-controlled application-layer encryption for:

- messages
- feed text
- profile photos and message photos
- sensitive profile fields
- any future private media or report-sensitive payloads that do not need direct database filtering

The backend should moderate plaintext before encryption, then store ciphertext. Stream should receive content only as needed for moderation checks and related automod workflows. Stream should not be the only plaintext source of truth for encrypted user content if cruush wants to own the privacy and encryption story.

This gives cruush a stronger position for a queer app: database-only exposure does not reveal the most sensitive user content, while the backend can still perform moderation, reports, account safety, payment-processor review, user export, and deletion workflows.

## Open Beta Storage Direction

Use private object storage for media. Recommended default: Cloudflare R2, unless AWS S3 or another S3-compatible provider is chosen for deployment reasons.

For media uploads:

- Upload to the API server first.
- Run MIME/signature validation, Stream image moderation, and PhotoDNA checks before media becomes visible.
- Encrypt media bytes on the API server before object storage upload using envelope encryption.
- Store only object key, encrypted data key metadata, key version, media type, moderation status, PhotoDNA status, owner, and timestamps in Postgres.
- Serve photos through authenticated API routes or short-lived signed URLs.
- Do not use public buckets for original uploads.
- Do not use the API container filesystem for beta media except local testing.

For text content:

- Keep queryable only what product behavior truly needs for discovery, filtering, moderation indexing, or abuse prevention.
- Encrypt message text, feed text, and sensitive profile-field payloads before database storage.
- Use derived indexes only where exact matching/filtering is required and the privacy tradeoff is intentional.

## Next Engineering Steps

- Add an encrypted media object storage abstraction with a local adapter for development and an R2/S3 adapter for staging/open beta.
- Add encrypted message, feed, and profile-field storage using the existing server-side encryption patterns already used elsewhere in the backend.
- Implement the PhotoDNA adapter after Microsoft provides the endpoint, operation path, headers, request body, and response examples.
- Define the exact public-feed/profile banned coded-language list from user-provided Sniffies examples before adding any new public-surface blocklist rules.
- Wire real Stream credentials and a Stream moderation config in staging.
- Keep messages more permissive than the public feed for consensual adult/private discussion, while still rejecting illegal or zero-tolerance material.
- Add focused tests for encrypted media upload/read/delete, encrypted messages, encrypted feed posts, encrypted profile fields, PhotoDNA blocking, automod fail-closed behavior, and report-driven fetishization evidence.

## User-Side Setup Checklist

- Create a private R2/S3 bucket for media.
- Create a least-privilege object storage access key for the API server.
- Choose where production secrets live: deployment secrets first, KMS/Vault later if needed.
- Generate new encryption keys for media, messages, feed text, and sensitive profile fields.
- Provide PhotoDNA endpoint, subscription key, operation path, and sample request/response.
- Provide Stream API key, secret, app ID, and moderation config key.
- Provide `RESEND_API_KEY` and `MAIL_FROM` for staging signup email.
- Provide Turnstile frontend site key and `TURNSTILE_SECRET_KEY` if captcha is enabled for bank/staging signup.

## Assumptions

- R2 is the recommended object storage default unless AWS S3 is chosen.
- RabbitMQ is not needed for the immediate next slice. Add a queue only if media moderation or PhotoDNA processing needs async workers.
- Stream remains the moderation provider and possible notification/chat substrate, but cruush-owned encrypted storage is the source of truth for sensitive content.
- The next implementation should not add the Sniffies-specific coded-language blocklist until exact terms, emoji patterns, and phrases are provided.
- Local filesystem media remains allowed only for local development and tests.
