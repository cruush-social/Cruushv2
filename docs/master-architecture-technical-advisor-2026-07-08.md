# cruush Technical Advisor Master Architecture Review

Last updated: 2026-07-08

Review target: the `main` commit that contains this file.

This document is the advisor-facing architecture snapshot for launch readiness review. It intentionally summarizes the system at the current code level rather than preserving older implementation history. If this file conflicts with older docs, inspect the code and migrations first.

## Executive Summary

cruush is a web-first, self-hosted queer cruising app built around nearby discovery, profiles, DMs/groups, local feed, privacy controls, and automated trust/safety enforcement.

The launch architecture is:

- Frontend: React, Vite, TypeScript, cookie-authenticated API calls.
- Backend: Fastify, TypeScript, Zod validation, Postgres, HttpOnly session cookies, CORS/Origin checks, Postgres-backed rate limiting.
- Storage: Postgres for relational state and encrypted metadata; S3-compatible/R2 object storage for encrypted media.
- Moderation: server-side automod using local policy mapping, Stream moderation when enabled, PhotoDNA adapter when verified, trust-score enforcement, content reviews, reports, suspensions, and feature restrictions.
- Privacy: application-layer encryption and blind tokens for sensitive profile, relationship, location, feed, message, media, and visibility data. This is not end-to-end encryption because the backend holds keys and can decrypt for authorized product/safety workflows.
- Deployment: Coolify-managed API/frontend/Postgres resources. Staging domains are `https://staging.cruush.app` and `https://api-staging.cruush.app`.

Primary launch concerns for advisor review are privacy threat model, moderation coverage, PhotoDNA readiness, production restore drills, account lifecycle safety, and the remaining lack of user-facing moderator tools.

## Current Runtime Shape

Frontend routes live under `src/app/App.tsx` and use shared API wrappers in `src/app/lib`. Browser code receives only public `VITE_*` values. Backend secrets must never be placed on the frontend Coolify resource.

Backend routes are registered in `server/src/app.ts`:

- Auth and session: signup, login, logout, email verification, password reset, code-of-conduct acceptance, account deactivation/delete foundations.
- Profiles and discovery: profile CRUD, visibility rules, profile photo upload, map/discovery filters, ghost/location privacy.
- Messaging: DM/group conversations, disappearing timers, encrypted text, message photo upload, member-gated media.
- Feed: local post create/read/delete with encrypted text and moderation gates.
- Reports/support/internal: user reports, support requests, internal CSAM incident review endpoints, internal trust inspection.
- Billing: cruush+ status, plan metadata, reviewer/payment test paths.

Database migrations are registered in `server/src/migrate.ts` through:

- `030_csam_incident_reporting.sql`
- `031_profile_visibility_sets.sql`
- `032_account_status_and_moderators.sql`
- `033_user_blocks_and_report_targets.sql`
- `034_moderation_actions.sql`

Advisor note: some older docs still say migrations stop at `029_support_requests.sql`; the current migration runner is the source of truth.

## Data, Privacy, And Encryption

The current privacy posture is server-side/application-layer encryption, not E2EE.

Encrypted or tokenized areas include:

- Sensitive profile fields and profile visibility rules.
- Profile-sensitive blind tokens for protected matching/filtering.
- Relationship records and match tokens.
- Feed and message text.
- Profile photo and message photo object bytes.
- Location envelopes, visibility policy tokens, display tokens, and ghost rotation tokens.

Operational implications:

- The backend can decrypt when authorized for product rendering, moderation, reports, exports, deletion, compliance, and safety workflows.
- Logs and docs must not contain plaintext sensitive fields, secrets, raw evidence bytes, or reviewer passwords.
- Exact coordinates, hidden kinks/crowds, HIV/prevention fields, raw trans status, token hashes, and encrypted key material should not leak into discovery/profile JSON.
- Production must use S3-compatible object storage with encryption keys set; local filesystem media is for dev/test only.

Advisor review questions:

- Is the non-E2EE privacy promise stated clearly enough for beta users and reviewers?
- Are encryption key purposes and rotation boundaries sufficient for launch?
- Are internal decrypt/access paths logged tightly enough for future moderator tooling?

## Moderation And Trust Safety

Launch moderation is server-side automod. There is no human moderation queue for launch.

The moderation stack:

- `server/src/moderation-provider.ts`: mock provider for local/test, Stream provider when `STREAM_MODERATION_ENABLED=true`.
- `server/src/moderation-service.ts`: moderation gate helpers, content review writes, reject/fail-closed handling.
- `server/src/policy-mapper.ts`: provider labels to cruush policy decisions.
- `server/src/trust-engine.ts`: trust score, evidence, suspensions, feature restrictions.
- `server/src/csam-reporting.ts`: PhotoDNA match handling, encrypted evidence, CSAM incident records, alerting/report packet flow.
- `server/src/message-keyword-prefilter.ts`: backend-only severe-safety prefilter for DMs/groups to reduce Stream calls.

Surface policy:

- Profiles and public feed are strict against coded drug/chemsex, commercial sex, underage sexual content, bestiality, threats, hate, scams, harassment, and doxxing.
- DMs/groups allow ordinary consensual adult flirting and kink language without automatically calling Stream.
- DM/group text calls Stream only when severe-safety keywords match: minors/CSAM, threats, stalking/harassment, doxxing/location exposure, drug sales, commercial sex solicitation, bestiality, nonconsensual intimate image sharing, hate/extremism, scams/spam/platform abuse.
- Non-triggering message text writes an allowed `content_reviews` audit row with provider `keyword_prefilter`.
- Message photo image moderation still runs; caption prefilter does not bypass image moderation.
- PhotoDNA is wired but must stay disabled until Microsoft endpoint/path/request/response behavior is verified.

