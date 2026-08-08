# cruush Match, Visibility, and Relationship System Implementation

This document explains the v1.1 match, visibility, and relationship-system implementation: what changed, why the system was shaped this way, and how the new behavior is verified.

Note: the v1.1 plaintext relationship storage described here has been superseded by `docs/encrypted-relationship-activity-storage-implementation.md`, which moves cruushes, mutual cruushes, removals, and profile views to encrypted relationship records with blind indexes.

## Scope

The work implemented a privacy-first relationship and access-control slice for cruush. The core product idea is that a mutual cruush is not just a social state. It is a server-verifiable relationship that controls messaging, protected profile fields, profile-view history, and location precision.

The slice covers:

- Persisted mutual cruush relationship rows.
- Server-managed encrypted match tokens.
- Visibility resolution for mutual cruush protected profile fields.
- Profile view history with Ghost Mode suppression.
- Mutual-gated direct message creation and sending.
- Mutual cruush map data with fuzzy or precise coordinates.
- cruush+ entitlement shaping for incoming cruushes and profile views.
- A redesigned four-tab cruush activity surface.
- Settings for Ghost Mode and precise mutual location visibility.

## Guiding Reasoning

The main design constraint was privacy. The browser should not receive raw authorization artifacts, and the server should be the only place that decides whether a relationship grants access.

The implementation follows these principles:

- Keep one-way cruush history intact so incoming and sent tabs still reflect user activity.
- Add a canonical `cruush_matches` row only when reciprocal cruushes exist.
- Treat match tokens as backend-only permission material, not client credentials.
- Default precise location sharing to off.
- Make Ghost Mode conservative: it suppresses discovery, mutual map inclusion, precise location reveal, and profile-view logging.
- Return resolved booleans and shaped rows to the frontend instead of exposing internal token or match-token state.
- Keep cruush+ as a backend entitlement flag only, without adding payment-provider coupling.

## Database Changes

Migration `server/sql/018_match_visibility_relationships.sql` adds:

- `cruush_matches`
  Canonical mutual relationship rows with ordered user ids and revocation.

- `cruush_match_tokens`
  Backend-only encrypted, signed, short-lived permission grants bound to a match, both users, a purpose, expiry, and key version.

- `profile_view_events`
  Authenticated profile-view history with hourly dedupe buckets.

- `user_privacy_settings`
  Ghost Mode and precise-location visibility. Precise reveal defaults to `none`.

- `user_entitlements`
  cruush+ feature entitlement flags and expiry without any payment-provider integration.

The migration is registered in `server/src/migrate.ts`.

## Configuration Changes

`server/src/config.ts` now supports:

- `MATCH_TOKEN_ENCRYPTION_KEY`
- `MATCH_TOKEN_SIGNING_KEY`
- `MATCH_TOKEN_KEY_VERSION`

Development and test environments can fall back to `SESSION_SECRET`. Production requires strong explicit match-token keys. `server/.env.example` documents the new values.

## Backend Relationship Helper

`server/src/match-relationships.ts` centralizes relationship and privacy decisions.

It provides:

- Privacy setting read/write helpers.
- cruush+ entitlement lookup.
- Mutual match creation and revocation.
- Encrypted/signed match-token creation.
- Relationship permission resolution.
- Active mutual-message permission checks.
- Profile-view recording with Ghost Mode suppression.

The helper returns resolved relationship permissions such as:

- `isMutualCruush`
- `canMessage`
- `canRevealMutualProtectedFields`
- `canRevealPreciseLocation`
- `shouldLogProfileView`
- viewer and target Ghost Mode state

This keeps the API routes from duplicating relationship logic and makes the privacy behavior easier to audit.

## cruush API Changes

`server/src/routes/cruush.ts` was extended substantially.

`POST /api/cruush` still creates or updates one-way cruush history. When the cruush is reciprocal, it now:

- Upserts a canonical `cruush_matches` row.
- Issues a backend-only match token.
- Resolves relationship permissions.
- Returns only safe permission booleans to the client.

`GET /api/cruush/me` now returns the activity hub payload:

- `entitlement`
- `counts`
- `incoming`
- `sent`
- `mutual`
- `views`

Free users get only the newest incoming cruush and newest profile view revealed. Older incoming cruushes and profile views are returned as locked rows. cruush+ users get full history.

`GET /api/cruush/mutual-map` returns only mutual cruush pins. It hides pins when the viewer has Ghost Mode enabled, filters out Ghost Mode targets, and chooses fuzzy or precise coordinates based on the relationship and target privacy settings.

`DELETE /api/cruush/matches/:otherUserId` revokes a mutual relationship and its active tokens.

The older `GET /api/cruush/:userId` route remains compatible for existing callers.

## Profile Visibility and Profile Views

`server/src/routes/profiles.ts` now asks the relationship helper for external profile reads.

The important behavior changes are:

- `mutual_cruushes` protected fields reveal only to mutual cruushes.
- Profile reads include `viewer_relationship` permissions.
- Profile views are logged for authenticated external reads.
- Profile views are not logged when the viewer or target Ghost Mode rules suppress logging.
- The existing visibility-rule checks continue to run before exposing private profile data.

