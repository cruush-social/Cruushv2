# Launch Readiness Codeveloper Handoff

Last updated: 2026-07-08

This handoff is for staging launch readiness and codeveloper onboarding. Do not touch production resources while working from this checklist.

## Staging Surfaces

- Frontend: `https://staging.cruush.app`
- API: `https://api-staging.cruush.app`
- Coolify resource identification must be by domain, not memory or resource name alone.
- API staging resource must serve `https://api-staging.cruush.app`.
- Frontend staging resource must serve `https://staging.cruush.app`.
- Stop before changing anything if the resource domain is production or does not match staging.

## Codeveloper Login

- Codeveloper staging login email: `codeveloper-nyc@cruush.local`
- Password is controlled by `REVIEWER_TEST_ACCOUNT_PASSWORD` and must be shared out of band.
- Never paste reviewer passwords, payment passwords, Stream secrets, database URLs, R2/S3 secrets, Resend keys, session secrets, or encryption keys into docs or chat.
- Refresh reviewer accounts from the API container only after staging env confirms:
  - `REVIEWER_TEST_ACCOUNTS_ENABLED=true`
  - `REVIEWER_TEST_ACCOUNT_PASSWORD` is present
  - `PAYMENT_REVIEWER_TEST_ACCOUNT_PASSWORD` is present
  - `APP_URL=https://staging.cruush.app`

Run:

```bash
npm run seed:reviewer-accounts
```

Expected success includes:

```text
Seeded 3 reviewer accounts and 2 conversation fixtures
```

See `docs/nyc-reviewer-test-logins.md` for account purpose and bank/payment fixture details.

## Launch Readiness Checklist

- Confirm staging API and frontend deploy from `origin/main` at the intended launch-readiness commit.
- Confirm API env presence only, not values:
  - `DATABASE_URL`
  - `CORS_ORIGIN=https://staging.cruush.app`
  - `APP_URL=https://staging.cruush.app`
  - R2/S3 media env vars
  - Stream moderation env vars
  - Resend mail vars
  - CSAM reporting vars
  - reviewer seed vars
- Confirm frontend env is public-only `VITE_*`, especially `VITE_API_BASE_URL=https://api-staging.cruush.app`.
- Redeploy API and verify migrations finish cleanly before seeding.
- Health checks:
  - `https://api-staging.cruush.app/health` returns 200
  - `https://api-staging.cruush.app/api/meta` returns 200
  - `https://staging.cruush.app/` loads
- Reviewer smoke:
  - Login as `payment@cruush.local` with the payment reviewer password.
  - Confirm DM with `bank-reviewer-nyc@cruush.local`.
  - Confirm group `Bank/payment reviewer smoke group` exists with `24h` disappearing timer.
  - Send a DM text.
  - Open the group screen.
- Product smoke:
  - Profile edit/save works.
  - Settings support route opens.
  - Change password and delete account UI is visible.
  - Do not delete seeded reviewer accounts during smoke.
  - Safe feed/profile text saves.
  - Moderation rejection tests use a disposable staging account, not reviewer accounts.
- Media smoke:
  - Profile photo upload remains the critical staging proof.
  - Message photo upload should write encrypted media and stay member-gated.
  - If Codex browser upload is blocked, run the upload manually in Chrome and record the blocker.
- Ops readiness:
  - Confirm backups and restore-drill evidence before launch.
  - Confirm support inbox delivery to the staging/launch support address.
  - Confirm trust/safety alert delivery.
  - Confirm production frontend env does not contain backend secrets.

## Message Keyword Prefilter

Launch implementation should reduce Stream API calls for DMs and group messages without moving the decision to the frontend.

- The filter is backend-only.
- It applies to direct message text, group message text, and message-photo captions.
- Image moderation for message photos still runs normally.
- Non-triggering text skips Stream and records the existing allowed moderation audit as provider `keyword_prefilter`.
- Triggering text calls the configured moderation provider and keeps existing reject/fail-closed behavior.

The v1 trigger categories are severe-safety only:

- minors, CSAM, underage sexual language
- credible threats, severe harassment, stalking, self-harm abuse
- doxxing, address, phone, workplace, or map-pin exposure
- drug sales or delivery
- commercial sex solicitation
- bestiality or zoophilia
- revenge porn or non-consensual intimate image sharing
- hate/extremist threats
- scams, spam, blackmail, extortion, or platform abuse

Ordinary consensual adult flirting and kink language should not call Stream just because it is sexual.

## Known Blockers And Follow-Ups

- Keep PhotoDNA disabled until endpoint/path/request/response behavior is verified.
- Profile photo moderation is fail-closed and still needs staging proof with real provider-accessible upload behavior.
- Moderator/admin tooling, block enforcement, explicit-content viewer preference, adult confirmation, invite-only mode, and restore drill evidence remain launch readiness work. See `docs/beta-readiness-inventory.md`.
- Keep `docs/moderation.md` updated when keyword or moderation policy changes.

## References

- `docs/nyc-reviewer-test-logins.md`
- `docs/beta-readiness-inventory.md`
- `docs/coolify-env-open-beta.md`
- `docs/bank-test-staging-readiness-2026-07-07.md`