Advisor review questions:

- Is the keyword prefilter an acceptable API-cost optimization for DMs/groups, given the server still enforces severe-safety triggers?
- Should any severe-safety category be added before beta?
- Does the system need sampling of skipped messages to measure false negatives, or is launch v1 acceptable without sampling?
- Is fail-closed behavior appropriate for profile photos and media uploads when providers are unavailable?

## Account State, Reports, Blocks, And Moderator Foundations

Current foundations:

- `account_status` exists on `app_users` with `active`, `under_review`, `suspended`, and `deleted`.
- Auth/session resolution blocks non-authenticating account states.
- `moderator_users` exists for future session-backed admin/moderator authorization.
- `user_blocks` exists as a schema foundation.
- Report targets are expanded for profile, conversation, message, post, profile photo, and message photo direction.
- `moderation_actions` exists for future auditable moderator decisions.
- Current user-facing moderator console is not built.

Launch gap:

- Blocking API and enforcement are still incomplete.
- Moderator list/resolve/suspend/restrict/remove workflows are still incomplete.
- External reports create trust/safety evidence, but there is no full cookie-authenticated moderator workbench.

Advisor review questions:

- Is it acceptable to enter limited beta with automod plus internal incident/review endpoints before building the full moderator console?
- Which account-state transitions must be manually operable before wider launch?
- What minimum block enforcement matrix is required before invite beta?

## Messaging, Feed, And Media

Messaging:

- DM/group text is encrypted before storage.
- Message history omits expired messages.
- Conversation-level disappearing timers apply to newly created messages.
- Message photos are uploaded to the API, MIME/signature checked, PhotoDNA checked when enabled, image-moderated, encrypted, stored as media objects, and served only through member-gated routes.
- Group admin backend routes exist for group update/member/admin/close flows.

Feed:

- Feed posts are encrypted, moderated before save, query-filtered by expiry, and delete-capable.
- Public feed text is stricter than DM/group text.

Media:

- Profile photos and message photos use encrypted object storage.
- Profile photo upload requires backend moderation approval and adult-human proof.
- Current media gaps include thumbnail/display variants, explicit/blur variants, richer moderation states, and stronger orphan cleanup.

Advisor review questions:

- Is synchronous media moderation acceptable for launch, or should any part move to a queue before beta?
- Are disappearing-message retention semantics acceptable if expired data is filtered before deeper deletion/cleanup automation is complete?
- What minimum explicit-content viewer preference is required before wider launch?

## Deployment And Operations

Staging:

- Frontend: `https://staging.cruush.app`
- API: `https://api-staging.cruush.app`
- Confirm Coolify resources by domain, not by memory or resource name.
- Do not touch production during staging launch-readiness work.

Production requirements:

- API secrets and encryption keys must be present only on backend resources.
- Frontend env must contain public `VITE_*` values only.
- `RESEND_API_KEY` and `MAIL_FROM` are required in production.
- S3/R2 media storage is required in production.
- Stream secrets are required only when `STREAM_MODERATION_ENABLED=true`.
- PhotoDNA details and CSAM reporting guardrails are required before enabling PhotoDNA in production.
- Backups and restore-drill evidence are not optional before wider launch.

Reviewer/codeveloper setup:

- `codeveloper-nyc@cruush.local` is the internal codeveloper staging login.
- Password comes from `REVIEWER_TEST_ACCOUNT_PASSWORD` and must be shared out of band.
- Bank/payment reviewer fixture creates deterministic DM/group smoke paths for `bank-reviewer-nyc@cruush.local` and `payment@cruush.local`.

Advisor review questions:

- Are Coolify resource boundaries and secret placement policies sufficient?
- What restore drill evidence should be required before launch date signoff?
- Should launch require separate staging/prod Stream moderation configs and audit labels?

## Current Known Launch Risks

- PhotoDNA adapter still needs exact Microsoft operation path, headers, request body, and allowed/blocked response verification.
- Profile photo upload proof remains the critical staging media test.
- Moderator UI and full report/action workflows are incomplete.
- User block enforcement is not complete across discovery, profiles, DMs, cruush actions, and feed.
- Explicit-content viewer preference and backend safe-media selection are incomplete.
- Adult confirmation at signup is incomplete.
- Change-password/account lifecycle UI has been added or exposed in parts, but full production smoke coverage is still needed.
- Invite-only signup mode is incomplete.
- Backup/restore drill and incident runbooks need evidence.

## Recommended Advisor Review Order

1. Review `server/src/migrate.ts`, migrations `030` through `034`, and auth/account-state enforcement.
2. Review encryption boundaries for profiles, messages, media, relationships, location, and visibility tokens.
3. Review moderation policy mapping, Stream integration, keyword prefilter, PhotoDNA fail-closed behavior, and CSAM incident flow.
4. Review messaging/media upload paths, especially message-photo membership gates and profile-photo adult-human proof.
5. Review production config guardrails and Coolify secret separation.
6. Review launch readiness docs and decide which risks block beta versus post-beta hardening.

## Supporting Docs

- `docs/launch-readiness-codeveloper-handoff-2026-07-08.md`
- `docs/nyc-reviewer-test-logins.md`
- `docs/coolify-env-open-beta.md`
- `docs/moderation.md`
- `docs/bank-test-staging-readiness-2026-07-07.md`
- `docs/beta-readiness-inventory.md`
- `docs/master-architecture.md`
