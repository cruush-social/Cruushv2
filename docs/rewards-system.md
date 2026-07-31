# Cruush rewards system

For the implementation rationale and tradeoffs, see
[`rewards-design-decisions.md`](./rewards-design-decisions.md).

## Overview

Cruush rewards legitimate daily participation and qualified referrals with
promotional Cruush+ access. Promotional access is separate from paid billing,
auditable, capped, reversible, and idempotent. Optional TOTP two-factor
authentication protects accounts, adds trust once, and is required before a
referred account can qualify.

The implementation lives in the existing Fastify/PostgreSQL API and React/Vite
PWA. It does not use frontend activity beacons and does not change payment
provider records, PhotoDNA, Rekognition, age estimation, or moderation policy.

## Product rules

### Daily activity

- The first eligible, successfully completed server-side action in a user's
  calendar day creates one activity credit.
- Default eligible types are `cruush`, `message`, and `post`.
- App opens, logins, reads, and quantity do not count.
- Calendar dates use `app_users.timezone`; invalid or missing values resolve to
  UTC. Each credit stores the timezone and resolved date.
- A gap of one or more calendar days resets the current streak.
- Every seventh consecutive day grants one promotional day.
- After the first seventh-day reward, each eligible day between seventh-day
  rewards grants one additional promotional day.
- Activity grants default to 30 days per rolling 30 days.

### Referrals

- Codes are 128-bit random, non-sequential values and are unique.
- `?ref=<code>` is retained in browser session storage until signup and is sent
  only in the signup body.
- A database constraint permits one referral per referred account, and a trigger
  prevents changing the referrer, referred account, or captured code.
- A referral remains pending until the referred account is at least seven days
  old, has enabled 2FA, has a complete required profile, and is in good standing.
- Suspended/deleted accounts and active suspensions are rejected. Accounts under
  review and suspicious signup patterns are flagged for human review.
- A qualified referral grants seven promotional Cruush+ days to the referrer and
  one trust point, up to 20 referral-derived trust points.
- One unique ledger grant can exist per referral. Reruns do not duplicate it.

The centralized profile-completion check defaults to display name, year of
birth, bio, pronouns, identities, looking-for values, and vibes. The field list
is configurable.

## Architecture

- `reward-config.ts`: validated, cached database settings with safe defaults.
- `rewards-service.ts`: activity credits, streak transitions, grant issuance,
  promo banking/activation, summaries, and reversals.
- `referrals-service.ts`: signup risk preparation, referral summaries,
  qualification, trust awards, and the scheduler.
- `profile-completion.ts`: reusable profile qualification rules.
- `two-factor.ts`: TOTP setup/verification, encrypted secrets, recovery codes,
  replay protection, disable/regeneration, and one-time trust award.
- `routes/rewards.ts`: authenticated member and moderator/admin APIs.
- `Rewards.tsx`: streak, promo, referral, history, and 2FA UI.

Reward issuance and reversal use database transactions. The production
`DbClient` exposes a checked-out PostgreSQL transaction, and domain actions are
never failed merely because the secondary reward-credit attempt failed.

## Database schema

Migration `server/sql/042_rewards_and_two_factor.sql` adds:

- `app_users.timezone`
- `reward_settings`
- `referral_identities`
- `referrals`
- `daily_activity_credits`
- `user_activity_streaks`
- `promotional_cruush_plus_entitlements`
- append-only `reward_grants`
- append-only `reward_grant_reversals`
- `user_two_factor_auth`
- `user_two_factor_recovery_codes`
- nullable unique `trust_events.idempotency_key`

Important database protections include:

- unique `(user_id, activity_date)`
- unique referred user and a no-self-referral check
- immutable referral association trigger
- unique referral codes
- unique reward idempotency keys
- unique user/source/milestone grants
- unique referral reward grants
- append-only grant and reversal triggers
- non-negative promo balances and positive grant/reversal days

`reward_grants.user_id`, `reward_grants.referral_id`, and reversal user IDs are
intentionally retained as opaque UUID audit identifiers rather than cascading
foreign keys. Cruush currently hard-deletes accounts; a cascading FK would
either erase immutable audit history or block account deletion. Operational
tables retain normal user foreign keys and are deleted with the account.

