# Commit 9bfe083 Change Summary

Commit: `9bfe083 Refine crowd visibility and message permissions`

Pushed to `main`: 2026-07-08

## Purpose

This commit tightens the map visibility model, clarifies Ghost Mode language, standardizes visible `cruush+` branding, removes the separate trans profile stat, and fixes a message-send server error caused by unreadable encrypted privacy settings during mutual-message permission checks.

## User-Facing Changes

### Map Crowds And Visibility

- Added the supplied Crowd icon as a first-class app icon with colored and white variants.
- Moved the right-side map action stack closer to the upper-right capsule menu.
- Replaced the old visibility button icon with the Crowd icon:
  - White when inactive.
  - Colored when visibility controls are active.
- Added a single active Crowd Mode notice on the map instead of separate crowd pills:
  - `Dyke Crowd Active`
  - `Dyke and Gay Crowds Active`
  - `Dyke, Gay, and T4T Crowds Active`
- Kept Crowd Mode as the positive "show only these crowds" exception.
- Changed visibility filters to mean "hide me from these people" instead of "only show me to these people."
- Free users can now use up to 3 visibility exclusion filter groups before `cruush+` is required.

### Visibility Menu Copy

- Updated the visibility panel intro to explain that hidden filters exclude audiences.
- Added free-user usage copy: `Free accounts can hide from up to 3 filter groups.`
- Added gentle Crowd Mode copy explaining it is different from exclusion filters:
  - `Pick who should not see you. Crowd Mode is different: it makes you visible only to the active crowds you choose.`
  - `Crowd Mode is the show-only exception: when selected, only people in those crowds can see you.`
- Updated distance and age labels so they read as hiding rules, not positive discovery rules.

### Ghost Mode Copy

- Clarified that Ghost Mode shows other people a shifting location within the selected radius.
- Clarified that the signed-in user still sees their own current map position.
- Clarified the radius tradeoff:
  - Larger radius gives more cover.
  - Smaller radius keeps the public pin closer.
- Clarified precise-location exceptions for mutual cruushes and mutual crowds.

### `cruush+` Branding

- Added a reusable `CruushPlusWord` component that applies the `cruush-logo-font` gothic font.
- Updated visible `cruush+` text in premium notices, upgrade buttons, headings, success copy, and developer toggle copy.

### Profile Trans Display

- Removed the separate `Trans status` stat from profile details.
- If a profile has `is_trans === true`, the profile now shows a lowercase `trans` badge beside gender identity badges.
- Duplicate `Trans` identity values are collapsed so `trans` appears only once.
- If the user did not select trans, no trans badge appears.

## Backend Changes

### Visibility Semantics

- Server profile visibility rules now treat selected trait filters as exclusion rules.
- Crowd Mode remains positive show-only filtering through `active_crowd_modes`.
- Added server-side counting for visibility exclusion filter groups.
- Saving more than 3 exclusion filter groups as a free user now requires `cruush+`.

### Message 500 Fix

- Root cause: `POST /api/messages` could fail with an internal server error if mutual-message permission checks tried to read a participant privacy policy that could not be decrypted.
- Fix: relationship permission checks now fall back to conservative Ghost Mode privacy settings if a participant privacy policy is unavailable or unreadable.
- This keeps message permission checks from crashing while preserving a privacy-safe fallback.

## Tests Added Or Updated

- Map button positioning and visibility icon variant.
- Single combined active Crowd Mode notice.
- Visibility exclusion copy and free-user 3-filter cap.
- Crowd Mode explanation copy.
- Ghost Mode copy.
- `cruush+` font usage in visible premium UI.
- Profile `trans` badge behavior.
- Server visibility exclusion semantics.
- Server free-user visibility cap.
- Message-send regression for unreadable encrypted privacy settings.

## Verification Completed Before Push

- Focused frontend tests passed.
- Focused server tests passed.
- `npm run build` passed.
- `npm --prefix server run build` passed.
- `git diff --cached --check` passed.

## Staging Public Checks After Push

Checked on 2026-07-08 at about 23:24 UTC:

- `https://api-staging.cruush.app/health` returned `HTTP 200` with `{"ok":true}`.
- `https://api-staging.cruush.app/api/meta` returned `HTTP 200` with service metadata.
- `https://staging.cruush.app/` returned `HTTP 200`.
- Frontend `Last-Modified` was `Wed, 08 Jul 2026 23:16:14 GMT`, consistent with the post-push staging deploy window.

## Bank Test Readiness

Superseded on 2026-07-09: bank/payment review must use real accounts created through the normal app flow. Do not use seeded bank/payment reviewer accounts, fake messages, fake mutual cruushes, fake DMs, or fake groups. The reviewer-account seeder now only maintains the internal codeveloper account and removes legacy bank/payment seed artifacts.

The commit itself is ready for staging review, and the public staging surfaces are online.

Do not treat the full bank/payment-processor smoke as complete until these checks are rerun on staging:

- Confirm staging is serving commit `9bfe083` on both frontend and API paths.
- Create or use real bank/payment reviewer accounts through the normal app flow.
- Send DMs and create groups only during review with real tester-owned accounts.
- Smoke the visibility menu and map Crowd Mode notice with an account that has crowd memberships.
- Confirm profile photo upload acceptance/rejection manually; this was previously the top unresolved bank-readiness proof.
- Keep PhotoDNA disabled unless the exact Microsoft operation path and request/response behavior have been verified.

## Reviewer Login Reminder

Use `docs/nyc-reviewer-test-logins.md` as the source of truth.

- Codeveloper email: `codeveloper-nyc@cruush.local`
- Bank/payment reviewers must use real accounts created through the normal app flow.
- `codeveloper-nyc@cruush.local` uses `REVIEWER_TEST_ACCOUNT_PASSWORD` and is internal-only.

Do not paste reviewer passwords into docs or chat. Share the actual internal password values out of band.
