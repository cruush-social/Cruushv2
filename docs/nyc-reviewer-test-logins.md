# NYC Reviewer Access

This document is the source of truth for staging reviewer access.

Bank/payment review can use the bank-only staging login below. The account is an auth/profile/location shell only: do not prefill fake photos, fake messages, fake DMs, fake mutual cruushes, fake groups, or fake payment fixtures for bank review.

## Staging Reviewer Accounts

| Audience | Login email | NYC saved location? | Purpose |
| --- | --- | --- | --- |
| Bank reviewer | `bank-reviewer-nyc@cruush.local` | Yes | Bank/payment review with no fake content fixtures and no developer-only map tools. |
| Codeveloper | `codeveloper-nyc@cruush.local` | Yes | Internal remote development/testing with developer-only map tools enabled. |

Set passwords out of band with API staging environment variables:

```bash
REVIEWER_TEST_ACCOUNTS_ENABLED=true
REVIEWER_TEST_ACCOUNT_PASSWORD=<shared-internal-password>
BANK_REVIEWER_ACCOUNT_PASSWORD=<shared-bank-reviewer-password>
```

Then create or refresh the reviewer auth/profile/location accounts from the API container:

```bash
npm --prefix server run seed:reviewer-accounts
```

The seeder creates or updates only `bank-reviewer-nyc@cruush.local` and `codeveloper-nyc@cruush.local`. It also removes legacy payment smoke artifacts: `payment@cruush.local`, old tagged bank/payment smoke conversations, and old tagged bank/payment smoke group fixtures.

## Bank Review Accounts

For bank/payment review:

- Use `bank-reviewer-nyc@cruush.local` when the bank needs a ready NYC-location account.
- Do not give the bank `codeveloper-nyc@cruush.local`, the development admin login, or any other seeded/local email login.
- Do not prefill fake profile data, fake photos, fake messages, fake DMs, fake mutual cruushes, or fake groups.
- If a message, DM, group, profile, report, or checkout flow needs to be tested, create it during review through the visible app flow with real tester-owned accounts.

The codeveloper account can access developer-only map tools, including NPC Ghost Test and Mika Demo. Bank/payment reviewers must not see those controls.
