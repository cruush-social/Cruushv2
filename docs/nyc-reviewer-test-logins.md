# NYC Reviewer Test Logins

These accounts are for staging/local review only. Both have saved NYC profile locations so remote testers enter the NYC beta map path. The codeveloper account also unlocks internal map test tools like NPC Ghost Test and Mika Demo. The bank reviewer account does not.

## Credentials

Set the shared password out of band with:

```bash
REVIEWER_TEST_ACCOUNTS_ENABLED=true
REVIEWER_TEST_ACCOUNT_PASSWORD=<shared-password>
```

Then seed or refresh the accounts:

```bash
npm --prefix server run seed:reviewer-accounts
```

The seeder creates verified-login accounts and resets their password to `REVIEWER_TEST_ACCOUNT_PASSWORD`.

## Accounts

| Audience | Login email | NYC spoof? | Saved area | Purpose |
| --- | --- | --- | --- | --- |
| Codeveloper | `codeveloper-nyc@cruush.local` | Yes | Lower Manhattan, near `40.7363, -73.9905` fuzzy display | Remote dev/testing from outside NYC with internal map test tools enabled. |
| Bank reviewer | `bank-reviewer-nyc@cruush.local` | Yes | Lower Manhattan, near `40.7332, -74.0031` fuzzy display | Bank/payment review smoke testing with a realistic non-admin reviewer account. |

## Difference Between Them

Both accounts spoof NYC through saved profile location data, so browser geolocation should not pull a remote tester back to Minneapolis or another real location on map entry.

The codeveloper account is for internal testing from outside NYC and can access developer-only map tools, including the NPC Ghost Test switch and Mika Demo pin. It is not the hardcoded development admin login, but it is allowed to use these internal testing controls.

The bank reviewer account is for external review and payment smoke testing. Keep the bank account boring and representative: no developer toggles, no demo-only map pins, and no special admin behavior. Do not give the bank the codeveloper login or the development admin login.