## Reward and entitlement lifecycle

1. A milestone/referral produces a deterministic idempotency key.
2. The service locks the recipient user/promo state, checks rolling/source caps
   and the 90-day maximum, then inserts the immutable grant.
3. If paid/lifetime/legacy Cruush+ is active, seconds are added to the promo bank.
4. Otherwise, promo access starts at `max(now, active_until)` and is extended.
5. Entitlement reads combine paid, lifetime, legacy, and active promo access.
6. After paid access expires, the next entitlement/summary read atomically
   activates banked promo seconds.
7. Starting paid access moves remaining active promo seconds into the bank.

A reversal appends a separate reversal row and removes only currently available
banked/active promotional time. It never updates paid subscriptions, lifetime
access, checkout sessions, or payment-provider data.

## Referral lifecycle

`pending -> qualified -> rewarded`

Alternative terminal/review paths are `rejected`, `flagged`, and `reversed`.
Qualification selects only pending referrals old enough for evaluation, locks
each row, and rechecks all conditions. A grant-cap or bank-cap condition may
leave a referral `qualified` for operational review rather than issuing a
partial reward.

The API entrypoint starts a 15-minute in-process scheduler. Operators can also
run a bounded one-shot pass:

```sh
cd server
npm run rewards:qualify-referrals
```

Multiple API replicas are safe: row locks, referral status checks, unique
constraints, and grant idempotency prevent duplicate rewards.

## Two-factor authentication

Cruush uses internal password authentication, so optional TOTP is implemented
with `otplib` (RFC 6238/4226 compatible).

- Setup requires the current password.
- The secret and QR code are returned only by the setup-start response.
- The secret is encrypted with AES-256-GCM and a versioned derived key.
- Activation requires a valid TOTP.
- Ten one-use recovery codes are generated and returned only at activation or
  regeneration. Only scrypt hashes are stored.
- TOTP verification accepts a 30-second clock tolerance and stores the last used
  time step so a code cannot be replayed.
- Setup/login/recovery/disable attempts use the PostgreSQL rate limiter.
- Recovery regeneration requires the password and a fresh TOTP.
- Disable requires the password plus a fresh TOTP or unused recovery code.
- Enabling 2FA creates one idempotent permanent trust event. Disabling and
  re-enabling cannot award trust twice.

`TWO_FACTOR_ENCRYPTION_KEY` is the recommended dedicated secret. If omitted, the
existing `SESSION_SECRET` is used so a missing optional value does not break the
application. Rotate by adding a new key version and a re-encryption migration;
do not simply replace a key that still encrypts active rows.

## Configuration defaults

Values are JSON in `reward_settings` and cached per API process for 60 seconds.
Missing tables/rows or malformed combined configuration fall back to the
documented defaults.

| Key | Default |
| --- | ---: |
| `recurring_streak_days` | 7 |
| `recurring_streak_reward_days` | 1 |
| `long_streak_days` | 1 |
| `long_streak_bonus_days` | 1 |
| `activity_reward_cap_days` | 30 |
| `activity_reward_cap_period_days` | 30 |
| `referral_min_account_age_days` | 7 |
| `referral_reward_days` | 7 |
| `max_banked_promotional_days` | 90 |
| `referral_reward_cap_days` | `null` |
| `two_factor_trust_points` | 10 |
| `referral_trust_points` | 1 |
| `max_referral_trust_points` | 20 |
| `eligible_activity_types` | `["cruush","message","post"]` |
| `profile_completion_fields` | required onboarding fields listed above |

Example:

```sql
update reward_settings
set value = '10'::jsonb, updated_at = now()
where key = 'activity_reward_cap_days';
```

## Abuse protections

- Server-confirmed domain actions only; no rewardable page-view beacon.
- One activity row per user/date and no quantity multiplier.
- Self-referral check and immutable one-referrer association.
- Account age, 2FA, profile, account status, trust suspension, and suspension
  checks at qualification time.
- Unique grants at both source and idempotency levels.
- Referral-code and 2FA attempt rate limits.
- Existing severe-access infrastructure is reused for HMAC-only IP/device
  signals only when it is enabled and the proxy hop count is trusted. Raw
  identifiers are not stored.
