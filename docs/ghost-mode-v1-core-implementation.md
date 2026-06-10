# Ghost Mode V1 Core Implementation

This document explains the Ghost Mode V1 core implementation: what changed, why the system was shaped this way, how the backend and frontend pieces fit together, and what developers need to know before extending or operating it.

## Summary

Ghost Mode V1 moves map-display location privacy from plaintext coordinates and client-side approximation into a server-controlled encrypted display-token model.

The implementation adds:

- encrypted visibility policies
- encrypted location envelopes
- blind coarse index tokens for discovery lookup
- deterministic viewer-specific Ghost coordinates
- short-lived encrypted browser display-location tokens
- a browser display-key endpoint
- token-only discovery and mutual-map response shapes
- Ghost settings controls
- owner-only Ghost indicator and radius circle on the map
- Privacy Audit and revoke APIs/UI
- migration and backfill tooling

The main runtime rule is:

Map and location-display APIs should not return raw `lat`, `lng`, `ghost_mode_enabled`, Ghost radius, or precise-policy internals. The server resolves policy and relationship permissions, then returns short-lived encrypted display-location tokens. The browser decrypts those tokens in memory and passes coordinates directly to the map renderer.

## Scope

This pass implements the strict V1 core from the RFC plan:

- Ghost users remain discoverable.
- Ghost pins are rendered from server-issued display tokens.
- Public precise mode remains exact by policy.
- Mutual cruush precision can override Ghost only when the target policy allows it and a valid encrypted mutual relationship token exists.
- Revocation removes grant-derived precision immediately on the next map/profile permission resolution.
- `STEALTH` is supported in policy precedence and suppresses pins, but no premium product or payment flow was added.
- Existing plaintext storage remains only for migration/backfill compatibility and non-core legacy fallback behavior.

Explicitly out of scope:

- full end-to-end encrypted location sharing
- production KMS integration
- real-time websocket updates
- payment-backed Stealth UI
- red-team/admin abuse tooling
- broad product redesign outside the Ghost Mode surfaces

## Guiding Reasoning

The implementation prioritizes server-side privacy decisions over client trust.

The old behavior mixed three concerns:

- persisted plaintext coordinates
- persisted plaintext privacy settings
- client-side map approximation

That meant the browser could receive location values and privacy details that were not necessary for rendering. The new model separates storage, authorization, and display:

- storage uses encrypted envelopes and policies
- authorization happens on the server using relationship state and policy state
- display uses short-lived encrypted tokens scoped to the authenticated browser session

This creates a tighter invariant: the public map API can reveal that a profile exists and provide a renderable token, but it does not directly expose raw coordinates or policy internals in JSON.

## Database Changes

Migration `server/sql/020_ghost_mode_location_privacy.sql` adds four tables.

### `encrypted_location_envelopes`

Stores encrypted latest-location payloads per subject user.

Important fields:

- `subject_user_id`
- encrypted payload fields: ciphertext, nonce, auth tag
- wrapped per-record DEK fields: wrapped key, nonce, auth tag
- `key_version`
- `coarse_index_tokens`
- `collected_at_ms`
- `expires_at_ms`

The encrypted payload stores `LocationPayload v1`:

- `subjectUserId`
- `locationVersion`
- `latE7`
- `lonE7`
- `accuracyM`
- `source`
- `deviceReportedAtMs`
- `collectedAtMs`
- `expiresAtMs`
- `keyVersion`

`latE7` and `lonE7` are encrypted. They are not stored as queryable plaintext columns in this table.

### `encrypted_visibility_tokens`

Stores encrypted per-user visibility policy payloads.

The encrypted payload stores `VisibilityPolicyPayload v1`:

- `subjectUserId`
- `policyVersion`
- `baseMode`
- `ghostRadiusMeters`
- `preciseToMutualCruushes`
- `preciseToMutualCrowds`
- `auditRequired`
- `updatedAtMs`
- `expiresAtMs`
- `keyVersion`

`baseMode` supports:

- `PUBLIC_PRECISE`
- `GHOST`
- `STEALTH`

### `ghost_rotation_tokens`

Stores encrypted rotation salt material for deterministic Ghost coordinate derivation.

Rotation token rows are bound to:

- subject user
- rotation epoch
- policy version
- location version
- radius
- expiry

