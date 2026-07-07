# cruush Master Architecture And Engineering Handoff

Last updated: 2026-07-07

Current branch at time of writing: `main`

Current commit at time of writing: `468ca9a Add encrypted message photo attachments`

This is the master engineering handoff for cruush. It is written so a co-developer can keep working while the founder is away without waiting for repeated product direction.

## How To Use This Document

Use this document as the engineering command center.

- `docs/design-master.md` remains the canonical product, design, voice, and UX intent guide.
- This file is the canonical implementation, architecture, and next-work-order guide.
- Current source code wins over older implementation notes when this file and the code agree.
- Older docs remain useful history, but they may describe pre-Stream, pre-encrypted-media, or pre-group-message states.
- If another document conflicts with this one, follow this one unless the founder gives a newer explicit decision.
- If this document conflicts with current code, inspect code and update this document in the same change.

Do not block waiting for the founder on questions already answered here. Continue with the default decisions in this document. Only ask the founder for the few product/legal/provider choices listed under "Founder Questions That Are Still Valid."

## Existing Docs And Their Roles

Use these files as supporting references:

- `docs/design-master.md`: product north star, brand, copy, UX, required screens, profile/filter design, safety UX.
- `docs/moderation.md`: current automod policy, Stream setup, public/profile coded-language rules, fail-closed behavior, PhotoDNA and media storage direction.
- `docs/open-beta-infrastructure-readiness.md`: Coolify, VPS, R2/S3, backups, production secrets, staging smoke test.
- `docs/open-beta-moderation-encryption-next-steps.md`: original moderation/encryption decision record from the Stream merge.
- `docs/trust-safety-moderation-core-implementation.md`: trust-score and moderation foundation implementation history.
- `docs/reports-profile-photos-messages-implementation.md`: report MVP, first media upload pass, live message UI cleanup. Some media details are now superseded by encrypted object storage.
- `docs/sensitive-data-encryption-plan.md`: field classification strategy for application-layer encryption.
- `docs/rotating-encrypted-token-system-white-paper.md`: profile-sensitive encryption and blind token design.
- `docs/recent-security-hardening.md`: session, rate-limit, URL validation, and key derivation hardening notes.
- `docs/self-hosted-migration.md`: self-hosted migration and Coolify path. Migration list there may lag current code; `server/src/migrate.ts` is the migration source of truth.
- `docs/architecture-whiteboard.md`: useful high-level graph, but the photo moderation section is stale where it talks about NudeNet as the target. Current target is Stream moderation plus PhotoDNA plus cruush-owned encrypted storage.

Do not treat marketing/waitlist website copy as an executable engineering spec unless the feature is also represented in this repo or explicitly added to this document.

## Non-Negotiable Product Decisions

These decisions are already made.

- Product name is `cruush`, lowercase in user-facing copy.
- cruush is a web-first queer cruising app for immediate nearby intent.
- The map and local proximity loop are the core product surface.
- It is not a native app strategy and should not optimize around App Store or Play Store restrictions.
- The product may host adult content and NSFW user photos; design around adult-web compliance, consent, moderation, provider terms, payment processor constraints, and user control.
- The safety promise is user control, privacy, consent, block/report, location controls, and discreet safety tools. Do not claim the app can keep someone physically safe.
- Stream is a moderation provider and possible future notification/chat substrate, not the sole source of truth for sensitive plaintext user content.
- cruush-owned server-side/application-layer encrypted storage is the open beta privacy target.
- Do not claim end-to-end encryption. The backend can decrypt when authorized because the server holds the keys.
- There is no human moderation queue for launch. Stream moderation, local policy mapping, trust-score automod, reports, and feature restrictions decide what saves or publishes.
- Chaser/fetishization handling is report-driven, not blocklist-driven.
- Public feed and public/profile text are stricter than DMs/groups.
- DMs/groups may allow consensual adult drug discussion, including chemsex/PnP discussion, but not drug sales, underage sexual content, bestiality, threats, hate, nonconsensual content, exploitation, revenge porn, or other illegal/zero-tolerance material.
- Public feed, profile display names, and profile bios must block coded language for drugs/chemsex, commercial sex, underage content, and bestiality according to the current moderation rules.
- Bank/payment-processor readiness is not a fake demo path. Treat it as the staging/open-beta production path.

## Current Runtime Architecture

The current app is a self-hosted web app with these layers:

- Browser frontend: React, Vite, TypeScript, Tailwind/Radix-style components.
- API server: Fastify, TypeScript, cookie auth, Zod validation, Postgres-backed rate limiting.
- Database: Postgres, SQL migrations in `server/sql`, migration runner in `server/src/migrate.ts`.
- Media storage: encrypted media object abstraction with local storage for tests/dev and S3-compatible storage for production.
- Moderation: mock provider locally, Stream provider when configured, PhotoDNA adapter when configured, policy mapper, trust engine.
- Deployment target: Coolify-managed frontend, API, Postgres 16, env vars, SSL, logs, and backups.
- Object storage target: private Cloudflare R2 buckets or another S3-compatible bucket.

Local development:

- Frontend: `https://localhost:5173` by default.
- API: `http://localhost:3001`.
- Postgres: `localhost:5433` with the bundled Docker compose path.
- Launcher: `npm run dev:local`.
- Seeded launcher: `npm run dev:local:seeded`.
- Node baseline: Node `>=22.12.0`. Avoid debugging Node 20-only failures as product bugs.

Primary runtime files:

- `src/main.tsx`: frontend entrypoint.
- `src/app/App.tsx`: auth gate and route map.
- `src/app/lib/apiClient.ts`: API base URL, credentials, error parsing, media URL resolution.
- `server/src/index.ts`: server entrypoint.
- `server/src/app.ts`: Fastify app builder, route registration, CORS, security headers, multipart/static registration, health/meta routes.
- `server/src/config.ts`: environment contract and production guardrails.
- `server/src/db.ts`: Postgres connection.
- `server/src/migrate.ts`: migration order.
- `server/sql/*.sql`: database schema source.

## Current Frontend Route Map

Auth and bootstrap live in `src/app/App.tsx`.

Signed-out users:

