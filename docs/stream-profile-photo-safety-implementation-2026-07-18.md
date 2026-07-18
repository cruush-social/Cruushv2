# Stream profile-photo safety implementation summary

Date: 2026-07-18

Branch: `codex/stream-photo-safety`

Status: implemented and locally verified; not merged or pushed to `main`

## Outcome

Profile photos now require three independent synchronous approvals before publication:

1. PhotoDNA returns no known-CSAM match.
2. Stream returns a complete `keep` under the cruush image-safety policy.
3. Amazon Rekognition returns a high-confidence person signal and no animal signal.

A Stream `keep` by itself is no longer accepted as proof that a photo contains a person. Missing-human, detected-animal, explicit/nudity, hate-symbol, violence/disturbing, CSAM-match, provider-error, timeout, partial, malformed, and non-`keep` outcomes fail closed. Rejected pending ciphertext and variants are deleted during the request.

In a deployed environment, the profile-photo upload route stays unavailable until the signed Stream bridge, shared Stream automod, Rekognition human detection, and PhotoDNA are all enabled. A missing external integration therefore disables uploads instead of taking down the rest of the API.

## Stream integration

- Shared automod now sends Stream a short-lived HMAC-signed URL for the sanitized pending `display` WebP variant.
- The private canonical original is not sent through the shared Stream path.
- The signed inspection route is session-free, rejects `HEAD`, returns `no-store`, and only serves pending media for an active owner.
- Invalid, expired, tampered, deleted, approved, or otherwise ineligible requests return a generic `404`.
- Stream user identifiers remain HMAC pseudonyms.
- The older one-time capability/grant path remains only for the dormant manual-review mode.

Run the committed policy configurator with the Stream environment loaded:

```bash
npm --prefix server run configure:stream-profile-safety
```

The configurator reads the current Stream policy first so non-image engines are preserved, then installs synchronous remove rules for:

- Explicit, confidence 70+
- Non-Explicit Nudity, confidence 85+
- Violence, confidence 85+
- Visually Disturbing, confidence 80+
- Hate Symbols, confidence 70+

Stream replaces a full policy during upsert, so the read-and-preserve behavior is required.

## Human-only enforcement

Amazon Rekognition `DetectLabels` analyzes a metadata-free JPEG derived in memory from the server's sanitized image. This keeps JPEG, PNG, and WebP uploads compatible with Rekognition's accepted byte formats. Default thresholds:

- Person/human signal: 90+
- Animal signal: 80+

The image is rejected if no high-confidence person is present or if an animal category is detected, including when a person and animal appear together. Rekognition credentials must be restricted to `rekognition:DetectLabels` and must be separate from Cloudflare R2 credentials.

This check proves only that the image visibly contains a person and no detected animal. It does not verify identity, ownership, age, or exactly one person.

## CSAM boundary

PhotoDNA runs before Stream and Rekognition. A match triggers the existing fail-closed incident, account-lock, evidence, and reporting workflow. The deployed upload route remains disabled while PhotoDNA is off.

PhotoDNA is known-hash matching, not a detector for every novel abusive image. Stream's documented image categories include explicit sexual content and hate symbols but do not expose a dedicated CSAM, bestiality, or human-presence category. The combined layers materially improve prevention without claiming perfect detection.

Before enabling uploads, verify the real Microsoft PhotoDNA operation path plus allowed and blocked response bodies, configure CSAM reporting, and conduct a controlled provider test using approved safety fixtures or provider-supplied test material. Never place illegal material in the repository or test suite.

## Configuration added

```env
PROFILE_PHOTO_REKOGNITION_ENABLED=true
PROFILE_PHOTO_REKOGNITION_REGION=us-east-1
PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE=90
PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE=80
PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS=5000
AWS_ACCESS_KEY_ID=<rekognition-only-key-or-use-an-iam-role>
AWS_SECRET_ACCESS_KEY=<rekognition-only-secret-or-use-an-iam-role>
PHOTODNA_ENABLED=true
```

The existing Stream, signed-media, PhotoDNA, CSAM reporting, encrypted media storage, and alerting variables remain required as documented in `docs/moderation.md` and `docs/coolify-env-open-beta.md`.

## Verification completed

```text
server TypeScript build: passed
focused Vitest files: 13 passed
focused Vitest tests: 87 passed
production dependency audit: 0 vulnerabilities
```

The focused coverage includes human allow, missing-human reject, person-plus-animal reject, Rekognition failure, Stream partial response, Stream request normalization, PhotoDNA response handling, deployed upload availability, signed moderation URLs, encrypted media cleanup, config validation, and policy-gate behavior.

## File-level change map

- `server/src/profile-photo-human-detection.ts`: Rekognition JPEG conversion, person/animal classification, fail-closed result merging.
- `server/src/moderation-service.ts`, `server/src/moderation-types.ts`, `server/src/policy-mapper.ts`: removed the Stream-only human bypass and added human, animal, bestiality, CSAM, hate, explicit, and provider-failure policy composition.
- `server/src/media-assets.ts`: moved shared Stream inspection to the signed pending display-variant route; retained the legacy grant path only for dormant manual review.
- `server/src/photo-upload-availability.ts`: requires every strict safety layer before deployed profile-photo uploads are available.
- `server/src/config.ts`: added Rekognition region, thresholds, timeout, and feature configuration; limited the legacy moderation origin requirement to legacy manual review.
- `server/src/stream-profile-photo-policy.ts` and `server/src/configure-stream-profile-photo-safety.ts`: preserve the current Stream policy and install the strict image rules.
- `server/package.json` and `server/package-lock.json`: added the official AWS Rekognition SDK and the Stream policy command.
- `server/src/*test.ts` files touched or added in this branch: focused policy, route, media cleanup, configuration, signed URL, human detector, WebP compatibility, and Stream policy preservation coverage.
- `.env.example`, `server/.env.example`, `docs/moderation.md`, and `docs/coolify-env-open-beta.md`: added deploy variables and updated the operational runbook.
- This file: pre-push summary and enablement checklist requested before any merge to `main`.

## Before merge or production enablement

1. Review this summary and the code diff.
2. Confirm the AWS account/region and create a least-privilege Rekognition credential or task role.
3. Verify the Microsoft PhotoDNA endpoint and response contract.
4. Configure CSAM reporting and the trust-and-safety alert inbox.
5. Run the Stream policy configurator and verify the saved rules in Stream Dashboard.
6. Set the documented Coolify variables without copying secrets into git.
7. Exercise one acceptable human fixture plus safe provider-supplied reject fixtures in staging.
8. Confirm rejected uploads never enter `profiles.photos` and encrypted pending objects are deleted.
9. Merge only after staging passes. Push `main` only after the user approves this pre-push summary.
