# NSFW photo safety error codes

Date: 2026-08-06

Scope: profile photos, map/profile avatars, direct and group message avatars, message photo attachments, favorite images, and feed/user photo surfaces.

This registry exists because an explicit image can only be treated as fixed when every break point has a stable code, a fail-closed behavior, and a testable owner. Unknown or missing explicit classification is unsafe.

## Core rule

```ts
unknown !== safe;
non_explicit === safe;
explicit === masked;
uncertain === masked;
missing_metadata === masked;
provider_failure === blocked;
```

## Codes

| Code | Break point | Meaning | Required behavior | User copy |
| --- | --- | --- | --- | --- |
| `NSFW-UPLOAD-001` | Upload intake | File missing, corrupt, unreadable, or unsupported. | Reject upload before storage. | `This image could not be read. Try another photo.` |
| `NSFW-UPLOAD-002` | MIME normalization | Browser sent weird or empty MIME and preprocessing failed. | Reject upload before moderation. | `This image format could not be processed.` |
| `NSFW-MOD-001` | Provider unavailable | Stream, Rekognition, PhotoDNA, or configured moderation provider did not complete. | Block save or keep media pending, never approve. | `Photo safety check is temporarily unavailable. Try again later.` |
| `NSFW-MOD-002` | Provider timeout | Moderation provider exceeded timeout. | Block save or keep media pending, never approve. | `Photo safety check timed out. Try again.` |
| `NSFW-MOD-003` | Provider invalid response | Provider returned unusable labels or result shape. | Block save or keep media pending, never approve. | `Photo safety check failed. Try another photo.` |
| `NSFW-MOD-004` | Classification unknown | Image reached storage or API with `explicit_classification = unknown`. | Mask all user-facing renders and queue/reclassify. | `Photo requires review before it can be shown.` |
| `NSFW-MOD-005` | Explicit detected | Provider classified image as explicit. | Save only as explicit/approved-explicit when policy allows, and mask by default. | `Explicit photo detected. It will stay masked where required.` |
| `NSFW-MOD-006` | Moderation failed open | Upload, API, or render tried to proceed after moderation failure. | Block immediately and log an incident. | `Photo blocked because the safety check did not complete.` |
| `NSFW-DB-001` | Media row missing | API returns image URL but no matching `media_objects` row exists. | Strip or mask URL and log metadata gap. | `Photo metadata is missing. The image was hidden.` |
| `NSFW-DB-002` | Metadata mismatch | Profile, message, feed, or favorite references media owned by another user or wrong surface. | Strip or mask URL and log metadata mismatch. | `Photo metadata mismatch. The image was hidden.` |
| `NSFW-DB-003` | Approval mismatch | URL is visible but `moderation_status` is not approved or approved-explicit. | Strip URL for unapproved media; mask approved-explicit media. | `Photo is not approved for display.` |
| `NSFW-DB-004` | Explicit flag missing in API | Backend returns photo URL without explicit metadata. | Treat as missing metadata and mask. | `Photo safety metadata is missing. The image was masked.` |
| `NSFW-API-001` | Profile API leak | `/api/users`, profile, or profile-view response exposes unsafe photo URL. | Return explicit metadata or no displayable URL. | `Photo was masked because safety metadata was incomplete.` |
| `NSFW-API-002` | Mutual-map API leak | Map payload exposes unsafe photo URL or false explicit flag. | Preserve photo presence for gradient rendering, but mark masked. | `Photo was masked because safety metadata was incomplete.` |
| `NSFW-API-003` | Messaging API leak | DM or group payload exposes unsafe avatar or attachment. | Return explicit metadata or no displayable URL. | `Photo was masked because safety metadata was incomplete.` |
| `NSFW-API-004` | Feed API leak | Feed post author photo, post media, or favorite image exposes unsafe image. | Return explicit metadata or no displayable URL. | `Photo was masked because safety metadata was incomplete.` |
| `NSFW-UI-001` | `HeartPhoto` misuse | Component rendered `photo` with `masked={false}` without verified non-explicit metadata. | Treat as a client bug and mask. | `Photo hidden for safety.` |
| `NSFW-UI-002` | Unknown rendered visible | Client treated `undefined`, `null`, `unknown`, or missing metadata as safe. | Mask. | `Photo hidden until safety status is known.` |
| `NSFW-UI-003` | Surface not audited | New image surface does not call the shared masking helper. | Mask until audited. | `Photo hidden for safety.` |
| `NSFW-DL-001` | DL Mode bypass | DL Mode state allowed unknown or explicit image through incorrectly. | Mask unknown and explicit regardless of DL Mode defaults. | `Photo hidden based on your safety settings.` |
| `NSFW-REPORT-001` | Incident missing | Unsafe display happened but no support, audit, or internal incident was created. | Create a support or internal safety incident with the failing code. | `Safety incident logged.` |

## Logging contract

Every code must log:

- `code`
- `surface`
- `mediaObjectId` when known
- `ownerUserId` when known
- `viewerUserId` when known
- `publicUrlPresent`
- `moderationStatus`
- `explicitClassification`
- `classificationSource`
- `provider`
- `providerRequestId`

Do not log image bytes, screenshots, raw private URLs, or secrets.

## Acceptance gates

1. Upload: an explicit fixture is rejected or stored with `explicit_classification = explicit`; provider failure returns `NSFW-MOD-001`, `NSFW-MOD-002`, or `NSFW-MOD-003`.
2. Database: no profile, message, feed, favorite, or map image is displayable without a matching `media_objects` row.
3. API: every image payload either includes explicit metadata or omits the displayable URL.
4. UI: every `HeartPhoto` and attachment surface masks `explicit`, `uncertain`, `unknown`, `null`, and missing metadata.
5. Incident proof: the exact failing surface emits the relevant `NSFW-*` code in logs or support triage.

## Triage for the observed messaging screenshot

Use these likely codes first:

- `NSFW-API-003` if the messaging/profile API returned the avatar without correct explicit metadata.
- `NSFW-UI-002` if metadata was missing or unknown and the client still rendered the photo.
- `NSFW-UI-001` if the component passed `masked={false}` without proving `non_explicit`.

This is not complete until a real explicit DB fixture proves the image is masked in the rendered messaging surface.
