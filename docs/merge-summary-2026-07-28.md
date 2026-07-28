# Main merge summary - 2026-07-28

Commit: `99afeb76550d2da49b2cbb542a14f0aaf7dc3655`

This summarizes the final merge cleanup after Hazel's rewards, referral, 2FA,
and moderation work landed. The resolution kept the new backend/product work
while restoring Julien's recent visual direction on overlapping frontend
surfaces.

## Frontend visual cleanup

- Restored the map experience by removing the old developer-only NPC Ghost Test
  toggle, demo pin injection, and Mika/Mike demo copy from `MapHome`.
- Hardened map marker interactions so clicks on mutual or other profile pins
  open the selected profile instead of being swallowed by the map background.
- Updated the shared tab style to use neutral grey capsule hover and active
  states, with no colored outlines or colored text shifts.
- Applied the neutral capsule choice to profile detail tabs and the `/cruush`
  activity tabs.
- Simplified `/cruush` tabs to text-only labels: `incoming`, `sent`, `mutual`,
  and `views`.
- Removed the `/cruush` section headers `your cruushes` and
  `relationships, interest & activity`.
- Made the app's dark theme tokens closer to the blacker map tone.
- Capped profile hero media height for square and foldable-phone ratios so the
  profile photo does not consume the full viewport.
- Restored profile-edit dropdown placement so menus can drop down when there is
  room and auto-flip upward near the bottom of the viewport.
- Rounded the sign-in button to match the email and password inputs.
- Added the launch-style login map teaser background used by the sign-in view.

## Hazel feature audit

### 2FA

Hazel added real two-factor authentication work, not just placeholder UI. The
implementation includes TOTP setup, activation, login challenge support,
recovery codes, disable/regeneration flows, encrypted secrets, rate limiting,
database tables, backend tests, API client coverage, and frontend login/rewards
UI integration.

Key surfaces:

- `server/src/two-factor.ts`
- `server/src/routes/rewards.ts`
- `server/sql/042_rewards_and_two_factor.sql`
- `src/app/lib/rewardsApi.ts`
- `src/app/components/Rewards.tsx`
- `src/app/components/Auth.tsx`

### Referral and affiliate-style links

Hazel added referral links and qualification logic. This is closer to an
affiliate/referral system than a generic affiliate dashboard: users can share a
referral link, signups can carry a `?ref=` code, and the backend qualifies
referrals based on account age, 2FA, profile completion, and account standing
before awarding promotional Cruush+ access.

Key surfaces:

- `server/src/referrals-service.ts`
- `server/src/routes/rewards.ts`
- `server/sql/042_rewards_and_two_factor.sql`
- `src/app/components/Rewards.tsx`
- `src/app/components/Auth.tsx`

### Login rewards

Hazel did not add rewards for login by itself. The rewards model credits
meaningful activity, such as cruushes, messages, and posts. Opening the app or
logging in alone does not count.

## Moderation status

The moderation system is real and substantially implemented. It includes report
intake, admin moderation routes, a unified moderation queue, moderation actions,
review decisions, media/content review surfaces, access logging, and tests. It
also documents the intended policy and operating model.

Key surfaces:

- `docs/moderation.md`
- `server/src/routes/admin-moderation.ts`
- `server/src/routes/reports.ts`
- `server/sql/034_moderation_actions.sql`
- `server/sql/041_unified_moderation_queue.sql`
- `server/src/app.test.ts`

Known caveats:

- Provider-backed media safety still depends on deployment configuration.
- PhotoDNA remains intentionally disabled unless separately configured.
- Rewards/referral moderation is API-backed, but there is not yet a dedicated
  rewards moderation dashboard.

## Local seeded-profile testing

Local seeded profiles are available as:

- `test-cruush-01@cruush.local`
- `test-cruush-02@cruush.local`
- ...
- `test-cruush-20@cruush.local`

Use the local seed password from the seed script or private handoff notes. Do
not add real or reusable credentials to repository docs.

Useful smoke routes:

- `/map`
- `/map?mode=mutuals`
- `/profile`
- `/profile/edit`
- `/cruush`
- `/rewards`
- `/admin/moderation`

## Verification completed

Frontend focused tests:

```sh
npm test -- src/app/components/MapView.test.tsx src/app/components/MapHome.test.tsx src/app/components/ProfileView.test.tsx src/app/components/ProfileEdit.test.tsx src/app/components/MultiSelect.test.tsx src/app/components/CruushActivity.test.tsx src/app/components/Auth.test.tsx src/app/components/Rewards.test.tsx src/app/lib/rewardsApi.test.ts src/app/lib/authApi.test.ts
```

Result: 9 test files passed, 102 tests passed.

Backend focused tests:

```sh
npm --prefix server test -- rewards-service.test.ts referrals-service.test.ts two-factor.test.ts rewards-routes.test.ts app.test.ts
```

Result: 5 test files passed, 239 tests passed.

Login teaser tests:

```sh
npm test -- src/app/components/LaunchLoginMapTeaser.test.tsx src/app/components/Auth.test.tsx
```

Result: 2 test files passed, 5 tests passed.

Builds:

```sh
npm run build
npm --prefix server run build
```

Both builds passed. The frontend build still reports the existing large
`MapView` chunk warning.

Final focused map-marker regression test:

```sh
npm test -- src/app/components/MapView.test.tsx
```

Result: 1 test file passed, 20 tests passed.
