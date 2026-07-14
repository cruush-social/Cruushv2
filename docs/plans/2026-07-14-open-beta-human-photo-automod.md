# Bank-and-Open-Beta Stream Profile-Photo Automod Plan

**Status:** Approved for local implementation on 2026-07-14
**Scope:** Stream only; no Sightengine integration in this phase
**Publishing:** Local changes only until a separate deploy request

## Goal

Give bank staging and public open beta the same fully automated profile-photo path. Every upload is sanitized, encrypted into private quarantine, checked by Stream through the one-time capability bridge, and published only after a complete Stream `keep` response. There is no person in the routine decision path.

## Honest capability boundary

This phase provides automated Stream content-safety moderation. It does **not** verify:

- that the image contains exactly one real person;
- that the depicted person owns the cruush account;
- that the depicted person is an adult; or
- that a face is visible.

Stream `keep` means the configured Stream policy did not flag the image. It must never be described in bank, product, or compliance material as identity, person-count, or age verification. The visible user rule remains `photos must be of you only.` and is enforced through user attestation and reporting until a suitable automated human-photo signal is added.

## Active automated flow

```text
validate image type and size
→ sharp decode, autorotate, resize, metadata strip, re-encode
→ encrypt sanitized bytes
→ write ciphertext to private S3-compatible quarantine storage
→ PhotoDNA only if separately configured and verified
→ create a random one-use 90-second Stream capability
→ Stream synchronous image moderation
→ require complete response, explicit keep, and capability redemption
→ atomically publish encrypted media record and profile URL
→ delete capability grant
```

Any Stream rejection, `flag`, timeout, partial/malformed response, missing capability redemption, database failure, or storage failure fails closed. The grant is revoked/deleted and quarantine ciphertext is deleted. Users retry with another photo. Age-only visual guesses are ignored because Stream is not an age-verification provider; explicit CSAM or sexual-minor safety signals remain prohibited.

## Zero-human-moderator invariant

- Bank staging and public open beta use the same automated decision logic.
- No routine upload enters a review queue, pending-review state, staff image viewer, or human appeal.
- A Stream `flag` is rejected automatically; it is never routed to a person.
- Automated audit records are metadata-only and omit raw tokens, capability URLs, object keys, final media URLs, original filenames, and cruush user IDs sent to Stream.
- Legally required CSAM/security incident handling is separate and is not an alternate profile-photo approval path.

## Manual-review code retained but inactive

The existing manual-review implementation, migration, tests, and internal routes remain in the repository for possible future use. They are not deleted in this phase.

When `PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED=true`:

- `BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED` must be `false`;
- the upload route must never call the manual eligibility function;
- the upload route must never return `202 pending_review`;
- no manual-review row may be created; and
- Stream `keep` proceeds directly to atomic publication after all privacy checks pass.

The manual path remains reachable only when the new shared automod flag is disabled and all existing staging-only manual guardrails are explicitly enabled.

## Configuration

```dotenv
PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED=false
STREAM_MODERATION_ENABLED=false
STREAM_IMAGE_BRIDGE_ENABLED=false
STREAM_API_KEY=
STREAM_API_SECRET=
STREAM_MODERATION_CONFIG_KEY=
MODERATION_MEDIA_BASE_URL=
STREAM_PSEUDONYM_KEY=
BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED=false
```

Enabling `PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED` requires:

- Stream moderation and the one-time image bridge enabled;
- Stream credentials and a moderation config key;
- a credential-free HTTPS `MODERATION_MEDIA_BASE_URL` in production;
- a pseudonym key of at least 32 bytes;
- private S3-compatible encrypted storage in production; and
- manual review disabled.

The flag defaults to `false`. Bank staging and public production must deploy the same code and set it to `true` only after the Stream policy and bridge hostname are configured.

## Test-first implementation tasks

1. Add configuration tests proving the new flag defaults off, requires the Stream bridge, and cannot coexist with manual review.
2. Add moderation-service tests proving a complete Stream `keep` bypasses the legacy adult-human/manual gate only while the new flag is enabled.
3. Preserve existing tests proving partial/error responses quarantine and `flag` responses reject automatically.
4. Add route tests proving the enabled path publishes without creating a manual review or returning `pending_review`.
5. Add route failure tests proving Stream timeout/partial/no-redemption cases publish nothing and delete grants/ciphertext.
6. Keep the exact visible guidance `photos must be of you only.`
7. Prove age-only visual labels do not reject, penalize, or suspend; explicit CSAM/sexual-minor labels still reject under the zero-tolerance policy.
8. Update staging, open-beta, and moderation documentation with the capability boundary and exact variables.
9. Run focused server/frontend tests and both affected builds.

## Bank validation

Use only tester-owned accounts created through the visible signup flow and consented tester-owned photos. Do not use actual minor imagery.

1. Upload a consented photo and confirm the sanitized encrypted object is published only after Stream returns a complete `keep`.
2. Use a configured Stream rejection fixture and confirm no media/profile publication.
3. Force a partial response or timeout and confirm fail-closed cleanup.
4. Replay the captured capability URL and confirm `404`.
5. Inspect application, proxy, Coolify, and APM logs for absence of the raw capability token.
6. Report the result as “Stream automated content-safety moderation through an ephemeral encrypted-media bridge.” Do not report age verification, person counting, identity verification, or PhotoDNA unless separately proven active.

## Deferred extension

A provider-neutral human-photo adapter can be added later if cruush obtains acceptable terms and a technically suitable provider. That extension may enforce person count and add age-risk signals, but it is outside this Stream-only implementation and must not block or silently alter the current frontend upload contract.