- High referrer bursts and repeated network signals are flagged, not rewarded.
- Fraud details appear only in moderator/admin endpoints.
- Reversals append audit history and cannot reduce paid access.

## APIs

Member endpoints:

- `GET /api/rewards/summary`
- `GET /api/rewards/streak`
- `GET /api/rewards/referrals`
- `GET /api/rewards/history`
- `PUT /api/rewards/timezone`
- `GET /api/auth/2fa`
- `POST /api/auth/2fa/setup`
- `POST /api/auth/2fa/setup/complete`
- `POST /api/auth/2fa/recovery-codes`
- `DELETE /api/auth/2fa`

Signup accepts optional `referralCode`; login accepts optional `twoFactorCode`.

Moderator/admin endpoints:

- `GET /api/admin/rewards/referrals?status=flagged`
- `GET /api/admin/rewards/grants?userId=<uuid>`
- `POST /api/admin/rewards/grants/:grantId/reverse`

Member responses never contain signal hashes, risk scores, review flags, TOTP
secrets after setup, recovery hashes, or internal subscription rows.

## Frontend

`/rewards` is linked from Settings and contains:

- current/today streak state and next milestone progress
- active and banked promotional access
- copy/share referral link and pending/success counts
- recent active/reversed reward history
- clear eligible-activity copy, including that opening the app does not count
- complete TOTP setup, recovery regeneration, and disable flows
- loading, empty, success, and recoverable error states

Onboarding presents “Protect my account next” as the primary completion action
and a clear “Skip 2FA for now” option. No reward is claimed before a backend
grant exists.

## Deployment

1. Back up PostgreSQL.
2. Set a strong `TWO_FACTOR_ENCRYPTION_KEY` in every API replica (recommended).
3. Deploy the API image. Its existing startup command runs migration 042 before
   starting Fastify.
4. Deploy the frontend image.
5. Confirm one API replica logs `referral qualification complete`.
6. Exercise the manual checks below.

No external billing migration or payment-provider edit is required.

## Manual verification

1. Sign up from `/?ref=<valid code>` and confirm exactly one referral row.
2. Complete onboarding, choose the 2FA setup action, scan the QR, enter a valid
   token, and store the displayed recovery codes.
3. Sign out/in and confirm the second-factor prompt.
4. Use one recovery code once and confirm reuse fails.
5. Complete one Cruush/message action and confirm one activity row; repeat the
   action and confirm no second row for that date.
6. In a staging database, backdate activity/referral rows to verify milestone
   and qualification processing.
7. Inspect member `/rewards`; verify no risk/audit internals appear.
8. As a moderator, list grants, reverse a staging grant, and confirm the reversal
   row exists while the original grant remains unchanged.

## Administrative inspection and reversal

Use the moderator/admin APIs above. To reverse a grant:

```http
POST /api/admin/rewards/grants/<grant-uuid>/reverse
Content-Type: application/json

{"reason":"Confirmed fraudulent referral"}
```

The call is idempotent. It reports `alreadyReversed` on a retry.

## Tests

Focused suites cover reward dates/streaks/milestones/caps/banking/reversal,
referral pending/rejected/flagged/rewarded/retry behavior, TOTP setup/replay and
recovery/disable/trust behavior, API authorization/rate limits/serialization,
and frontend loading/error/empty/success/setup states.

## Known limitations and future work

- The scheduler is in-process. A dedicated worker or platform cron is preferable
  when background volume or replica count grows.
- Flagged-referral inspection is API-based; a dedicated moderator dashboard
  queue would improve operations.
- Existing account deletion means reward ledger user IDs can become tombstoned
  opaque UUIDs. A future privacy-safe audit-subject/tombstone model would make
  this relationship more explicit.
- Promo time is stored in seconds to avoid wasting partial paid-overlap time;
  the member UI rounds banked days to two decimals.
- Configuration has a short process-local cache and no admin editor yet.
- The repository dependency audit still reports major-upgrade advisories for
  React Router and Sharp, plus a low-severity development-only esbuild advisory.
  These predate and are unrelated to rewards; evaluate the framework/media
  upgrades separately because Sharp is part of the existing moderation-media
  path and React Router 8 is a breaking upgrade.