- `*`: `Auth`
- `/verify-email`: `VerifyEmail`
- `/reset-password`: `ResetPassword`

Signed-in but unverified:

- `EmailVerificationGate`
- `/verify-email`
- `/reset-password`

Signed-in and onboarded:

- `/map`: `MapHome`
- `/feed`: `LocalFeed`
- `/profile`: `ProfileView`
- `/profile/:userId`: `ProfileView`
- `/profile/edit`: `ProfileEdit`
- `/filters`: `FiltersPanel`
- `/safety`: `SafetyCenter`
- `/groups/:groupId`: `GroupDetail`
- `/events/:eventId`: `EventDetail`
- `/places/:placeId`: `PlaceDetail`
- `/chat/:chatId`: `PrivateGroupChat`
- `/chat/group/:chatId`: `PrivateGroupChat`
- `/messages`: `DirectMessages`
- `/report`: `ReportPage`
- `/cruush`: `CruushActivity`
- `/settings`: `Settings`
- `/privacy/audit`: `PrivacyAudit`
- `/lucky`: `FeelingLucky`
- `/requests`: `RequestsDashboard`

Frontend API wrappers:

- `src/app/lib/authApi.ts`
- `src/app/lib/sessionUser.ts`
- `src/app/lib/profileApi.ts`
- `src/app/lib/usersApi.ts`
- `src/app/lib/postApi.ts`
- `src/app/lib/messagesApi.ts`
- `src/app/lib/cruushApi.ts`
- `src/app/lib/reportApi.ts`
- `src/app/lib/privacyApi.ts`
- `src/app/lib/locationApi.ts`

Frontend conventions:

- Use existing shared UI components before adding one-off controls.
- Use `resolveMediaUrl` for app-owned media paths.
- Keep `credentials: 'include'` for API calls.
- Do not put secrets in frontend env vars.
- Keep phone browser UX first.
- Keep bottom nav routes stable unless the product model changes.
- If adding group admin UI, add API helper functions in `src/app/lib/messagesApi.ts` first, then UI/tests.

## Current Backend Route Map

Registered in `server/src/app.ts`:

- `registerAuthRoutes`
- `registerMediaRoutes`
- `registerMessageRoutes`
- `registerUserRoutes`
- `registerCruushRoutes`
- `registerPostRoutes`
- `registerProfileRoutes`
- `registerPrivacyRoutes`
- `registerReportRoutes`
- `registerInternalRoutes`
- `registerDevRoutes` only outside production

Global behavior:

- CORS allowlist comes from `CORS_ORIGIN`.
- State-changing requests with an Origin not in `CORS_ORIGIN` are rejected with `403`.
- Auth is cookie-based, not frontend-supplied user IDs.
- Session cookies are HttpOnly.
- API errors are normalized by `server/src/errors.ts`.
- Multipart uploads are globally capped at 5 MB and 1 file unless route-level logic narrows/clarifies behavior.
- Basic security headers are set on every request.
- HSTS is enabled in production.

Core endpoints:

