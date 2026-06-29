# Cruush Moderation

Cruush moderation is server-side. The browser never receives Stream secret keys, moderation provider results, or internal review endpoints.

## Environment

Required for local/server runtime:

```env
MODERATION_PROVIDER=mock
STREAM_MODERATION_ENABLED=false
STREAM_API_KEY=
STREAM_API_SECRET=
STREAM_APP_ID=
STREAM_MODERATION_CONFIG_KEY=cruush-default
MODERATION_TIMEOUT_MS=5000
INTERNAL_API_SECRET=
```

Use `STREAM_MODERATION_ENABLED=false` for local development unless the app has a public HTTPS `APP_URL` reachable by Stream. When `STREAM_MODERATION_ENABLED=true`, `STREAM_API_KEY`, `STREAM_API_SECRET`, and `STREAM_MODERATION_CONFIG_KEY` are required at server startup.

## Content Types

Moderated before storage or publication:

- Profile display name, bio, pronouns, hobby, kink labels, vibes, scenes, archetypes, dating intent, availability, hosting/travel, position, and role.
- Direct and group message text.
- Local feed post text.
- Profile photo uploads.
- User reports.

Not sent to Stream:

- Exact location and encrypted location envelopes.
- Encrypted sensitive profile blobs or token hashes.
- Health fields such as HIV status and prevention fields.
- Private message text in logs or local raw moderation records.

## Statuses

`content_reviews.status` remains for compatibility. New workflow state lives in `content_reviews.moderation_status`:

- `allowed`: content passed moderation and may be stored/published.
- `pending_review`: provider result was delayed, partial, unavailable, or queued for manual review.
- `flagged`: a user report or provider flag needs review.
- `blocked`: content was rejected before storage.
- `removed`: a moderator removed content or marked it removed.

Local `moderation_raw_result` stores only sanitized provider metadata such as action, status, review item id, rule name, and labels. It must not contain message/profile plaintext.

## Cruush Policy Defaults

Allowed by default when consensual and adult:

- Queer identity, trans identity, pronouns, sexuality, dating preferences, kink terms, and adult dating language.
- Adult explicit labels outside public feed contexts unless paired with a prohibited category.

Blocked or queued depending on severity:

- Threats, hate, harassment, doxxing, location privacy abuse, scams, spam, drug sales, coercion, non-consensual sexual content, explicit minor/CSAM references, revenge porn, impersonation, and chaser/fetishizing language toward trans or queer users.

Chaser/fetishizing language is queued for review instead of treated as consensual kink.

## Reports And Review

Reports are created through `POST /api/reports`. The reporter is taken from the session, not the request body. Existing report rate limiting still applies.

Each report also creates a flagged `content_reviews` item with metadata linking the report, reporter, target user, target type, conversation id, and message id when available.

Internal review endpoints:

- `GET /api/internal/moderation/queue`
- `POST /api/internal/moderation/reviews/:reviewId/actions`

Both require `x-internal-secret: INTERNAL_API_SECRET`. The action body must include `reviewerUserId`. Reviewers cannot review their own authored content, their own reports, or reports targeting themselves.

Supported actions:

- `approve`
- `remove`
- `block`
- `mark_reviewed`

Approving a queued profile photo appends it to `profiles.photos` if the user has room and the URL is not already attached.

## Stream Dashboard Setup

In Stream dashboard:

1. Enable Moderation for the app.
2. Create a moderation policy whose key matches `STREAM_MODERATION_CONFIG_KEY`.
3. Enable AI text moderation and image moderation.
4. Configure severe categories for remove/block: threats, hate, non-consensual sexual content, minor/CSAM references, doxxing, scams, impersonation, and severe harassment.
5. Configure borderline categories for flag/review.
6. Avoid blocklists that treat queer identity terms, trans terms, kink terms, or consensual adult dating language as violations by themselves.
7. For image moderation, use review/flag thresholds for borderline nudity and strict remove/block thresholds for illegal or non-consensual content.

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
- Send a safe message and confirm it stores.
- Send a threat or drug-sales message and confirm it is rejected before message storage.
- Upload a safe profile photo and confirm it appears in `profiles.photos`.
- Submit a report and confirm it appears in `GET /api/internal/moderation/queue`.
- Confirm `GET /api/internal/moderation/queue` returns 403 without `x-internal-secret`.

## Known Limitations

- Stream webhooks are not yet wired. Pending async Stream review completion must be handled by internal review tooling.
- There is no full admin UI yet; the app exposes protected backend endpoints for future tools.
- Private photos are represented in moderation surfaces but no separate private-photo product flow exists in this codebase yet.
- Feed comments are not present in this codebase yet; add the same text moderation wrapper when comments are introduced.
- Provider raw payloads are minimized, not encrypted. Do not add plaintext content to `moderation_raw_result`.