Privacy settings endpoints were also added:

- `GET /api/profiles/me/privacy-settings`
- `PUT /api/profiles/me/privacy-settings`

## Messaging Changes

`server/src/routes/messages.ts` now blocks new non-mutual direct-message behavior while preserving existing conversation reads.

The rules are:

- Reading existing conversations remains allowed.
- Creating a new DM requires an active mutual cruush permission.
- Sending into a DM requires an active mutual cruush permission.
- Group chat behavior is unchanged.

The API error code for this is `MUTUAL_CRUUSH_REQUIRED`.

The frontend helper `src/app/lib/openConversation.ts` catches that code and presents a clear message instead of dropping the user into a broken message flow.

## Discovery and Location Changes

`server/src/routes/users.ts` now filters Ghost Mode users out of discovery.

`MapHome` supports `/map?mode=mutuals`. In that mode it:

- Calls the mutual-map endpoint instead of nearby discovery.
- Skips the fake demo fallback pin.
- Labels the map mode as mutual cruushes.
- Passes relationship metadata through to map markers.

`MapView` marker data now accepts relationship metadata:

- relationship kind
- location precision
- message permission

The marker keeps the existing heart-pin dimensions and adds a small mutual relationship badge without changing the stable marker sizing expectations.

## Frontend Activity Hub

`src/app/components/CruushActivity.tsx` was rebuilt into a four-tab activity hub:

- incoming
- sent
- mutual
- views

The design uses the existing cruush logo, dark surfaces, pink accents, `HeartPhoto`, lucide icons, and the current heart-pin visual language. The reference images guided density, tab structure, and mood, but the implementation stays within the existing app system.

Behavior by tab:

- Incoming
  Shows the newest visible incoming cruush for free users and locked rows for older ones. cruush+ can see full history.

- Sent
  Shows all sent cruushes with pending or mutual state.

- Mutual
  Shows mutual cruushes with shared crowds/vibes, distance, last active labels, message action, map action, and list/map modes.

- Views
  Shows the newest visible profile view for free users and locked rows for older ones. cruush+ can see full history.

The activity API client was updated in `src/app/lib/cruushApi.ts` with the new response types.

## Settings UI

`src/app/components/Settings.tsx` now includes a Privacy and Location section.

The settings are persisted through `src/app/lib/privacyApi.ts`:

- Ghost Mode
- Precise location for mutual cruushes

Precise location is disabled by default and disabled in the UI while Ghost Mode is enabled.

## Profile and Message UX

`src/app/components/ProfileView.tsx` reads `viewer_relationship` from profile responses. If relationship permissions say messaging is unavailable, the message action is blocked with a clear prompt.

`src/app/lib/openConversation.ts` handles `MUTUAL_CRUUSH_REQUIRED` from the backend so profile and map actions do not navigate users into an unusable state.

## Testing Added or Updated

Server coverage now includes:

- Reciprocal cruush creation creates a match and server-managed token.
- Free activity responses lock older incoming cruushes and views.
- Ghost Mode suppresses mutual map results.
- Mutual-cruush protected fields reveal only to active mutuals.
- Ghost Mode suppresses profile-view logging.
- New DM creation requires mutual permission.
- Sending into a DM requires mutual permission.

Client coverage now includes:

- Four cruush tabs with counts, locked rows, mutual actions, and map CTA.
- Mutual map mode loading from the mutual-map endpoint.
- Settings persistence for Ghost Mode and precise mutual location visibility.
- Existing MapView no-layout-shift marker expectations.

Some existing interaction-heavy tests were given scoped longer timeouts because they occasionally exceeded Vitest's default 5 second timeout under full-suite load. The assertions and behavior stayed the same.

## Verification

The final verification set passed:

- `corepack pnpm test`
  19 test files, 138 tests passed.

- `corepack pnpm build`
  Frontend production build passed.

- `npm --prefix server run build`
  Server TypeScript build passed.

Browser inspection reached the local Vite app at `http://localhost:5173`. Without a running configured backend session and Postgres database, authenticated routes such as `/cruush`, `/map?mode=mutuals`, and `/settings` correctly fell back to the sign-in shell. No browser console errors were reported in that unauthenticated route check.

## Tradeoffs and Follow-Up Ideas

This implementation intentionally avoids payment-provider integration. cruush+ is represented as a backend entitlement because that keeps this slice focused on permissions and product behavior.

The match token is created and validated server-side, but the browser only receives resolved permissions. This is more conservative than exposing token material and lets the backend rotate or revoke tokens without client changes.

The mutual map currently returns shaped relationship pins. A future pass could add richer sorting, filtering, and pagination if the mutual list becomes large.

The MapView marker rendering still uses separate React roots for MapLibre marker elements. That matches the existing marker architecture and keeps marker dimensions stable, but it can produce React test warnings about updates outside `act`. The tests pass and assert the important layout contract.

The next useful follow-up would be an authenticated local seed/dev fixture path so `/cruush`, `/map?mode=mutuals`, and `/settings` can be visually inspected end to end without manually provisioning a local Postgres dataset.
