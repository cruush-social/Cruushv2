# Child-face photo safety and permanent-ban implementation summary

> 2026-07-24 policy update: adult nudity is now rejected on profile photos and every other non-message photo surface. Consensual adult nudity remains eligible only in authenticated direct and group-message attachments. Statements below describing adult nudity as generally permitted reflect the superseded 2026-07-18 policy.

> 2026-07-24 policy update: adult nudity is now rejected on profile photos and every other non-message photo surface. Consensual adult nudity remains eligible only in authenticated direct and group-message attachments. Statements below describing adult nudity as generally permitted reflect the superseded 2026-07-18 policy.

Date: 2026-07-18

Branch: `codex/stream-photo-safety`

Status at pre-push review: implemented and verified on `codex/stream-photo-safety`; user authorized the `main` release on 2026-07-18. Live bank readiness still requires deployment configuration and staging proof after the push.

## Outcome

Profile and message photos now require three independent synchronous approvals before publication or attachment:

1. PhotoDNA returns no known-CSAM match.
2. Stream returns a complete `keep` under the cruush image-safety policy.
3. Amazon Rekognition finds no definite child face. Profile photos additionally require a high-confidence person signal and no animal signal.

Rekognition `DetectFaces` returns an estimated age range for each high-confidence face:

- A range ending below 18 is treated as a definite child face. The image is rejected, the account is permanently suspended, trust is set to zero, every app feature is permanently restricted, every session is revoked, and HMAC-only device-cookie and trusted-IP ban records are written.
- A range starting below 18 and ending at or above 18 is accepted because it includes a possible adult age.
- A range starting at 18 or older is eligible.
- No detected face is eligible on message photos. A faceless profile photo remains eligible when Rekognition still returns a high-confidence `Person` signal and no animal signal.

Consensual adult nudity is permitted only in authenticated direct and group-message photos. The shared Stream policy leaves `Explicit` and `Non-Explicit Nudity` to cruush's per-surface mapper so profile photos reject them while private messages remain eligible. Violence, visually disturbing material, and hate symbols retain Stream removal rules.

Missing-human profile photos, detected animals, hate-symbol, violence/disturbing, CSAM-match, provider-error, timeout, partial, malformed, and non-`keep` outcomes fail closed. Rejected pending ciphertext and variants are deleted during the request.

In a deployed environment, profile- and message-photo upload routes stay unavailable until the signed Stream bridge, shared Stream automod, Rekognition age-safety detection, and PhotoDNA are all enabled.

Onboarding now requires a complete calendar date of birth instead of a birth year. The API validates the real day/month/year and calculates whether the 18th birthday has occurred. A first profile cannot be created with only `year_of_birth`; the server derives the profile year from the validated date. The complete date is not stored in the profile or returned by the API. This is a self-attested adult gate, not government-ID age verification.

## Stream integration

- Shared automod sends Stream a short-lived HMAC-signed URL for the sanitized pending `display` WebP variant.
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

- Violence, confidence 85+
- Visually Disturbing, confidence 80+
- Hate Symbols, confidence 70+

Stream replaces a full policy during upsert, so the read-and-preserve behavior is required.

## Child-face and profile-person enforcement

Amazon Rekognition `DetectFaces` analyzes every uploaded photo. Profile photos also use `DetectLabels`. Both analyze a metadata-free JPEG derived in memory from the server's sanitized image. Default thresholds:

- Person/human signal: 90+
- Animal signal: 80+
- Face detection confidence: 90+
- Minimum allowed age: 18

Profile photos are rejected if no high-confidence person is present or if an animal category is detected. Rekognition credentials must be restricted to `rekognition:DetectFaces` and `rekognition:DetectLabels` and must be separate from Cloudflare R2 credentials.

This is an automated estimate, not proof of chronological age. AWS documents that age ranges can overlap. The permanent ban therefore requires the returned high end to remain below 18. Overlapping ranges are accepted to avoid blocking an 18+ user, which means this layer cannot guarantee rejection of every older minor.

## Onboarding adult gate

- The onboarding UI uses a complete date field for month, day, and year.
- Both browser and API calculate age using the birthday, not `current year - birth year`.
- Invalid calendar dates and dates below age 18 are rejected.
- First-time profile creation fails if the request supplies only a birth year.
- The API discards the complete date after deriving `year_of_birth`, minimizing retained date-of-birth data.
- This prevents a year-only API bypass, but it does not prove that the entered date belongs to the person. Stronger identity-backed age assurance would require a separate vendor or document/identity workflow.

## Permanent enforcement

A definite child face or PhotoDNA match triggers:

- permanent account suspension and zero trust;
- deletion of every active session;
- permanent restrictions for feed posting, direct/group messages, group creation, profile updates, photo uploads, map visibility, and crowd visibility;
- HMAC-only device-cookie and trusted-IP ban rows;
- denial of later signup/login requests from a matching device cookie or trusted client IP.

The device cookie is a durable browser identifier, not an unbypassable hardware ID. IP bans can affect shared networks. `TRUST_PROXY_HOPS` must match the verified Coolify/Traefik proxy chain before the severe-ban feature is enabled.

## CSAM boundary

PhotoDNA runs before Stream and Rekognition. A match triggers the existing fail-closed incident, encrypted evidence, alerting, reporting, and now the same permanent access-ban workflow.

PhotoDNA is known-hash matching, not a detector for every novel abusive image. Stream's documented image categories do not expose a dedicated child-presence category. The Rekognition face-age layer addresses the bank's visible-child-face test without claiming perfect detection of faceless, obscured, or novel abusive content.