These rows let the server derive stable Ghost coordinates for a viewer during an epoch without storing public Ghost coordinates.

### `encrypted_privacy_audit_events`

Stores encrypted privacy audit and revoke events with blind indexes for lookup.

Currently used for precise-location revocation. A revoke event is represented as encrypted audit payload plus blind lookup indexes, so permission checks can determine whether a subject has revoked a viewer's grant-derived precision.

## Migration and Backfill

The migration is registered in `server/src/migrate.ts`.

The backfill script is `server/src/backfill-encrypted-location-privacy.ts`, exposed through:

```bash
npm --prefix server run location-privacy:backfill
```

The script:

- reads existing `profiles` coordinate rows
- writes encrypted location envelopes
- reads existing `user_privacy_settings`
- writes encrypted visibility policies
- supports dry-run behavior
- supports optional legacy coordinate purge mode

Operational sequence for a real environment:

1. Deploy code with new config present.
2. Run database migrations.
3. Run the location/privacy backfill.
4. Verify map endpoints return token-only payloads.
5. Optionally run purge mode to null legacy coordinate columns after rollout confidence.

The runtime has compatibility fallbacks for pre-migration schemas, but the intended post-migration runtime path is encrypted storage first.

## Configuration

`server/.env.example` and production validation now include:

- `LOCATION_ENCRYPTION_KEY`
- `LOCATION_INDEX_KEY`
- `VISIBILITY_POLICY_ENCRYPTION_KEY`
- `GHOST_DERIVATION_KEY`
- `DISPLAY_TOKEN_ENCRYPTION_KEY`
- `LOCATION_ENCRYPTION_KEY_VERSION`
- `LOCATION_INDEX_KEY_VERSION`
- `VISIBILITY_POLICY_ENCRYPTION_KEY_VERSION`
- `GHOST_DERIVATION_KEY_VERSION`
- `DISPLAY_TOKEN_ENCRYPTION_KEY_VERSION`

Development and test can fall back to `SESSION_SECRET` so local tests remain ergonomic. Production requires explicit strong values for the new keys.

Key separation is intentional:

- location encryption protects exact location payloads
- location index key protects coarse discovery tokens and audit indexes
- visibility policy encryption protects policy details
- Ghost derivation key protects deterministic Ghost coordinate generation
- display token encryption key protects browser-display payloads

## Backend Crypto Module

`server/src/location-privacy.ts` owns the new location privacy boundary.

It provides:

- visibility policy normalization and public response shaping
- location envelope encryption/decryption
- blind coarse index token creation
- deterministic Ghost coordinate derivation
- Ghost rotation token storage and loading
- browser display-key issuing
- display-location token encryption
- audit/revoke helpers
- server unit-test helpers for token round trips

### Encryption Approach

Encrypted policies, locations, rotation tokens, and audit events use:

- AES-256-GCM
- random 96-bit nonces
- per-record random data encryption keys
- wrapped DEKs using class keys derived from environment secrets
- AAD bound to subject, version, and timestamp fields

This gives each row independent encryption material while keeping the environment config simple for V1. Production KMS can later replace or wrap the class-key derivation layer without changing the public API contract.

### Blind Indexing

Discovery cannot query encrypted coordinates directly, so location upload stores coarse HMAC index tokens for the current cell/time bucket. Discovery requests compute nearby coarse tokens from the viewer's requested center and select envelopes where `coarse_index_tokens && $tokens`.

The coarse tokens are deliberately low-information:

- generated with `LOCATION_INDEX_KEY`
- rotated by time bucket
- used only to find candidate encrypted envelopes
- not reversible into exact coordinates by the database alone

After candidate selection, exact display coordinates are still decided by decrypting envelopes server-side and applying policy.

### Ghost Coordinate Derivation

Ghost display coordinates are deterministic per:

- subject user
- viewer user
- rotation epoch
- subject policy version
- rotation salt
- Ghost radius

The derivation samples uniformly inside the configured radius. Using viewer-specific seed material prevents all viewers from seeing the same Ghost point for a subject during an epoch, while still giving stable rendering during the epoch.

The selected radius values are:

- `500 ft`
- `0.25 mi`
- `0.5 mi`
- `1 mi`
- `3 mi`
- `5 mi`

### Display Tokens

Display tokens encrypt `DisplayLocationPayload v1`:

