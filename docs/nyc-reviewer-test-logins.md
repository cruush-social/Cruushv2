# NYC Reviewer Access

This document is the source of truth for staging reviewer access.

Bank/payment review must use real accounts created through the normal cruush app flow. Do not seed fake bank accounts, fake payment accounts, fake profiles, fake messages, mutual cruush fixtures, DM fixtures, or group fixtures for bank review.

## Internal Codeveloper Account

The only seeded reviewer-style account is for internal codeveloper testing from outside NYC:

| Audience | Login email | NYC saved location? | Purpose |
| --- | --- | --- | --- |
| Codeveloper | `codeveloper-nyc@cruush.local` | Yes | Internal remote development/testing with developer-only map tools enabled. |

Set the password out of band with:

```bash
REVIEWER_TEST_ACCOUNTS_ENABLED=true
REVIEWER_TEST_ACCOUNT_PASSWORD=<shared-internal-password>
```

Then seed or refresh the internal codeveloper account from the API container:

```bash
npm --prefix server run seed:reviewer-accounts
```

The seeder creates or updates only `codeveloper-nyc@cruush.local`. It also removes legacy seeded bank/payment review artifacts: `bank-reviewer-nyc@cruush.local`, `payment@cruush.local`, old bank/payment smoke conversations, and old bank/payment smoke group fixtures.

## Bank Review Accounts

For bank/payment review:

- Use real accounts created through signup or another normal production-path account creation flow.
- Do not give the bank `codeveloper-nyc@cruush.local`, the development admin login, or any seeded/local email login.
- Do not prefill fake profile data, fake photos, fake messages, fake DMs, fake mutual cruushes, or fake groups.
- If a message, DM, group, profile, report, or checkout flow needs to be tested, create it during review through the visible app flow with real tester-owned accounts.

The codeveloper account can access developer-only map tools, including NPC Ghost Test and Mika Demo. Bank/payment reviewers must not see those controls.
