# IDOR and Dyke Crowd Update Summary

## Scope

This update covers two production-facing changes:

- Harden profile reports so a user cannot report a profile they are not allowed to view.
- Make `Dyke` the canonical crowd value across profile data, visibility rules, discovery filters, privacy settings, seed data, and user-facing UI.

## IDOR Fix

- Added a shared backend visibility assertion for profile rows.
- Reused that assertion before accepting profile reports.
- Added test coverage proving reports are rejected when the reporter cannot view the target profile.

## Dyke Crowd Migration

- Updated backend and frontend crowd source-of-truth lists to use `Dyke`.
- Updated user-facing profile edit, map notice, seed data, API types, and tests.
- Renamed the app-facing sexuality option from `sapphic` to `dyke`.
- Left historical SQL identifiers such as `crowd_sapphic` untouched for compatibility.

## Legacy Compatibility

- Backend parsing accepts legacy `Sapphic` crowd values.
- Decrypted sensitive profile and visibility data returns `Dyke` to clients.
- Crowd blind-token matching supports both new `crowd:dyke` / `crowd-mode:dyke` and legacy `crowd:sapphic` / `crowd-mode:sapphic` tokens.
- Discovery crowd filters for `Dyke` match legacy `Sapphic` token rows during the transition.

## Verification

- `npm --prefix server test -- src/app.test.ts src/profile-sensitive.test.ts src/profile-schema.test.ts`
- `npm test -- src/app/components/ProfileEdit.test.tsx src/app/components/MapHome.test.tsx`
- `npm --prefix server run build`
- `npm run build`

The frontend build completed with the existing large-chunk warning.