- `subjectUserId`
- `viewerUserId`
- `displayMode`
- `latE7`
- `lonE7`
- `accuracyDisplayM`
- `rotationEpoch`
- `subjectPolicyVersion`
- `relationshipGrantVersion`
- `expiresAtMs`
- `animationHint`
- `renderNonce`

The public token wrapper includes:

- `version`
- `tokenId`
- `keyId`
- `ciphertext`
- `nonce`
- `expiresAtMs`
- `tokenVersion`

Display tokens are short lived. They are encrypted for a browser display key scoped to the authenticated session. The client fetches that key from `GET /api/location/display-key`.

## Policy Precedence

The implemented precedence is:

1. Block or inaccessible profile rules suppress visibility through existing relationship/profile gates.
2. `STEALTH` suppresses pins.
3. Relationship precision grant returns `PRECISE` when policy allows and no revoke exists.
4. `GHOST` returns viewer-specific Ghost coordinates.
5. `PUBLIC_PRECISE` returns exact display coordinates by design.

Individual revoke currently targets grant-derived precision. It does not make a public precise user private. Users who do not want exact public coordinates should use Ghost or future Stealth product behavior.

## Backend Route Changes

### `GET /api/location/display-key`

Added in `server/src/routes/privacy.ts`.

Returns a short-lived browser display key scoped to the authenticated session. The frontend keeps it in memory and uses WebCrypto to decrypt display-location tokens.

### `GET /api/users`

Updated in `server/src/routes/users.ts`.

The primary response shape is now:

```json
{
  "data": {
    "mapEpochMs": 0,
    "profiles": []
  }
}
```

Each profile contains tokenized display fields, such as:

- `profileToken`
- display profile fields
- `displayLocationToken`
- `displayExpiresAtMs`
- `animationHint`
- `distanceLabel`
- `relationshipContext`
- relationship metadata

It intentionally does not include raw `lat`, `lng`, `ghost_mode_enabled`, radius, or policy internals.

Development note: the frontend adapter converts tokenized responses into the existing in-memory `DiscoveryUser` shape after decrypting the display token. That preserves current UI compatibility while keeping the network contract token-only.

### `GET /api/cruush/mutual-map`

Updated in `server/src/routes/cruush.ts`.

Mutual-map pins now use the same tokenized display-location model as discovery. Ghost Mode no longer hides mutual map pins by itself. Ghost users remain visible with Ghost tokens unless policy precedence suppresses the pin.

### `GET/PUT /api/profiles/me/privacy-settings`

Updated in `server/src/routes/profiles.ts`.

The route now reads/writes encrypted visibility policies and returns the public settings shape:

- `baseMode`
- `ghostModeEnabled`
- `ghostRadiusMeters`
- `ghostRadiusLabel`
- `preciseToMutualCruushes`
- `preciseToMutualCrowds`
- `updatedAtMs`

Legacy `preciseLocationVisibility` is kept in the response for compatibility with existing UI adapters and tests.

### `GET/POST /api/privacy/ghost-mode`

Added as an alias in `server/src/routes/privacy.ts`.

This gives clients a Ghost-specific settings endpoint without duplicating storage logic.

### `PUT /api/profiles/me/location`

Updated in `server/src/routes/profiles.ts`.

This route now:

- touches `profiles.location_updated_at`
- stores the submitted coordinates in `encrypted_location_envelopes`
- does not write raw coordinate values to `profiles.lat/lng/fuzzy_lat/fuzzy_lng`
- returns owner display-token metadata rather than raw saved coordinates

Raw coordinates are still accepted in the request body because the browser has to upload a location. The privacy boundary is about persistent storage and public display responses.

### `GET /api/privacy/audit`

Added in `server/src/routes/privacy.ts`.

Returns current exact-location grant candidates for the authenticated user, including viewer profile display data, grant reason, timestamp, and a revoke token.

### `POST /api/privacy/revoke`

Added in `server/src/routes/privacy.ts`.

Stores encrypted per-viewer revoke state. Permission checks consult revoke state immediately, so the next map/profile permission resolution removes grant-derived precision.

## Relationship Permission Changes

`server/src/match-relationships.ts` now resolves precise location permissions against encrypted visibility policies and encrypted relationship records.

Important behavior changes:

- Ghost Mode no longer automatically blocks all mutual precision.
- A valid mutual cruush plus active match token is still required.
- The target policy must allow precise mutual cruush location.
- `STEALTH` suppresses precise reveal.
- Revoke state overrides a grant-derived precision decision.

Compatibility fallback reads/writes `user_privacy_settings` only if the encrypted policy schema is missing. The post-migration runtime should use encrypted policies.

## Frontend Changes

### Display Token Decryption

`src/app/lib/displayLocationTokens.ts` handles:

- fetching the browser display key
- caching it in memory until expiry
- decrypting display-location tokens with WebCrypto
- returning coordinates only to runtime callers

The decrypted values are not persisted to local storage. They are passed into the existing map rendering flow as in-memory coordinates.

### Discovery Adapter

`src/app/lib/usersApi.ts` now supports both:

- legacy array responses
- new `{ mapEpochMs, profiles }` tokenized responses

For new responses, it decrypts each display token and returns the current `DiscoveryUser` shape used by `MapHome`.

### Mutual Map Adapter

`src/app/lib/cruushApi.ts` now supports tokenized mutual-map responses and decrypts display tokens into in-memory coordinates for rendering.

### Settings UI

`src/app/components/Settings.tsx` now includes:

- Ghost Mode toggle
- discrete radius slider values
- mutual cruush precise toggle
- mutual crowd precision controls
- Privacy Audit entry

The Settings code normalizes older privacy responses into the new shape so local and test callers are tolerant during rollout.

### Privacy Audit UI

`src/app/components/PrivacyAudit.tsx` adds the audit/revoke screen.

The page:

- loads audit entries
- shows who currently has exact-location grant candidates
- exposes revoke actions
- refreshes after a revoke

The route is registered in `src/app/App.tsx`.

### Map UI

`src/app/components/MapHome.tsx` now:

- loads profile and privacy settings together
- decrypts owner display tokens when available
- removes extra client approximation for server-issued display tokens
- keeps local-only approximation for browser geolocation before upload
- shows an owner-only Ghost Mode indicator
- passes owner radius-circle data to `MapView`
- passes animation hints and display mode metadata into markers

`src/app/components/MapView.tsx` now:

- supports marker animation hints: `NONE`, `FADE_LAST_MINUTE`, `SIGNAL_LOSS`, `REAPPEAR`
- renders owner Ghost radius circle as MapLibre layers
- guards optional MapLibre methods so fallback/test map objects do not crash

### Bottom Navigation

`src/app/components/BottomNav.tsx` was restored to support the desktop profile-preview behavior expected by the map shell:

- desktop profile icon opens the profile preview on map
- mobile still navigates to `/profile`
- active styling works when the profile preview is open

This was not part of Ghost Mode directly, but the tests showed the component had drifted from the surrounding map shell contract.

## Public API Privacy Invariants

The intended post-migration invariant for public map display APIs is:

- no raw `lat`
- no raw `lng`
- no `ghost_mode_enabled`
- no raw radius in map profile entries
- no policy internals in map profile entries
- display coordinates only inside encrypted display-location tokens
- decrypted coordinates are browser-memory only

Route tests were updated to assert tokenized response shapes and absence of raw location fields.

## Compatibility Notes

Some compatibility paths remain intentionally:

- `GET /api/users` has a legacy schema fallback for older profile schemas.
- privacy helpers can fall back to `user_privacy_settings` when encrypted policy tables are missing.
- profile visibility code still has legacy coordinate types because existing profile visibility logic supports location-aware field visibility.
- client adapters still return in-memory `lat/lng` to existing UI components after display-token decryption.

These are compatibility and migration aids, not the target public contract.

Developers adding new map/location display APIs should use `makeDisplayLocationToken` and should not expose raw coordinates in JSON.

## Verification

The required verification commands passed:

```bash
npm --prefix server test
npm --prefix server run build
corepack pnpm test
corepack pnpm build
"C:\\Program Files\\Git\\bin\\bash.exe" scripts/security-check.sh
```

Results from the final runs:

- server tests: 101 passed
- full project tests: 185 passed
- server TypeScript build passed
- frontend Vite production build passed
- security check passed

The Vite build still reports the existing large chunk warning. That is not introduced by the Ghost Mode API contract itself, but it remains a performance follow-up.

A local Vite smoke test was also run at:

```text
http://127.0.0.1:5174
```