Never place illegal material in the repository or test suite. Use only provider-supplied test responses or lawful, consented fixtures.

## Coolify configuration

```env
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
AWS_ACCESS_KEY_ID=<rekognition-only-key-or-use-an-iam-role>
AWS_SECRET_ACCESS_KEY=<rekognition-only-secret-or-use-an-iam-role>
PHOTODNA_ENABLED=true
```

The Rekognition principal needs only `rekognition:DetectFaces` and `rekognition:DetectLabels`. The example assumes one trusted proxy hop; verify this before saving it. Existing Stream, signed-media, PhotoDNA, CSAM reporting, encrypted media storage, and alerting variables remain required as documented in `docs/moderation.md` and `docs/coolify-env-open-beta.md`.

At current AWS Group 2 list pricing, each image-analysis API call is $0.001 for the first one million calls per month. Message photos use one Rekognition call (about $0.001); profile photos use two (about $0.002), before free-tier credits and excluding Stream/PhotoDNA costs.

## Verification status

```text
Node.js runtime: v22.22.2
frontend production build: passed
server TypeScript build: passed
full frontend suite: 45 files / 235 tests passed
full server suite: 47 files / 421 tests passed
frontend onboarding: 1 file / 5 tests passed
child-face, policy, media, config, migration, and DOB schemas: 12 files / 89 tests passed
profile routes and uploads: 1 file / 43 focused tests passed
CSAM and PhotoDNA app paths: 1 file / 6 focused tests passed
auth, session, and suspension paths: 1 file / 4 focused tests passed
repository secret/security scan: passed
frontend dependency audit: 0 vulnerabilities
server production dependency audit: 0 vulnerabilities
git diff whitespace check: passed
```

Focused coverage includes complete-DOB onboarding, exact 18th-birthday calculation, year-only bypass rejection, adult-face allow, faceless adult-person allow, definite child-face permanent ban, age-overlap allow, profile-nudity rejection, private-message adult-nudity allowance, missing-human reject, person-plus-animal reject, direct/group message enforcement, Rekognition failure, Stream partial response, deployed upload availability, config validation, and migration ordering.

The release audit also upgraded `react-router` and `react-router-dom` to 7.18.1 and Vite to 6.4.3, resolving the reported frontend advisories. A root `package-lock.json` is included so the audited dependency graph is reproducible. The Router upgrade made notification navigation observably asynchronous in its test; the assertion now waits for the route update, with no production component behavior change.

## File-level change map

- `server/src/profile-photo-human-detection.ts`: Rekognition JPEG conversion, face-age/person/animal classification, definite-child and ambiguous-age outcomes, and fail-closed merging.
- `server/src/moderation-service.ts`, `server/src/moderation-types.ts`, `server/src/policy-mapper.ts`: apply child-face detection on profile/direct/group photos and reserve permanent enforcement for definite child ranges.
- `server/src/media-assets.ts`: shared signed Stream inspection with the adult-nudity decision delegated to the central per-surface policy.
- `server/src/photo-upload-availability.ts`: requires every strict safety layer before deployed profile- or message-photo uploads are available.
- `server/src/severe-access-bans.ts`, `server/sql/040_severe_access_bans.sql`, `server/src/trust-engine.ts`, and `server/src/routes/auth.ts`: persistent account/session/feature/device/IP enforcement.
- `server/src/config.ts`: Rekognition face/age thresholds and severe-ban/proxy guardrails.
- `server/src/stream-profile-photo-policy.ts`: keeps nudity out of the shared global removal rules so the app can reject it on profiles without blocking private messages.
- `src/app/components/ProfileOnboarding.tsx`, `server/src/profile-schema.ts`, and `server/src/routes/profiles.ts`: require and validate a complete DOB for first-time 18+ onboarding without retaining the full date in the profile.
- `.env.example`, `server/.env.example`, `docs/moderation.md`, and `docs/coolify-env-open-beta.md`: deployment variables and operational guidance.
- `package.json`, `package-lock.json`, and `src/app/components/NotificationCenter.test.tsx`: patched frontend release dependencies, reproducible install graph, and Router-compatible asynchronous navigation assertion.

## Before production enablement

1. Review this summary and the code diff.
2. Create a least-privilege Rekognition credential or task role with `DetectFaces` and `DetectLabels`.
3. Verify the Microsoft PhotoDNA endpoint and allowed/match response contract.
4. Configure CSAM reporting and the trust-and-safety alert inbox.
5. Run the Stream policy configurator, verify adult nudity has no global removal rule, and verify the app rejects it on profile photos.
6. Set the documented Coolify variables without copying secrets into git.
7. Confirm `TRUST_PROXY_HOPS` against the actual Coolify/Traefik chain before enabling IP bans.
8. Create a fresh account through visible onboarding. Confirm a birth year alone cannot proceed, an under-18 complete date is rejected, and an adult complete date succeeds.
9. Exercise one consented adult face, one consented faceless adult-person photo, one adult-nudity fixture rejected as a profile photo and allowed in a private message, and provider-supplied age-safety fixtures in staging.
10. Confirm child-face attempts never enter `profiles.photos` or message attachments, encrypted pending objects are deleted, the account is suspended, sessions are revoked, and device/IP ban rows contain hashes rather than raw identifiers.
11. Push `main` only after the user approves this pre-push summary. After deployment, complete the staging checks above before handing the build to the bank.
