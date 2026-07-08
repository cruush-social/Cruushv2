# Cruush Beta Readiness Inventory

Last updated: 2026-07-08

This inventory reflects the current Fastify/Vite/Postgres runtime. The older whiteboard note that targets NudeNet for photo moderation is stale for the current beta path. The active target is Stream moderation plus PhotoDNA plus Cruush-owned encrypted S3/R2 media storage.

## Implemented

- Fastify API with normalized errors, security headers, CORS allowlist, multipart upload limits, and Postgres-backed rate limiting.
- Vite React app with cookie-authenticated API wrappers and signed-in route gates.
- Postgres migrations through `029_support_requests.sql`.
- Session cookies are HttpOnly, SameSite=Lax, and Secure in production.
- Email verification, password reset, password-reset session invalidation, and code-of-conduct acceptance.
- Profile encryption/tokenization for sensitive profile data and visibility rules.
- Encrypted relationship, match, location, feed, message, profile-photo, and message-photo storage helpers.
- Profile and discovery privacy logic using visibility rules, blind tokens, ghost/location display tokens, and relationship permissions.
- Stream/mock moderation provider, PhotoDNA adapter, policy mapper, trust engine, reports, evidence events, suspensions, and feature restrictions.
- Profile photo upload endpoint with MIME/signature checks, PhotoDNA check, image moderation, encryption, and authenticated media serving.
- Message photo upload and member-gated authenticated media serving.
- Feed post create/delete with text moderation and encrypted storage.
- DM/group messaging with encrypted text, disappearing timers, group admin backend routes, and member-gated attachments.
- User report creation for profile, conversation, and message targets.
- Support request API and UI.
- Production config already requires S3-compatible media storage and many encryption keys.

## Partial

- Admin/moderator tooling exists only as internal trust inspection guarded by `INTERNAL_API_SECRET`; there is no cookie-authenticated moderator queue or action console.
- Account enforcement exists through trust profiles, suspensions, and feature restrictions, but there is no first-class `app_users.account_status` state for active, under review, suspended, or deleted.
- Reports create trust evidence, but beta requires moderator review/actions and reportable post/profile-photo targets.
- Media is encrypted and authenticated, but profile media lacks display/thumbnail/blur variants and stronger orphan cleanup after late DB failures.
- Profile photo moderation is fail-closed when provider errors, but real provider image preflight depends on provider-accessible image URLs and needs staging proof.
- Explicit/adult media labels exist in moderation policy, but there is no viewer explicit-content preference, no backend blur gating, and no explicit media UI state.
- 18+ enforcement exists during onboarding through `year_of_birth`, but signup does not yet require explicit adult confirmation.
- Settings exposes email verification, support, profile edit, and sign out, but not change password or account deactivation.
- CSRF protection relies on CORS plus Origin checks for unsafe methods; production missing-Origin/Referer behavior needs explicit tests and stricter policy.
- Infrastructure docs describe Coolify/R2/backups, but restore drill evidence, incident runbooks, and kill-switch behavior are not yet complete.

## Missing Beta Blockers

- User block/unblock/list API and enforcement across discovery, profiles, DMs, cruush actions, and feed visibility.
- Moderator/admin API to list reports/reviews, resolve/dismiss reports, suspend/unsuspend users, restrict features, remove content/media, and write action audit rows.
- Minimal moderator console UI.
- Additive DB foundations for account status, moderator roles, user blocks, expanded report targets, and moderation action audit.
- Production mail secret guardrails for `RESEND_API_KEY` and `MAIL_FROM`.
- Explicit adult confirmation at signup.
- Viewer explicit-content opt-in with backend-enforced safe media selection.
- Authenticated change-password flow.
- Account deactivation/soft-delete flow that hides active presence and revokes sessions.
- Invite-only signup mode.
- Manual beta smoke checklist and current test/build baseline record.

## Security And Privacy Risks To Close Before Invite Beta

- Photos must not appear in `profiles.photos` unless backend moderation and safe display variant creation succeed.
- Explicit photos must not be returned to opted-out viewers; if a blurred variant is unavailable, the photo should be hidden or rejected.
- Moderator APIs must use session-backed moderator roles, not shared frontend secrets.
- Blocks must not reveal to the blocked user that they were blocked.
- Sensitive profile fields, token hashes, exact coordinates, HIV/prevention fields, hidden kinks, crowds, and trans status must not leak in discovery/profile JSON.
- Production unsafe cookie-authenticated writes should reject disallowed origins and missing Origin/Referer.
- Frontend env vars must remain public-only; no Stream, PhotoDNA, database, session, encryption, R2, Resend, or Turnstile backend secrets.

## Recommended Next Implementation Order

1. Add additive schema foundations and migration registration.
2. Enforce account status in auth/session resolution.
3. Harden production config and CSRF tests.
4. Implement blocking API and report target expansion.
5. Implement moderator API and console.
6. Harden media variants, cleanup, and explicit-content gating.
7. Add adult confirmation, lifecycle controls, invite-only signup, and ops runbooks.
8. Add backend/frontend beta smoke coverage and run the full readiness checklist.