The unauthenticated app shell loaded with no browser console errors. Authenticated map/settings behavior is covered by component and route tests because that local browser instance was not attached to a DB-backed API session.

## Tests Added or Updated

Backend:

- encrypted policy round trip
- encrypted location round trip
- no raw coordinate insert params for location storage
- display token encryption/decryption
- Ghost coordinate determinism, viewer uniqueness, epoch rotation, and radius bounds
- production config validation for new keys
- token-only discovery response shape
- token-only mutual map response shape
- location write returning display token metadata
- old "Ghost hides mutual map" behavior replaced with tokenized Ghost mutual-map behavior

Frontend:

- display-token adapters in `usersApi` and `cruushApi`
- Settings expanded privacy payload expectations
- MapHome no extra approximation for mutual map focus
- MapView radius-circle compatibility
- BottomNav profile-preview behavior restored

## Development Runbook

### Apply Migration Locally

```bash
npm --prefix server run migrate:dev
```

### Backfill Encrypted Location and Policies

```bash
npm --prefix server run location-privacy:backfill
```

Review the script options before using purge mode in any shared environment.

### Verify API Contract

For discovery:

```bash
GET /api/users?lat=40.7128&lng=-74.006
```

Expect:

- `data.mapEpochMs`
- `data.profiles[]`
- `displayLocationToken`
- no raw `lat/lng` in profile entries

For display keys:

```bash
GET /api/location/display-key
```

Expect a short-lived display key. The browser should not persist it.

For privacy settings:

```bash
GET /api/profiles/me/privacy-settings
GET /api/privacy/ghost-mode
```

Expect the public settings shape, not encrypted policy internals.

### Add a New Map Display Endpoint

Use this pattern:

1. Authenticate viewer.
2. Load target encrypted location envelope.
3. Load target encrypted visibility policy.
4. Resolve relationship permissions through `getRelationshipPermissions`.
5. Apply precedence.
6. Call `makeDisplayLocationToken`.
7. Return token metadata and approximate labels only.

Do not add raw location fields to the response.

## Important Files

Backend:

- `server/src/location-privacy.ts`
- `server/sql/020_ghost_mode_location_privacy.sql`
- `server/src/backfill-encrypted-location-privacy.ts`
- `server/src/routes/privacy.ts`
- `server/src/routes/users.ts`
- `server/src/routes/cruush.ts`
- `server/src/routes/profiles.ts`
- `server/src/match-relationships.ts`
- `server/src/config.ts`
- `server/.env.example`

Frontend:

- `src/app/lib/displayLocationTokens.ts`
- `src/app/lib/privacyApi.ts`
- `src/app/lib/usersApi.ts`
- `src/app/lib/cruushApi.ts`
- `src/app/components/Settings.tsx`
- `src/app/components/PrivacyAudit.tsx`
- `src/app/components/MapHome.tsx`
- `src/app/components/MapView.tsx`
- `src/app/App.tsx`

Tests:

- `server/src/location-privacy.test.ts`
- `server/src/app.test.ts`
- `server/src/config.test.ts`
- `src/app/components/Settings.test.tsx`
- `src/app/components/MapHome.test.tsx`
- `src/app/components/MapView.test.tsx`

## Known Follow-Ups

1. Replace local class-key derivation with production KMS integration.
2. Add full E2EE option for future location-sharing modes.
3. Add real-time token refresh or websocket push for live map sessions.
4. Build the premium Stealth product surface if/when product wants it.
5. Add richer audit-event types beyond revoke decisions.
6. Add abuse/risk tooling for suspicious location polling patterns.
7. Split frontend bundles to address the Vite large chunk warning.
8. After production backfill validation, purge legacy plaintext coordinate columns if policy permits.
9. Consider replacing compatibility fallbacks once all environments are migrated.

## Security Notes

- Display tokens are short lived and encrypted.
- Display keys are browser-session scoped and held in memory by the client.
- Ghost coordinates are deterministic only inside an epoch and per viewer.
- Database lookup uses blind indexes where queryability is required.
- Relationship-derived precision depends on encrypted relationship records and active encrypted match tokens.
- Revocation is checked server-side during permission resolution.
- Client-side coordinate values still exist in memory after token decryption because MapLibre needs coordinates to render pins.

The main developer rule is simple: public map APIs should issue display tokens, not coordinates.
