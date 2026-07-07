# NYC Reviewer Test Logins

These accounts are for staging/local review only. They have saved NYC profile locations so remote testers enter the NYC beta map path. The codeveloper account also unlocks internal map test tools like NPC Ghost Test and Mika Demo. The bank and payment reviewer accounts do not.

## Credentials

Set the shared password out of band with:

```bash
REVIEWER_TEST_ACCOUNTS_ENABLED=true
REVIEWER_TEST_ACCOUNT_PASSWORD=<shared-password>
PAYMENT_REVIEWER_TEST_ACCOUNT_PASSWORD=paymentpaytest
```

Then seed or refresh the accounts:

```bash
npm --prefix server run seed:reviewer-accounts
```

The seeder creates verified-login accounts. It resets `codeveloper-nyc@cruush.local` and `bank-reviewer-nyc@cruush.local` to `REVIEWER_TEST_ACCOUNT_PASSWORD`, and resets `payment@cruush.local` to `PAYMENT_REVIEWER_TEST_ACCOUNT_PASSWORD`.

## Accounts

| Audience | Login email | NYC spoof? | Saved area | Purpose |
| --- | --- | --- | --- | --- |
| Codeveloper | `codeveloper-nyc@cruush.local` | Yes | Lower Manhattan, near `40.7363, -73.9905` fuzzy display | Remote dev/testing from outside NYC with internal map test tools enabled. |
| Bank reviewer | `bank-reviewer-nyc@cruush.local` | Yes | Lower Manhattan, near `40.7332, -74.0031` fuzzy display | Bank/payment review smoke testing with a realistic non-admin reviewer account. |
| Payment reviewer | `payment@cruush.local` | Yes | Lower Manhattan, near `40.7286, -73.9938` fuzzy display | Bank/payment checkout testing with the shared staging login `paymentpaytest`. |

## Difference Between Them

All reviewer accounts spoof NYC through saved profile location data, so browser geolocation should not pull a remote tester back to Minneapolis or another real location on map entry. `payment@cruush.local` is pre-positioned in NYC for the bank checkout path.

The codeveloper account is for internal testing from outside NYC and can access developer-only map tools, including the NPC Ghost Test switch and Mika Demo pin. It is not the hardcoded development admin login, but it is allowed to use these internal testing controls.

The bank reviewer and payment reviewer accounts are for external review and payment smoke testing. Keep these accounts boring and representative: no developer toggles, no demo-only map pins, and no special admin behavior. Do not give the bank the codeveloper login or the development admin login.
