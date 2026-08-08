# cruush Beta QA Baseline

Last updated: 2026-07-08

This file records the test/build baseline for the beta-readiness implementation pass. Commands were run from `C:\Users\Hazel\Projects\Cruushv2`.

## Commands

| Command | Result | Notes |
| --- | --- | --- |
| `npm --prefix server test -- src/account-status.test.ts src/config.test.ts src/migrate.test.ts src/app.test.ts` | passed | 4 files, 144 tests. Covers account status helper, config, migration order, and app route/security behavior. |
| `npm --prefix server test` | passed | 25 files, 215 tests. Full server suite. |
| `npm --prefix server run build` | passed | Backend TypeScript build passed. |
| `npm test -- src/app/App.test.tsx src/app/components/Settings.test.tsx` | passed | 2 files, 15 tests. npm reported the existing unknown `publish` project config warning. |
| `npm run build` | passed | Frontend production build passed. Vite reported the existing large chunk warning for `dist/assets/index-*.js`. |

## Coverage Gaps To Track

- Moderator/admin API and UI coverage.
- User blocking route and cross-surface enforcement coverage.
- Explicit media preference and backend media selection coverage.
- Profile/media upload cleanup coverage.
- Account lifecycle coverage for change password and deactivation.
- End-to-end manual beta smoke checklist for staging.