- `GET /health`
- `GET /api/meta`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/verification/send`
- `POST /api/auth/verification/resend`
- `POST /api/auth/verification/verify`
- `POST /api/auth/password/forgot`
- `POST /api/auth/password/reset`
- `GET /api/users`
- `GET /api/profiles/me`
- `GET /api/profiles/:userId`
- `PUT /api/profiles/me`
- `PUT /api/profiles/me/location`
- `GET /api/profiles/me/privacy-settings`
- `PUT /api/profiles/me/privacy-settings`
- `GET /api/posts`
- `POST /api/posts`
- `GET /api/conversations`
- `POST /api/conversations/dm`
- `POST /api/conversations/groups`
- `PATCH /api/conversations/groups/:conversationId`
- `POST /api/conversations/groups/:conversationId/members`
- `DELETE /api/conversations/groups/:conversationId/members/:targetUserId`
- `POST /api/conversations/groups/:conversationId/admins`
- `DELETE /api/conversations/groups/:conversationId/admins/:targetUserId`
- `POST /api/conversations/groups/:conversationId/close`
- `GET /api/messages/:conversationId`
- `POST /api/messages`
- `POST /api/messages/photos`
- `POST /api/profile-photos`
- `GET /api/media/profile-photos/:filename`
- `GET /api/media/message-photos/:filename`
- `POST /api/reports`
- `GET /api/cruush/me`
- `GET /api/cruush/mutual-map`
- `DELETE /api/cruush/matches/:otherUserId`
- `GET /api/cruush/:userId`
- `POST /api/cruush`
- `GET /api/location/display-key`
- `GET /api/privacy/ghost-mode`
- `POST /api/privacy/ghost-mode`
- `GET /api/privacy/audit`
- `POST /api/privacy/revoke`

## Database And Migration Contract

Migration order is defined in `server/src/migrate.ts`. Do not rely on stale migration lists in older docs.

Current migrations:

- `001_init.sql`
- `002_profiles.sql`
- `003_profiles_migration_slice.sql`
- `004_posts.sql`
- `005_cruushes.sql`
- `006_auth_session_upgrade.sql`
- `007_email_verification_tokens.sql`
- `008_messages.sql`
- `009_direct_messages.sql`
- `010_profile_locations.sql`
- `011_password_reset_tokens.sql`
- `012_substance_boundaries.sql`
- `013_kink_fetish_interests.sql`
- `014_profile_role_and_kink_visibility.sql`
- `015_profile_sensitive_tokens.sql`
- `016_profile_visibility_rules.sql`
- `017_rate_limit_buckets.sql`
- `018_match_visibility_relationships.sql`
- `019_encrypted_relationship_storage.sql`
- `020_ghost_mode_location_privacy.sql`
- `021_reports.sql`
- `022_moderation_foundation.sql`
- `023_stream_moderation.sql`
- `024_open_beta_storage_messaging.sql`
- `025_message_media_attachments.sql`

Migration rules:

- Keep migrations idempotent where possible.
- Append new migrations; do not edit already-deployed migrations unless explicitly coordinating a destructive reset for local-only dev.
- Add the new SQL filename to `server/src/migrate.ts`.
- Add tests around schema-dependent route behavior when adding tables/columns used by app code.
- Server Docker deploys should run `npm run migrate` before `npm run start`.

Important tables and responsibilities:

- `app_users`: app-owned auth user records.
- `app_sessions`: hashed session token records.
- `email_verification_tokens`: hashed email verification token records.
- `password_reset_tokens`: hashed password reset token records.
- `profiles`: public/queryable profile envelope and encrypted sensitive/visibility columns.
- `profile_sensitive_tokens`: HMAC blind indexes for protected profile filters.
- `posts`: expiring local feed posts with encrypted body columns.
- `cruushes`: cruush interaction/match state.
- `conversations`: DM/group envelope, title, timers, close state.
- `conversation_members`: membership, owner/admin/member roles, read state.
- `messages`: encrypted message bodies and expiry metadata.
- `message_media_attachments`: join table from messages to encrypted media objects.
- `media_objects`: encrypted object metadata, public API path, owner, moderation/PhotoDNA status.
- `reports`: user reports.
- `user_trust_profiles`: trust score, trust level, suspension flag, report weight.
- `trust_events`: immutable trust score inputs.
- `content_reviews`: moderation audit rows.
- `evidence_events`: automod evidence from AI/reports/system.
- `moderation_history`: trust/policy action history.
- `suspensions`: temporary/permanent account suspensions.
- `feature_restrictions`: feature-level restrictions such as feed, messages, profile updates, photos, map visibility.
- `rate_limit_buckets`: Postgres-backed API rate limiting.
- `location_envelopes`, visibility/location tables from ghost mode migrations: precise/fuzzed location and privacy policy data.

## Environment And Secret Contract

Production requires strong environment separation. Use Coolify/deployment secrets first. Move to Vault/KMS later only if operational complexity is justified.

Never commit real secrets. Never paste secrets into docs, chat, screenshots, or terminal output.

Production-required or important backend env vars:

- `NODE_ENV=production`
- `PORT`
- `HOST`
- `DATABASE_URL`
- `CORS_ORIGIN`
- `SESSION_SECRET`
- `APP_URL`
- `MEDIA_OBJECT_STORAGE_DRIVER=s3`
- `MEDIA_S3_BUCKET`
- `MEDIA_S3_ENDPOINT`
- `MEDIA_S3_REGION=auto`
- `MEDIA_S3_ACCESS_KEY_ID`
- `MEDIA_S3_SECRET_ACCESS_KEY`
- `MEDIA_PUBLIC_BASE_URL`
- `MODERATION_PROVIDER=mock`
- `MODERATION_TIMEOUT_MS`
- `STREAM_MODERATION_ENABLED`
- `STREAM_API_KEY`
- `STREAM_API_SECRET`
- `STREAM_APP_ID`
- `STREAM_MODERATION_CONFIG_KEY`
- `PHOTODNA_ENABLED`
- `PHOTODNA_API_URL`
- `PHOTODNA_OPERATION_PATH`
- `PHOTODNA_SUBSCRIPTION_KEY`
- `PHOTODNA_TIMEOUT_MS`
- `RESEND_API_KEY`
- `MAIL_FROM`
- `TURNSTILE_SECRET_KEY`
- `PROFILE_ENCRYPTION_KEY`
- `PROFILE_TOKEN_KEY`
- `RELATIONSHIP_ENCRYPTION_KEY`
- `RELATIONSHIP_INDEX_KEY`
- `MATCH_TOKEN_ENCRYPTION_KEY`
- `MATCH_TOKEN_SIGNING_KEY`
- `MESSAGE_ENCRYPTION_KEY`
- `FEED_ENCRYPTION_KEY`
- `MEDIA_ENCRYPTION_KEY`
- `LOCATION_ENCRYPTION_KEY`
- `LOCATION_INDEX_KEY`
- `VISIBILITY_POLICY_ENCRYPTION_KEY`
- `GHOST_DERIVATION_KEY`
- `DISPLAY_TOKEN_ENCRYPTION_KEY`

Frontend env vars are public. Keep only public settings there:

- `VITE_API_BASE_URL`
- `VITE_MAP_STYLE_URL`
- `VITE_MAP_VECTOR_TILEJSON_URL`
- `VITE_MAP_GLYPHS_URL`
- `VITE_MAP_TILE_URL`
- `VITE_MAP_ATTRIBUTION`
- Turnstile frontend site key if/when frontend captcha is enabled.

Production guardrails in `server/src/config.ts`:

- `SESSION_SECRET` must be strong and not `change-me`.
- Email preview must be disabled.
- `MEDIA_OBJECT_STORAGE_DRIVER` must be `s3`.
- Profile, relationship, match token, message, feed, media, location, visibility, ghost, and display token keys must be present and at least 32 characters.
- Stream required fields are enforced when `STREAM_MODERATION_ENABLED=true`.
- PhotoDNA required fields are enforced when `PHOTODNA_ENABLED=true`.
- S3/R2 fields are enforced when `MEDIA_OBJECT_STORAGE_DRIVER=s3`.

## Encryption Architecture

The target is cruush-controlled application-layer encryption, not E2EE.

Plain rule:

- Moderate plaintext first.
- Encrypt before storage.
- Store ciphertext plus key version and metadata.
- Decrypt only in authorized backend paths.
- Return only the plaintext needed for the viewer/request.

Current encrypted areas:

- Sensitive profile payloads.
- Profile visibility rules.
- Relationship records.
- Match tokens.
- Location/privacy envelopes.
- Feed post text.
- Message text.
- Profile photo bytes.
- Message photo bytes.

Current encryption helpers:

- `server/src/crypto-keys.ts`: key derivation.
- `server/src/profile-sensitive.ts`: sensitive profile payloads and token hashes.
- `server/src/profile-visibility.ts`: viewer-specific visibility decisions.
- `server/src/encrypted-relationships.ts`: relationship storage.
- `server/src/content-encryption.ts`: feed/message text encryption.
- `server/src/media-encryption.ts`: envelope encryption for media bytes.
- `server/src/media-storage.ts`: local/S3 encrypted object storage.
- `server/src/location-privacy.ts`: ghost/display location encryption and tokens.

Key model:

- Secrets stay on the backend/deployment secret store.
- Use separate keys per data class.
- Store key versions with encrypted rows.
- Do not casually rotate blind-index key versions; they affect lookup and need backfills.
- Encryption key version rotation is easier than index key version rotation because encrypted rows carry key versions.

Threat model:

- Protect against database-only exposure, accidental SQL/log browsing, and backup compromise without app secrets.
- Does not protect against full app server compromise.
- Does not hide metadata such as account existence, membership, timestamps, relationship edges, moderation states, or object sizes.
- Does not replace authorization checks.

Future encryption work:

- Add key registry documentation with active/deprecated/retired states.
- Add rewrap jobs for old encrypted payload versions.
- Add blind-token rederive jobs for token key rotation.
- Add export/delete paths that understand encrypted content and media.
- Add audit logs for any admin/internal decrypted-content access.

## Media Storage Architecture

Current media model:

- Profile photos and message photos upload to the API server first.
- Backend validates MIME type, file size, and image signatures.
- Backend runs PhotoDNA when enabled.
- Backend runs Stream/mock image moderation.
- Backend encrypts media bytes using envelope encryption.
- Backend writes encrypted bytes to local storage in dev/test or S3-compatible object storage in production.
- Postgres stores metadata in `media_objects`.
- Frontend receives stable API media paths, not bucket URLs.
- Media is served through authenticated API routes.

Current media routes:

- `POST /api/profile-photos`
- `GET /api/media/profile-photos/:filename`
- `POST /api/messages/photos`
- `GET /api/media/message-photos/:filename`

Current media constraints:

- Allowed MIME types: JPEG, PNG, WebP.
- Max size: 5 MB.
- Profile limit: up to 9 photos.
- Filename paths are strict UUID-based patterns.
- Profile photo read route requires authentication.
- Message photo read route requires authentication and conversation membership.
- Expired message photos are not returned through the message-photo media route.

Object storage:

- Use private R2/S3 buckets for staging/prod.
- Buckets must not be public.
- Object storage receives ciphertext, not plaintext.
- Recommended buckets:
  - `cruush-media-staging`
  - `cruush-media-prod`
- Use separate least-privilege keys per environment.

Media metadata currently stored:

- owner user id
- surface
- object key
- public API path
- media type
- MIME type
- byte size
- encrypted data key
- data key nonce/auth tag
- content nonce/auth tag
- key version
- moderation status
- PhotoDNA status
- PhotoDNA provider request id
- created/deleted timestamps

Media gaps to finish:

- Image resizing and display variants.
- Per-photo explicit/NSFW flag and blur variants.
- Profile edit UI states for pending/rejected/approved media.
- Orphan cleanup when DB write fails after object upload or message/profile save fails.
- Delete flow that marks `media_objects.deleted_at`, removes references, and deletes object storage bytes when appropriate.
- Better media metadata minimization for sensitive future private photos.
- Bank/staging smoke test against real R2.

## Moderation And Trust Architecture

Core principle: no human moderation queue for launch.

Moderation sources:

- Stream moderation when enabled.
- Local mock moderation in dev/test.
- PhotoDNA for image hashes when enabled.
- User reports as trust-score evidence.
- Local policy mapper.
- Trust engine and feature restrictions.

Current key files:

- `server/src/moderation-provider.ts`
- `server/src/moderation-service.ts`
- `server/src/moderation-types.ts`
- `server/src/policy-mapper.ts`
- `server/src/trust-engine.ts`
- `server/src/photodna.ts`
- `server/src/routes/reports.ts`
- `server/sql/022_moderation_foundation.sql`
- `server/sql/023_stream_moderation.sql`

Moderated before save/publish:

- Profile display name, bio, pronouns, hobbies, kink labels, vibes, scenes, archetypes, dating intent, availability, hosting/travel, position, role.
- Feed post text.
- Direct message text.
- Group message text.
- Profile photos.
- Message photos.
- Reports as evidence.

Not sent to Stream:

- Exact location.
- Encrypted location envelopes.
- Sensitive profile encrypted blobs.
- Blind token hashes.
- Health fields such as HIV/prevention fields, except where profile moderation text intentionally includes public labels from the submitted profile payload.
- Backend secrets.

Fail-closed rule:

- If Stream is required and cannot approve the content, do not save/publish.
- `MODERATION_UNAVAILABLE` means the write should fail closed.
- Do not silently publish unmoderated profile/feed/photo content in staging/prod.

Policy actions:

- `allow`: content can be saved.
- `reject`: content is not saved; evidence/trust/restrictions may be applied.
- `quarantine`: current launch posture treats this as fail-closed/pending, not a human queue.
- `remove_existing`: reserved for future existing-content takedown.

Trust score:

- Neutral starts at 50.
- Scores clamp from 0 to 100.
- Trust levels:
  - `restricted`: 0-20
  - `new`: 21-49
  - `established`: 50-74
  - `trusted`: 75-89
  - `verified_trusted`: 90-100
- Reports are weighted by reporter trust score/account context.
- Severe policy decisions can create evidence, trust events, trust caps, suspensions, and feature restrictions.

Feature restrictions:

- `feed_posting`
- `direct_messages`
- `group_messages`
- `group_creation`
- `profile_updates`
- `photo_uploads`
- `map_visibility`
- `crowd_visibility`

Zero-tolerance:

- Underage sexual content.
- Bestiality.
- Revenge porn/nonconsensual intimate image abuse.
- Severe credible threats as mapped by policy.

For underage/bestiality/revenge porn:

- Reject before save.
- Create evidence.
- Apply trust impact.
- Set trust to zero where policy says so.
- Apply permanent suspension where policy says so.

## Public/Profile Coded-Language Rules

These rules apply to public feed posts and profile text only.

They intentionally do not apply to private DMs/groups unless they also trigger drug sales or zero-tolerance categories.

Normalization:

- Unicode NFKC normalization.
- Lowercase.
- Remove emoji variation selectors.
- Collapse punctuation variants like `.`, `_`, `-`.
- Collapse repeated whitespace.
- Support variants like `k 9`, `k-9`, and `k.9`.

Current public/profile blocked drug/chemsex codes:

- `tina`
- `snow`
- `ski`
- `skiing`
- `skii`
- `skiiing`
- `spun`
- `point`
- `pointing`
- `party`
- `pnp`
- `party and play`
- `party n play`
- `chem`
- `chemsex`
- `ice`
- `crystal`
- `💨`
- `🎉`
- `🥳`
- `💊`
- `🎈`
- `🌀`
- `🧊`
- `⛷️`
- `❄️`

Current public/profile blocked commercial sex codes:

- `gen`
- `generous`
- `rose`
- `roses`
- `🎁`
- `🌹`
- `donation`, `tribute`, `rate`, `rates`, `menu`, `cashapp`, `venmo`, `zelle`, `paypal` when paired with meet/session/hour/hh/hookup/sex context.

Current public/profile blocked underage codes:

- `underage`
- `pedo`
- `🏈`
- `minor`, `minors`, `teen`, `teens`, `barely legal` when paired with sexual/meetup context.
- Age numbers under 18 when paired with sexual/meetup context.

Current public/profile blocked bestiality codes:

- `knot`
- `knotting`
- `k9`
- `k 9`
- `taboo`
- `zoophilia`
- `zoophile`
- `bestiality`
- `beastiality`
- `canine`
- `🪢`
- `🐕`

Explicitly do not ban these consensual kink terms by themselves:

- `pup`
- `puppy`
- `handler`
- `rope`
- `rope classes`

Only add new coded-language bans after the founder provides exact terms, emoji patterns, phrases, and intended surfaces.

## Stream Architecture

Current Stream usage:

- Stream SDK is installed server-side via `@stream-io/node-sdk`.
- `StreamModerationProvider` uses Stream moderation checks when `STREAM_MODERATION_ENABLED=true`.
- Stream config is backend-only.
- Stream labels are normalized into cruush policy labels.
- Stream raw results are sanitized before being stored in moderation audit fields.

Stream should do:

- AI text moderation.
- Image moderation.
- Provide moderation signals for profile/feed/message/photo writes.
- Potentially support future chat/notification substrate work if useful.

Stream should not be:

- The only storage for sensitive user messages/photos.
- The only plaintext source of truth.
- Exposed to the browser with secret keys.
- Trusted to make final product policy decisions without cruush policy mapping.

Staging setup:

- Enable Stream moderation in dashboard.
- Create moderation policy whose key matches `STREAM_MODERATION_CONFIG_KEY`.
- Configure severe categories for remove/block:
  - threats
  - hate
  - non-consensual sexual content
  - minor/CSAM references
  - doxxing
  - scams
  - impersonation
  - drug sales
  - bestiality
  - severe harassment
- Do not add blocklists that treat queer identity, trans identity, consensual kink, or normal adult dating language as violations by themselves.

## PhotoDNA Architecture

Current PhotoDNA status:

- `server/src/photodna.ts` implements a configurable adapter.
- It posts raw image bytes to the configured Microsoft API Management endpoint.
- It sends `content-type: application/octet-stream`.
- It sends `ocp-apim-subscription-key`.
- It blocks responses that indicate match/block.
- It stores a provider request id when the response includes one.

Required before enabling in staging:

- `PHOTODNA_API_URL`
- `PHOTODNA_OPERATION_PATH`
- `PHOTODNA_SUBSCRIPTION_KEY`
- Sample request from Microsoft portal.
- Sample allowed response.
- Sample matched/blocked response.
- Confirm response fields used by `responseIndicatesMatch`.

PhotoDNA behavior:

- If disabled, status is `not_configured`.
- If enabled and API says match/block, reject before storage.
- If enabled and request fails, the upload should fail rather than publish unsafe media.

## Auth, Email, And Signup

Current auth:

- App-owned email/password auth.
- HttpOnly session cookie.
- Session token is random; database stores a hash, not the raw token.
- Email verification exists.
- Password reset routes exist.
- Turnstile can be configured for signup.
- Resend sends production email when configured.
- Email preview is dev-only and forbidden in production.

Important files:

- `server/src/routes/auth.ts`
- `server/src/auth.ts`
- `server/src/auth-schema.ts`
- `server/src/mailer.ts`
- `server/src/turnstile.ts`
- `src/app/components/Auth.tsx`
- `src/app/components/EmailVerificationGate.tsx`
- `src/app/components/VerifyEmail.tsx`
- `src/app/components/ResetPassword.tsx`

Bank reviewer path:

- Founder can provide a verified login.
- Bank reviewers may also create a real account if staging signup, email, and captcha are configured.
- Staging signup must be reliable before bank review.

## Profiles And Discovery

Profile product model:

- Dense queer profile architecture.
- Public profile sections: Basics, Intimacy, Health.
- Edit sections: Photos, Profile, Basics, Intimacy, Health & Safety.
- Public/queryable fields remain relational for filtering and discovery.
- Sensitive/free-text/private fields use encrypted payloads and blind tokens where needed.

Important frontend files:

- `src/app/components/ProfileView.tsx`
- `src/app/components/ProfileEdit.tsx`
- `src/app/components/ProfileOnboarding.tsx`
- `src/app/lib/profileApi.ts`
- `src/app/lib/profileOptions.ts`
- `src/app/components/MultiSelect.tsx`

Important backend files:

- `server/src/routes/profiles.ts`
- `server/src/profile-schema.ts`
- `server/src/profile-sensitive.ts`
- `server/src/profile-visibility.ts`
- `server/src/routes/users.ts`
- `server/src/discovery-users.ts`

Profile write path:

- Frontend sends strict `ProfilePayload`.
- Backend validates with `profilePayloadSchema`.
- Backend moderates profile text before save.
- Backend splits sensitive profile data.
- Backend encrypts sensitive payload.
- Backend encrypts visibility rules.
- Backend creates blind tokens for protected searchable/matchable values.
- Backend writes profile row and syncs token rows.

Discovery path:

- Frontend calls `GET /api/users`.
- Backend applies filters and location/privacy rules.
- Protected sensitive filter values use blind token matching.
- Backend performs viewer-specific visibility checks before returning profile data.

Do not:

- Store new sensitive free-text fields as plaintext without classification.
- Add one-off taxonomy controls outside the existing profile options/MultiSelect pattern.
- Break discovery by encrypting fields that must remain queryable without adding a derived index/token strategy.

## Location Privacy And Ghost Mode

Current direction:

- Exact location must be separated from display/fuzzed location.
- Ghost/fuzzed display coordinates are used for map surfaces where appropriate.
- Location privacy logic lives server-side and client-side.
- Display tokens and envelopes are encrypted/signed server-side.

Important files:

- `server/src/location-privacy.ts`
- `server/src/routes/privacy.ts`
- `server/src/routes/profiles.ts`
- `src/app/lib/locationPrivacy.ts`
- `src/app/lib/privacyApi.ts`
- `src/app/components/MapVisibilitySurface.tsx`
- `src/app/components/PrivacyAudit.tsx`

Product constraints:

- Location fuzziness belongs in settings/privacy controls.
- High fuzziness should be visible through UI indicators.
- Do not expose exact location to other users except through explicit mutual/location policy decisions.
- Do not log exact coordinates unnecessarily.

## Feed Architecture

Current feed:

- Unified local feed.
- Text only.
- Expiring posts.
- Encrypted post content in Postgres.
- Public/profile coded-language rules apply.
- Adult explicit/chemsex language is rejected on feed.
- DMs/groups are more permissive than feed.

Important files:

- `server/src/routes/posts.ts`
- `server/src/post-schema.ts`
- `src/app/components/LocalFeed.tsx`
- `src/app/lib/postApi.ts`

Current endpoint behavior:

- `GET /api/posts`: returns non-expired posts, newest first, limit 100.
- `POST /api/posts`: authenticates, validates, moderates, encrypts, inserts, applies expiry.
- Expiry options: `1h`, `6h`, `24h`.
- Expired posts are filtered out at query time.

Feed gaps:

- Cleanup job for expired rows.
- Better distance/proximity ranking.
- Feed empty states and moderation error polishing.
- Bank smoke script coverage.
- If feed media is added later, use the encrypted media object flow and moderate before visibility.

## Messaging And Groups

Current backend capabilities:

- DMs require mutual cruush permission.
- Group conversations exist.
- Group creator starts as owner.
- Admin roles: owner, admin, member.
- Owner/admin can update title and disappearing timer.
- Owner/admin can add members.
- Owner/admin can promote members.
- Owner/admin can demote admins.
- Owner/admin can remove non-owner members.
- Owner/admin can close group.
- Messages support conversation-level disappearing timers for new messages.
- Expired messages are not returned.
- Message bodies are encrypted.
- Message photo attachments are encrypted and member-gated.

Important backend files:

- `server/src/routes/messages.ts`
- `server/src/message-schema.ts`
- `server/sql/024_open_beta_storage_messaging.sql`
- `server/sql/025_message_media_attachments.sql`

Important frontend files:

- `src/app/components/DirectMessages.tsx`
- `src/app/components/PrivateGroupChat.tsx`
- `src/app/lib/messagesApi.ts`

Current frontend capabilities:

- Conversation list shows DMs and groups.
- Conversation list shows group metadata such as role/timer when returned.
- Chat screen loads live API data only, no fake preview fallback.
- Chat screen sends text messages.
- Chat screen uploads selected photo messages with optional caption.
- Chat screen renders message photo attachments.
- Chat screen shows expiry labels.
- Report conversation action routes to `/report`.

Frontend gaps:

- Full group creation UI may still need polish or entry points depending on current product surface.
- Group admin/member management UI is incomplete relative to backend.
- Missing frontend helpers for remove member, demote admin, and close group should be added to `messagesApi.ts`.
- Rename/timer controls need complete UI.
- Member picker/invite UX needs completion.
- Message photo upload needs pending/rejected/approved states.
- Voice and video messages are deferred until after open beta unless explicitly reprioritized.

Signal-style group decision:

- Group creator is owner/admin.
- Owner/admin can assign admins.
- Owner/admin can manage members and group settings.
- Conversation-level disappearing timer applies to new messages only.
- Default timer is off.
- Supported timers: off, 24h, 7d, 30d.
- Closing a group prevents further admin-managed activity where backend checks `closed_at`.

## Reports And Fetishization Handling

Current report model:

- Reports are persisted in `reports`.
- Report creation is authenticated and rate-limited.
- Reporter comes from session, not request body.
- Profile reports verify target profile exists.
- Conversation reports verify reporter belongs to conversation.
- Each report creates moderation/trust evidence when target is known.
- Fetishization/chaser is a report reason and trust evidence path.

Important files:

- `server/src/routes/reports.ts`
- `server/src/report-schema.ts`
- `src/app/components/ReportPage.tsx`
- `src/app/lib/reportApi.ts`

Decision:

- Do not build a chaser/fetishization text classifier for launch.
- Do not blocklist broad identity/attraction language to guess fetishization.
- Use user reports and trust evidence.

Future report work:

- User-facing report status/history if useful.
- Internal audit route for report/trust signals.
- Abuse-pattern dashboards can be built later, but not as a human moderation queue unless product direction changes.

## Cruush Interaction And Relationships

Product language:

- User-facing copy says `cruush`, not like/tap/match/crush.
- Mutual copy should preserve the pun.

Current backend:

- Cruush routes own interaction state.
- Mutual cruush unlocks DM permission.
- Relationship/match records are encrypted/indexed where implemented.

Important files:

- `server/src/routes/cruush.ts`
- `server/src/match-relationships.ts`
- `server/src/encrypted-relationships.ts`
- `src/app/lib/cruushApi.ts`
- `src/app/lib/openConversation.ts`
- `src/app/components/CruushActivity.tsx`

Do not:

- Reintroduce generic dating app language.
- Let DMs open without mutual permission unless product policy explicitly changes.

## Infrastructure Target

Open beta target:

- Coolify.
- Separate staging and production projects.
- Separate staging and production Postgres databases.
- Separate staging and production R2/S3 buckets.
- Separate staging and production env secrets.
- Production VPS in US-East, preferably Ashburn/VA for NYC beta latency.
- Production minimum target: `8 vCPU / 16 GB RAM / 160 GB SSD`.
- `4 vCPU / 8 GB` is staging or very early testing only.

Production services:

- Frontend static build.
- API service from `server/`.
- Postgres 16.
- R2/S3 private bucket for encrypted media.
- Resend for email.
- Turnstile if signup captcha is enabled.
- Stream moderation.
- PhotoDNA endpoint.

Backups:

- Daily Postgres backups to private S3/R2-compatible storage.
- 14-30 days retention minimum for open beta.
- One restore test before bank review and before public open beta.
- VPS snapshots are secondary recovery only.
- Disk usage alerts before beta.
- Treat database disk above 75% as urgent.

No RabbitMQ/queue yet:

- Do not add RabbitMQ just because media exists.
- Add a queue only if Stream/PhotoDNA/media processing latency makes synchronous upload moderation too slow or unreliable.
- If a queue is added later, design fail-closed pending states before making media visible.

## Bank And Open Beta Readiness Standard

The staging build should be good enough for a bank/payment processor to test.

Bank smoke test:

- Signup works or provided verified login works.
- Email verification works if signup is allowed.
- Login/logout works.
- Profile edit saves normal profile text.
- Profile edit rejects banned public/profile coded language.
- Safe profile photo upload is accepted.
- Rejected profile photo does not become visible.
- Profile photo is served through authenticated API media route.
- Feed post works for allowed text.
- Feed rejects banned public/profile language.
- DM text works after mutual permission.
- DM allows drug discussion without sales.
- DM rejects drug sales and zero-tolerance categories.
- Group creation works.
- Group creator is owner/admin.
- Admin can add/promote/manage members where UI exists.
- Disappearing timer labels appear.
- Message text is encrypted in storage.
- Message photo uploads, renders, and is unavailable to non-members.
- Report can be submitted, including fetishization/chaser reason.
- Expired messages are not returned.
- Stream moderation is enabled and fail-closed.
- PhotoDNA is enabled and verified with Microsoft samples.
- R2/S3 media storage is enabled in staging/prod, not local filesystem.
- Backup creation works.
- Restore drill is documented.

## Testing And Verification Commands

Use Node 22 or the bundled Node runtime.

Common checks:

```bash
npm --prefix server test
npm --prefix server run build
npm test
npm run build
```

Local smoke:

```bash
docker compose -f docker-compose.selfhost.yml up -d postgres
npm run dev:local:seeded
```

Focused backend examples:

```bash
npm --prefix server test -- src/app.test.ts
npm --prefix server test -- src/policy-mapper.test.ts
npm --prefix server test -- src/media-storage.test.ts
npm --prefix server test -- src/photodna.test.ts
```

Focused frontend examples:

```bash
npm test -- src/app/components/ProfileEdit.test.tsx
npm test -- src/app/components/DirectMessages.test.tsx
npm test -- src/app/components/PrivateGroupChat.test.tsx
npm test -- src/app/components/ReportPage.test.tsx
```

Before pushing main:

- `git status --short --branch`
- `git diff --check`
- Search for conflict markers.
- Run server tests/build.
- Run focused frontend tests for changed screens.
- Run frontend build for app-wide TS/Vite validation.

Known build warning:

- Frontend production build currently emits a large chunk warning. Treat it as known unless the changed work makes bundle size much worse.

## Development Rules For Co-Developer

General:

- Keep changes tightly scoped.
- Prefer existing patterns over new frameworks.
- Add Zod schemas at API boundaries.
- Add backend tests for route behavior and policy decisions.
- Add frontend tests for visible user workflows and error states.
- Keep route responses stable unless updating all frontend callers.
- Do not store plaintext sensitive content if an encryption pattern already exists.
- Do not add secrets to `.env.example` with real values.
- Do not use frontend-only security for anything important.
- Do not silently bypass moderation in staging/prod.

Backend:

- Authenticate with `getAuthenticatedUserId`.
- Use `ApiError` for expected API failures.
- Use `app.rateLimiter.assert` for high-write routes.
- Use existing encryption helpers by data class.
- Keep SQL parameterized.
- Add migration file and register it in `server/src/migrate.ts`.
- For content writes, moderation should happen before storage/visibility.
- For encrypted text writes, store placeholder plaintext like `[encrypted]` only where current pattern expects it and store ciphertext columns as source of truth.

Frontend:

- Use `requestApi`.
- Use `resolveMediaUrl` for media.
- Keep app-owned media paths relative.
- Use existing shared controls/components.
- Keep mobile browser safe areas and bottom nav in mind.
- Do not add visible explanatory/tutorial text unless product flow requires it.
- Match `docs/design-master.md` brand/copy rules.

Docs:

- When architecture or product direction changes, update this file.
- When product/visual direction changes, update `docs/design-master.md`.
- When staging/infra changes, update `docs/open-beta-infrastructure-readiness.md`.
- When moderation rules change, update `docs/moderation.md`.

## Next Work Order

This is the default priority order. A co-developer should keep moving down this list unless blocked by missing provider credentials or a newer founder decision.

### 1. Staging And Provider Wiring

Goal: get a real staging environment ready for bank review.

Tasks:

- Confirm Coolify staging and production are separate projects.
- Confirm staging deploy branch and production deploy branch.
- Configure staging API env vars.
- Configure staging frontend env vars.
- Configure staging R2/S3 bucket and access key.
- Set `MEDIA_OBJECT_STORAGE_DRIVER=s3` in staging.
- Set `MEDIA_PUBLIC_BASE_URL` to staging API origin.
- Configure Stream credentials and moderation config.
- Configure PhotoDNA only after Microsoft response shape is verified.
- Configure Resend and verified `MAIL_FROM`.
- Configure Turnstile if signup captcha is enabled.
- Run migrations.
- Run bank smoke test.

Do not wait for founder unless credentials or dashboard access is missing.

### 2. R2/S3 Media Verification And Cleanup

Goal: prove encrypted media works outside local filesystem.

Tasks:

- Add or expand tests for S3/R2 write/read/delete with mocked fetch.
- Verify real staging profile photo upload writes ciphertext to R2.
- Verify message photo upload writes ciphertext to R2.
- Verify profile photo route decrypts and serves only authenticated users.
- Verify message photo route rejects non-members.
- Add object cleanup when DB save fails after object write.
- Add delete path for profile/message media where product flow needs it.

### 3. PhotoDNA Production Verification

Goal: make PhotoDNA real and fail-closed.

Tasks:

- Get Microsoft API Management endpoint and operation path.
- Capture sample allowed and blocked responses.
- Confirm header requirements.
- Confirm request body format.
- Update `server/src/photodna.ts` if response format differs.
- Add tests for exact allowed/blocked/error responses.
- Enable in staging.
- Confirm blocked upload never writes `media_objects` or message/profile rows.

### 4. Group Messaging UI Completion

Goal: make backend group power usable in the app.

Tasks:

- Add frontend API helpers for remove member, demote admin, close group.
- Build group settings/admin surface from chat or detail page.
- Owner/admin can rename group.
- Owner/admin can set disappearing timer.
- Owner/admin can add members.
- Owner/admin can promote/demote admins.
- Owner/admin can remove members except owner.
- Owner/admin can close group.
- Members can see group metadata without admin controls.
- Add tests for admin/member UI permissions.

### 5. Media UX Completion

Goal: make photo flows bank-testable and user-understandable.

Tasks:

- Add upload pending states.
- Add rejection errors for moderation/PhotoDNA failures.
- Add approved state where useful.
- Add profile photo moderation status display if backend exposes it.
- Add message photo upload failure states.
- Add safe retry behavior.
- Add NSFW/explicit photo marking and blur variants when product scope reaches that point.

### 6. Feed Expiry And Cleanup

Goal: keep expiring content operationally clean.

Tasks:

- Add scheduled cleanup for expired feed posts.
- Add scheduled cleanup or query/path handling for expired message media.
- Decide retention policy for expired encrypted messages and media metadata.
- Add tests proving expired rows are not returned.

### 7. Trust Engine Maintenance

Goal: make automod durable over time.

Tasks:

- Add trust decay scheduling if penalties should decay.
- Add cleanup for expired evidence events.
- Add checks for overlapping feature restrictions.
- Add internal audit views or endpoints guarded by `INTERNAL_API_SECRET`.
- Keep "no human queue" unless product direction changes.

### 8. Bank Smoke Script

Goal: one repeatable checklist/script for every staging deploy.

Tasks:

- Create a documented bank test account flow.
- Add a manual smoke checklist under `docs/`.
- Consider Playwright or API smoke script if time allows.
- Include profile, feed, DMs, groups, photos, reports, moderation rejection, backups.

### 9. Production Ops Hardening

Goal: avoid open beta data loss and deployment confusion.

Tasks:

- Confirm daily offsite backups.
- Run restore drill.
- Document restore drill result.
- Add disk alerts.
- Confirm deploy rollback path.
- Confirm logs do not contain secrets or plaintext sensitive content.
- Confirm staging/prod secrets are separate.

### 10. Later, Not Before Open Beta Unless Required

Defer unless a blocker forces it:

- Voice messages.
- Video messages.
- Full Stream chat substrate migration.
- RabbitMQ/worker queues.
- E2EE.
- Native apps.
- Human moderation dashboard.
- Advanced admin dashboards.
- Public events/places beyond placeholder/detail surfaces.

## Founder Questions That Are Still Valid

Only ask the founder these when needed. Do not ask for already-decided direction.

Provider/access questions:

- What are the exact Stream staging/prod credentials and moderation config key?
- What are the PhotoDNA endpoint, operation path, required headers, allowed response, and blocked response?
- What are the final staging/prod domains?
- Is Turnstile required for bank signup, and what is the frontend site key?
- What Resend sender/domain should staging use?

Infrastructure questions:

- Are we using Cloudflare R2 or AWS S3 if R2 setup is not available?
- Which Coolify server is staging and which is production?
- Where should production secrets live today?
- Has a restore drill been completed, and where is the evidence recorded?

Product/legal questions:

- Any new Sniffies-style coded terms or emoji patterns to ban from feed/profile?
- Any payment processor-specific content policy requirements not already reflected here?
- What exact bank test account should be provided?
- Should bank reviewers be allowed to create accounts, or only use provided credentials?
- What retention policy should apply to expired messages/media after open beta?

Do not ask the founder whether to:

- Use cruush-controlled server-side encryption.
- Avoid E2EE claims.
- Keep Stream as moderation input rather than sole storage source of truth.
- Use report-driven chaser/fetishization handling.
- Keep public/profile stricter than DMs/groups.
- Use private R2/S3 object storage.
- Keep local filesystem media out of production.
- Build for web first.
- Use Coolify for this slice.

Those are already decided.

## Known Current Gaps And Risks

Implementation gaps:

- Group admin UI does not fully expose every backend permission.
- Message photo deletion/orphan cleanup needs hardening.
- Profile media lacks resizing, thumbnailing, explicit/blur variants, and richer moderation states.
- Feed expiry is query-filtered but needs cleanup/retention policy.
- Trust decay and evidence cleanup jobs are not implemented.
- PhotoDNA needs exact Microsoft response verification before staging enablement.
- Stream moderation must be configured in the dashboard and staging env.
- Full bank smoke script is not yet automated.

Operational gaps:

- Need confirmed R2 buckets and least-privilege keys.
- Need confirmed Coolify staging/prod separation.
- Need confirmed backups and restore drill.
- Need disk alerts.
- Need production secrets generated fresh and stored only in deployment secret storage.

Technical debt:

- Some older docs contain stale media/runtime language.
- `docs/architecture-whiteboard.md` should be refreshed after this doc if the team still uses the whiteboard.
- Frontend route file has some duplicated report route/import patterns that can be cleaned in a focused pass.
- Bundle size warning remains.

## Default Working Agreement For Co-Developer

When in doubt:

- Keep `main` deployable.
- Make small branches.
- Add tests with the change.
- Update docs with the change.
- Use existing helpers and schemas.
- Run focused tests first, then build.
- Push feature branches for review unless explicitly told to push `main`.
- Never commit secrets.
- Never bypass moderation/encryption to make a demo pass.
- Treat staging as the bank/open-beta rehearsal, not a toy environment.

The co-developer should be able to continue without founder input by working through "Next Work Order" in order and using "Founder Questions That Are Still Valid" only when provider credentials, dashboards, legal policy, or new banned-language examples are genuinely needed.
