# Beta Launch And Party Access Codeveloper Handoff

**Goal:** make cruush ready for invite beta and the warehouse-party launch without requiring the founder to restate the next tasks.

**Branch:** `codex/beta-launch-codeveloper-handoff`

**Base inspected:** `origin/main` at `39dbada`

**Architecture:** keep the current Fastify/Vite/Postgres architecture. Add additive migrations, session-backed APIs, and mobile-first UI on top of the existing map, profile, media, messaging, moderation, and privacy foundations. Treat the party flow as an event membership system: the door code proves physical attendance once, and the app keeps durable access after the person leaves the venue radius.

**Tech stack:** React, Vite, TypeScript, Tailwind/Radix UI, MapLibre GL, Fastify, Zod, Postgres SQL migrations, existing encrypted media/message helpers, existing Vitest test setup.

**Estimated time:** 64 tasks x 5 minutes = 320 minutes of focused implementation, plus manual staging smoke.

---

## Non-Negotiables

- Keep the product name `cruush`, lowercase.
- Do not add fake accounts, fake messages, fake profiles, fake DMs, fake groups, fake payment data, or fake bank/reviewer content to any bank-facing or beta-facing smoke path.
- Do not put backend secrets in frontend `VITE_*` variables.
- Do not make encrypted media buckets public.
- Do not claim end-to-end encryption, real identity verification, or physical safety guarantees.
- Do not solve NSFW blur with CSS-only blur over original media bytes. The backend must return a safe blurred variant, or hide the media.
- Do not make the party code a security claim called account 2FA. Product copy should call it a door code or party code. The concept is 2FA-like only for event attendance.
- Staff/admin party tools must use session-backed roles. No shared frontend secret, no hardcoded staff passcode in browser code.
- The Chocolate Factory launch event must be configured as data. Do not bury venue coordinates, times, or staff membership in component code.

---

## Current Source Snapshot

Use this as the starting point when implementing.

- `src/app/App.tsx` already routes `/map`, `/feed`, `/profile`, `/profile/edit`, `/events/:eventId`, `/chat/group/:chatId`, `/settings`, `/admin/moderation`, and related signed-in surfaces.
- `src/app/components/EventDetail.tsx` is still mock-only and must be replaced with API-backed event/party data.
- `src/app/components/MapView.tsx` renders one React DOM `maplibregl.Marker` per person. That is not acceptable for 500-600 people in one venue.
- `src/app/lib/mapMarkers.ts` only models person markers. It needs event and dense-cluster marker types.
- `src/app/lib/usersApi.ts` and `server/src/routes/users.ts` already provide nearby discovery and enforce blocks/location privacy. Suggested nearby should extend or wrap this logic, not bypass it.
- `server/src/migrate.ts` currently registers migrations through `040_severe_access_bans.sql`. Append new migrations after `040`.
- `server/sql/037_media_asset_foundation.sql` already adds `media_objects.explicit_classification`, `media_variants`, and media status foundations. NSFW blur still needs viewer preference, blurred variants, and frontend handling.
- Block APIs and UI exist. Keep every new discovery, suggestion, event, feed, chat, and profile path block-aware.
- Moderator review exists at `/admin/moderation`. Staff party-code tools can reuse the session-backed role pattern, but should not reuse internal-secret routes.
- Auth signup currently accepts `{ email, password, displayName, captchaToken }`. It still needs invite/adult-content confirmation payloads.

---

## Beta Definition Of Done

The beta build is not ready until all of these are true:

- DL Mode exists as a discreet privacy preset in Settings and is enforced by backend discovery/suggestion/profile serialization.
- NSFW/explicit photos are blurred by default across map pins, trays, suggestions, profiles, feed, messages, groups, and party surfaces.
- Users can opt in to showing explicit photos from Settings > Content Preferences.
- Users can mark uploaded photos as explicit/NSFW, and the server records and serves the right variant.
- Suggested nearby profiles show real users only and respect blocks, account status, privacy, DL Mode, location visibility, explicit-content preference, and entitlement limits.
- The Chocolate Factory party appears as a warehouse event pin on the map during the configured window.
- Tapping the warehouse pin opens a 6-digit party-code prompt when the viewer is not a member.
- Door staff have a staff-only page that generates short-lived one-time 6-digit codes.
- Redeeming a valid code grants durable party membership.
- Party members can access the party chat and party feed after leaving the venue radius.
- Wrong, expired, reused, or brute-forced codes fail with generic errors and rate limits.
- 500-600 people in the venue do not make the map unusable: zoomed out uses a cluster/party count, zoomed in uses deterministic offsets/spiderfy plus a list fallback so every heart pin remains reachable.
- Event, party, map, settings, profile, feed, and chat UI look beta-ready on 390x844 mobile and 1440x900 desktop.
- Focused and full verification commands pass, or any non-pass is documented with owner and blocker.

---

## Product Defaults

Use these defaults unless Julien gives a newer explicit decision.

### DL Mode

DL Mode means a discreet privacy preset. It is not an identity label and not a community filter.

When enabled:

- Store `dl_mode_enabled = true` on the user's privacy/content settings.
- Keep the user able to use the map and messages.
- Default explicit media viewing to off unless the user later explicitly opts in.
- Exclude the user from `Suggested nearby` unless the viewer has a mutual cruush or explicit message permission.
- Round public last-active copy to coarse labels such as `Recently active`; do not expose minute-level recency to non-mutual viewers.
- Hide sensitive profile sections from non-mutual viewers using existing visibility/encryption helpers.
- Preserve Ghost Mode as the location-specific control. DL Mode may recommend Ghost Mode in UI, but must not silently rewrite exact-location settings.

### NSFW Blur

Default state: explicit photos hidden or blurred for everyone.

Viewer opt-in: `Show Explicit Photos` under Settings > Content Preferences.

Backend rule: if viewer opt-in is false, return a blurred safe variant for explicit media. If no blurred variant exists, return no photo URL for that surface.

### Suggested Nearby Profiles

Suggested nearby is a compact, real-profile discovery rail. It should be more curated than raw map pins but must use the same privacy and block rules.

Default ranking:

1. Active recently.
2. Near the viewer's display location.
3. Has compatible looking-for/vibes/crowds when available.
4. Not already blocked either direction.
5. Not the signed-in user.
6. Not DL Mode unless mutual cruush or allowed by explicit relationship context.

### Party Door Codes

Codes are one-time, 6-digit, numeric, short-lived, and generated by staff at the door.

Default TTL: 10 minutes.

Default redemption limit: one user per code.

Default retry limit: 5 failed attempts per user per event per 15 minutes, plus IP/device rate limit.

Code storage: store only an HMAC/hash, never plaintext after generation response.

Access grant: write `event_memberships` with `joined_at`, `source = 'door_code'`, and `retained_after_radius_exit = true`.

### The Chocolate Factory Event

Create one launch event record with:

- `slug = 'the-chocolate-factory-warehouse-party'`
- `event_kind = 'warehouse_party'`
- `name = 'The Chocolate Factory'`
- `venue_name = 'The Chocolate Factory'`
- `map_pin_kind = 'warehouse'`
- `chat_enabled = true`
- `feed_enabled = true`
- `starts_at = '2026-07-31T00:00:00-04:00'`
- `ends_at = '2026-08-01T05:00:00-04:00'`
- `chat_expires_at = '2026-08-07T03:59:00-04:00'`

Production coordinates, radius, event window, and staff users must come from seed/config data. Local dev may use documented placeholder coordinates only if the event is not marked production-active.

---

## Implementation Plan

### Task 1: Lock The Starting Point

**Files:**
- Read: `package.json`
- Read: `server/package.json`
- Read: `server/src/migrate.ts`
- Read: `docs/design-master.md`
- Read: `docs/master-architecture.md`

**Steps:**

1. Run:

   ```bash
   git status --short --branch
   git rev-parse --short HEAD
   pnpm --version
   node --version
   ```

2. Confirm Node is `>=22.12.0`.
3. Confirm the branch is not carrying unrelated dirty files before code work starts.
4. Commit only intentional work after each feature slice.

**Acceptance:**

- Developer records branch name, HEAD, Node version, and package manager version in the PR description.

---

### Task 2: Add Beta Settings Schema

**Files:**
- Create: `server/sql/041_beta_content_privacy_settings.sql`
- Modify: `server/src/migrate.ts`
- Test: `server/src/migrate.test.ts`

**Schema:**

```sql
create table if not exists user_content_preferences (
  user_id uuid primary key references app_users(id) on delete cascade,
  show_explicit_media boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app_users
  add column if not exists dl_mode_enabled boolean not null default false;

alter table app_users
  add column if not exists adult_content_confirmed_at timestamptz;

alter table app_users
  add column if not exists invite_code_used text;

create index if not exists idx_app_users_dl_mode_enabled
  on app_users (dl_mode_enabled)
  where dl_mode_enabled = true;
```

**Steps:**

1. Add the migration.
2. Append `"041_beta_content_privacy_settings.sql"` after `040_severe_access_bans.sql` in `server/src/migrate.ts`.
3. Update migration-order tests if snapshots exist.

**Verify:**

```bash
pnpm --dir server test -- src/migrate.test.ts
```

Expected: migration-order tests pass and include `041_beta_content_privacy_settings.sql`.

---

### Task 3: Add Content Preferences API

**Files:**
- Create: `server/src/content-preferences.ts`
- Create: `server/src/routes/content-preferences.ts`
- Modify: `server/src/app.ts`
- Test: `server/src/content-preferences-routes.test.ts`

**API:**

- `GET /api/users/me/content-preferences`
- `PUT /api/users/me/content-preferences`

**Payload:**

```ts
type ContentPreferences = {
  showExplicitMedia: boolean;
};
```

**Behavior:**

- Auth required.
- Account must be active enough for settings writes.
- Missing row returns `{ showExplicitMedia: false }`.
- PUT upserts the row.
- When DL Mode is enabled for the first time, keep `showExplicitMedia` false unless the user explicitly changes it later.

**Verify:**

```bash
pnpm --dir server test -- src/content-preferences-routes.test.ts
```

Expected: default false, upsert true, upsert false, unauthenticated rejection, suspended/deleted write rejection.

---

### Task 4: Add DL Mode API

**Files:**
- Create: `server/src/routes/privacy-mode.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/routes/profiles.ts`
- Modify: `server/src/routes/users.ts`
- Test: `server/src/privacy-mode-routes.test.ts`
- Test: `server/src/users-discovery-dl-mode.test.ts`

**API:**

- `GET /api/users/me/privacy-mode`
- `PUT /api/users/me/privacy-mode`

**Payload:**

```ts
type PrivacyModePayload = {
  dlModeEnabled: boolean;
};
```

**Behavior:**

- Store on `app_users.dl_mode_enabled`.
- Discovery/profile serializers must receive viewer relationship context.
- Non-mutual viewers get coarse last-active and hidden sensitive sections for DL users.
- Suggested nearby excludes DL users unless relationship context allows it.
- Do not silently enable/disable Ghost Mode.

**Verify:**

```bash
pnpm --dir server test -- src/privacy-mode-routes.test.ts src/users-discovery-dl-mode.test.ts
```

Expected: DL can be toggled, is returned to owner, is not exposed as a public identity label, and changes discovery/suggestion visibility.

---

### Task 5: Wire Settings UI For DL And Explicit Content

**Files:**
- Create: `src/app/lib/contentPreferencesApi.ts`
- Create: `src/app/lib/privacyModeApi.ts`
- Modify: `src/app/components/Settings.tsx`
- Test: `src/app/lib/contentPreferencesApi.test.ts`
- Test: `src/app/lib/privacyModeApi.test.ts`
- Test: `src/app/components/Settings.test.tsx`

**UI:**

- Add Settings section `Content Preferences`.
- Add switch `Show Explicit Photos`.
- Add Settings section item or inline switch `DL Mode`.
- Use existing `Switch`, `Button`, `toast`, and card language.
- Keep labels short. Do not add instructional paragraphs.

**Acceptance:**

- Toggling either setting persists to the API.
- Failed save rolls back visual state or clearly shows failure.
- DL Mode copy says it makes the account more discreet; it must not promise invisibility.

**Verify:**

```bash
pnpm test src/app/lib/contentPreferencesApi.test.ts src/app/lib/privacyModeApi.test.ts src/app/components/Settings.test.tsx
```

---

### Task 6: Add Blurred Media Variant Generation

**Files:**
- Modify: `server/src/media-image.ts`
- Modify: `server/src/media-assets.ts`
- Modify: `server/sql/041_beta_content_privacy_settings.sql` or create `042_media_blurred_variants.sql` if Task 2 is already merged
- Test: `server/src/media-image.test.ts`
- Test: `server/src/media-assets.test.ts`

**Backend rule:**

- Generate `thumbnail`, `display`, and `blurred` WebP variants for uploaded photos.
- `blurred` should be small, intentionally blurred, stripped of metadata, and safe for default explicit surfaces.
- If variant enum/check constraints exist, add `blurred` additively.

**Acceptance:**

- Explicit media has a blurred variant before the asset can be published.
- Failed blurred-variant generation fails closed and cleans up temporary objects.
- Existing non-explicit media continues returning normal display/thumbnail variants.

**Verify:**

```bash
pnpm --dir server test -- src/media-image.test.ts src/media-assets.test.ts
```

---

### Task 7: Enforce Viewer-Safe Media URLs

**Files:**
- Create: `server/src/viewer-media-policy.ts`
- Modify: `server/src/routes/media.ts`
- Modify: `server/src/routes/users.ts`
- Modify: `server/src/routes/profiles.ts`
- Modify: `server/src/routes/posts.ts`
- Modify: `server/src/routes/messages.ts`
- Test: `server/src/viewer-media-policy.test.ts`
- Test: `server/src/media-routes-explicit.test.ts`

**Policy helper:**

```ts
type ViewerMediaPolicyInput = {
  explicitClassification: 'unknown' | 'non_explicit' | 'explicit' | 'uncertain';
  showExplicitMedia: boolean;
  requestedVariant: 'thumbnail' | 'display';
  hasBlurredVariant: boolean;
};

type ViewerMediaVariantDecision =
  | { kind: 'serve'; variant: 'thumbnail' | 'display' | 'blurred'; blurred: boolean }
  | { kind: 'hide'; blurred: true };
```

**Rules:**

- Non-explicit media serves requested variant.
- Explicit/uncertain media serves `blurred` unless viewer has opted in.
- If no blurred variant exists and viewer did not opt in, hide.
- Do not leak explicit original URLs in API JSON for opted-out viewers.

**Verify:**

```bash
pnpm --dir server test -- src/viewer-media-policy.test.ts src/media-routes-explicit.test.ts
```

---

### Task 8: Mark Photos Explicit At Upload/Edit Time

**Files:**
- Modify: `src/app/components/ProfileEdit.tsx`
- Modify: `src/app/lib/profileApi.ts`
- Modify: `server/src/routes/media.ts`
- Modify: `server/src/routes/profiles.ts`
- Test: `src/app/components/ProfileEdit.test.tsx`
- Test: `server/src/profile-photo-stream-automod-routes.test.ts`

**UI:**

- Add a per-photo toggle: `Explicit`.
- Add a required upload confirmation: user owns rights/consent and is allowed to upload adult content.
- Keep current profile-photo eligibility guidance.

**Backend:**

- Accept `explicit: boolean` as upload metadata.
- Store `explicit_classification = 'explicit'` when user marks explicit and moderation does not reject.
- Moderation/provider can still reject illegal or prohibited content.
- Consensual adult nudity is not auto-rejected solely because it is explicit.

**Verify:**

```bash
pnpm test src/app/components/ProfileEdit.test.tsx
pnpm --dir server test -- src/profile-photo-stream-automod-routes.test.ts
```

---

### Task 9: Make HeartPhoto NSFW-Aware

**Files:**
- Modify: `src/app/components/HeartPhoto.tsx`
- Modify: `src/app/components/MapView.tsx`
- Modify: `src/app/components/MapHome.tsx`
- Modify: `src/app/components/CruiseCarouselSlot.tsx`
- Modify: `src/app/components/ProfileView.tsx`
- Modify: `src/app/components/LocalFeed.tsx`
- Modify: `src/app/components/PrivateGroupChat.tsx`
- Test: corresponding component tests

**Props to add:**

```ts
type HeartPhotoProps = {
  sensitive?: boolean;
  blurred?: boolean;
  explicitHidden?: boolean;
};
```

**Behavior:**

- If backend returns a blurred variant URL, render it plus an eye-slash/lock overlay.
- If backend hides the photo, render the heart fallback plus an explicit-hidden overlay.
- Tapping blurred media opens a short prompt with a Settings shortcut. It must not fetch original media unless the viewer opts in first.

**Verify:**

```bash
pnpm test src/app/components/HeartPhoto.test.tsx src/app/components/MapView.test.tsx src/app/components/ProfileView.test.tsx src/app/components/LocalFeed.test.tsx src/app/components/PrivateGroupChat.test.tsx
```

---

### Task 10: Add Signup Adult Confirmation And Invite Gate

**Files:**
- Modify: `src/app/components/Auth.tsx`
- Modify: `src/app/lib/authApi.ts`
- Modify: `server/src/auth-schema.ts`
- Modify: `server/src/routes/auth.ts`
- Create: `server/sql/042_beta_invites.sql` if not combined into Task 2
- Test: `src/app/components/Auth.test.tsx`
- Test: `server/src/auth-routes-signup.test.ts`

**Payload:**

```ts
type SignUpPayload = {
  email: string;
  password: string;
  displayName: string;
  captchaToken?: string;
  inviteCode?: string;
  adultContentConfirmed: true;
};
```

**Invite behavior:**

- Config flag: `BETA_INVITE_REQUIRED=true|false`, backend-only.
- If required, signup rejects missing/invalid/used invite codes.
- Store only normalized invite code metadata; do not expose full invite lists to frontend.

**Adult confirmation behavior:**

- Signup requires a checkbox confirming the user is 18+ and allowed to view/upload adult content.
- Store `adult_content_confirmed_at`.
- Onboarding complete DOB validation still remains the stronger app-internal age gate.

**Verify:**

```bash
pnpm test src/app/components/Auth.test.tsx
pnpm --dir server test -- src/auth-routes-signup.test.ts src/config.test.ts
```

---

### Task 11: Add Suggested Nearby API

**Files:**
- Create: `server/src/routes/suggestions.ts`
- Modify: `server/src/app.ts`
- Reuse: `server/src/routes/users.ts`
- Reuse: `server/src/user-blocks.ts`
- Test: `server/src/suggestions-routes.test.ts`

**API:**

- `GET /api/suggestions/nearby?lat=...&lng=...&limit=12`

**Response:**

```ts
type NearbySuggestion = {
  profileToken: string;
  displayName: string;
  age: number | null;
  distanceLabel: string;
  lastActiveLabel: string;
  photo: {
    url: string | null;
    blurred: boolean;
    explicitHidden: boolean;
  };
  lookingFor: string[];
  vibes: string[];
  relationship: {
    mutualCruush: boolean;
    canMessage: boolean;
  };
};
```

**Rules:**

- Use real profiles only.
- Exclude blocked relationships both directions.
- Exclude inactive, suspended, deleted, or under-review accounts where active account policy requires it.
- Respect Ghost/location display tokens and profile visibility.
- Respect content preference and DL Mode.
- Cap limit at 12 for beta.

**Verify:**

```bash
pnpm --dir server test -- src/suggestions-routes.test.ts
```

---

### Task 12: Add Suggested Nearby Frontend Rail

**Files:**
- Create: `src/app/lib/suggestionsApi.ts`
- Create: `src/app/components/SuggestedNearbyRail.tsx`
- Modify: `src/app/components/MapHome.tsx`
- Test: `src/app/lib/suggestionsApi.test.ts`
- Test: `src/app/components/SuggestedNearbyRail.test.tsx`
- Test: `src/app/components/MapHome.test.tsx`

**UI placement:**

- Mobile: compact rail above or integrated with the current bottom tray, without blocking the map.
- Desktop: right-side or bottom panel near current map chrome, consistent with existing mini-profile popup.
- Use heart photos and last-active badges.
- Tapping opens full profile on mobile and mini-profile popup on desktop, matching current map behavior.

**Acceptance:**

- Loading, empty, error, and populated states exist.
- Blocked users disappear immediately after a block action.
- Explicit media appears blurred/hidden according to viewer preference.

**Verify:**

```bash
pnpm test src/app/lib/suggestionsApi.test.ts src/app/components/SuggestedNearbyRail.test.tsx src/app/components/MapHome.test.tsx
```

---

### Task 13: Add Event And Party Schema

**Files:**
- Create: `server/sql/043_events_party_access.sql`
- Modify: `server/src/migrate.ts`
- Test: `server/src/migrate.test.ts`

**Schema:**

```sql
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  event_kind text not null check (event_kind in ('warehouse_party', 'standard')),
  name text not null,
  venue_name text not null,
  venue_address text,
  latitude double precision not null,
  longitude double precision not null,
  radius_meters integer not null default 120,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  map_pin_kind text not null default 'warehouse',
  chat_enabled boolean not null default true,
  feed_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists event_staff (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role text not null check (role in ('owner', 'door_staff')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists event_door_codes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  code_hash text not null,
  generated_by_user_id uuid not null references app_users(id),
  expires_at timestamptz not null,
  redeemed_by_user_id uuid references app_users(id),
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, code_hash)
);

create table if not exists event_memberships (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  source text not null check (source in ('door_code', 'staff_grant')),
  joined_at timestamptz not null default now(),
  retained_after_radius_exit boolean not null default true,
  primary key (event_id, user_id)
);
```

**Notes:**

- Add indexes for `events(starts_at, ends_at)`, `event_door_codes(event_id, expires_at)`, `event_memberships(user_id, joined_at desc)`.
- If adding party feed posts, create `event_feed_posts` in this migration or the next one.

**Verify:**

```bash
pnpm --dir server test -- src/migrate.test.ts
```

---

### Task 14: Add Event API

**Files:**
- Create: `server/src/routes/events.ts`
- Modify: `server/src/app.ts`
- Test: `server/src/events-routes.test.ts`

**API:**

- `GET /api/events/active`
- `GET /api/events/:eventId`
- `GET /api/events/:eventId/membership`

**Behavior:**

- `active` returns active map events for the viewer.
- Event detail returns membership state and chat/feed availability.
- Do not expose staff lists or door-code data to normal users.
- Event detail for inactive past events remains visible to members.

**Verify:**

```bash
pnpm --dir server test -- src/events-routes.test.ts
```

---

### Task 15: Add Door Staff Code API

**Files:**
- Modify: `server/src/routes/events.ts`
- Create: `server/src/event-codes.ts`
- Test: `server/src/event-codes.test.ts`
- Test: `server/src/event-staff-routes.test.ts`

**API:**

- `POST /api/events/:eventId/door-codes`

**Request:** empty body.

**Response:**

```ts
type DoorCodeResponse = {
  code: string;
  expiresAt: string;
};
```

**Rules:**

- Auth required.
- User must be `event_staff.role in ('owner', 'door_staff')`.
- Code is 6 numeric digits, zero-padded if needed.
- Store HMAC/hash only.
- Return plaintext only once, in the generation response.
- Audit generator user ID, event ID, and timestamp.

**Verify:**

```bash
pnpm --dir server test -- src/event-codes.test.ts src/event-staff-routes.test.ts
```

---

### Task 16: Add Party Code Redemption API

**Files:**
- Modify: `server/src/routes/events.ts`
- Create: `server/src/event-memberships.ts`
- Test: `server/src/event-redemption-routes.test.ts`

**API:**

- `POST /api/events/:eventId/redeem-code`

**Payload:**

```ts
type RedeemPartyCodePayload = {
  code: string;
};
```

**Response:**

```ts
type RedeemPartyCodeResponse = {
  membership: {
    eventId: string;
    joinedAt: string;
    retainedAfterRadiusExit: true;
  };
  chatConversationId: string | null;
};
```

**Rules:**

- Auth required.
- Code must be exactly 6 digits.
- One-time use.
- Expired codes fail.
- Reused codes fail generically.
- Successful redemption writes durable `event_memberships`.
- Do not remove membership when location changes.
- Add the user to the party group conversation if chat is enabled.

**Verify:**

```bash
pnpm --dir server test -- src/event-redemption-routes.test.ts
```

---

### Task 17: Reuse Group Chat For Party Chat

**Files:**
- Modify: `server/sql/043_events_party_access.sql` or create `044_event_chat_feed.sql`
- Modify: `server/src/routes/events.ts`
- Reuse: `server/src/routes/messages.ts`
- Reuse: `src/app/components/PrivateGroupChat.tsx`
- Test: `server/src/event-chat-routes.test.ts`

**Implementation:**

- Add `events.chat_conversation_id uuid references conversations(id)`.
- When creating/seeding The Chocolate Factory event, create one `conversations.kind = 'group'` row titled with the event name.
- On successful code redemption, add the user to `conversation_members`.
- Keep group message permissions and blocks intact.

**Acceptance:**

- Party chat route is `/chat/group/:conversationId`.
- Non-members cannot infer or join the chat by guessing the conversation ID.
- Members keep chat access after leaving the geofence.

**Verify:**

```bash
pnpm --dir server test -- src/event-chat-routes.test.ts src/messages-routes.test.ts
```

---

### Task 18: Add Party Feed

**Files:**
- Create: `server/sql/044_event_feed_posts.sql` if not included earlier
- Modify: `server/src/routes/events.ts`
- Create: `src/app/lib/eventsApi.ts`
- Create: `src/app/components/EventFeed.tsx`
- Test: `server/src/event-feed-routes.test.ts`
- Test: `src/app/components/EventFeed.test.tsx`

**API:**

- `GET /api/events/:eventId/feed`
- `POST /api/events/:eventId/feed`

**Rules:**

- Only event members can read or post.
- Feed text uses existing public/profile moderation strictness, not DM looseness.
- Feed media uses explicit-content viewer gating.
- Blocked authors are hidden from the viewer.

**Acceptance:**

- Party surface has tabs: `Feed` and `Chat`.
- Empty state exists.
- Posting failure shows a generic retryable error.

**Verify:**

```bash
pnpm --dir server test -- src/event-feed-routes.test.ts
pnpm test src/app/components/EventFeed.test.tsx
```

---

### Task 19: Replace Mock Event Detail

**Files:**
- Modify: `src/app/components/EventDetail.tsx`
- Create/modify: `src/app/lib/eventsApi.ts`
- Test: `src/app/components/EventDetail.test.tsx`

**Behavior:**

- Load event by `eventId`.
- Show The Chocolate Factory party data from API.
- If not a member and the event requires a code, show code prompt.
- If member, show Feed/Chat access.
- If chat enabled and `chatConversationId` exists, show a clear chat entry button.
- Remove hardcoded `Queer Dance Party`, `The Rainbow Club`, and fake attendee count.

**Verify:**

```bash
pnpm test src/app/components/EventDetail.test.tsx
```

---

### Task 20: Add Party Access Dialog

**Files:**
- Create: `src/app/components/PartyAccessDialog.tsx`
- Modify: `src/app/components/MapHome.tsx`
- Modify: `src/app/components/EventDetail.tsx`
- Test: `src/app/components/PartyAccessDialog.test.tsx`

**UI:**

- Use `input-otp` or existing `src/app/components/ui/input-otp.tsx`.
- 6 slots, numeric only.
- Submit button disabled until 6 digits are present.
- Generic failure copy: `Code not available. Try again at the door.`
- Success routes to event detail or chat/feed surface.

**Verify:**

```bash
pnpm test src/app/components/PartyAccessDialog.test.tsx
```

---

### Task 21: Add Staff Door Page

**Files:**
- Create: `src/app/components/EventDoorStaff.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/lib/eventsApi.ts`
- Test: `src/app/components/EventDoorStaff.test.tsx`

**Route:**

- `/events/:eventId/door`

**UI:**

- Staff-only.
- Button: `Generate code`.
- Large 6-digit display.
- Countdown to expiry.
- Generate-again button after code is used or expired.
- No list of prior codes.

**Acceptance:**

- Non-staff sees not found or forbidden state.
- Staff can generate code.
- Refresh does not recover plaintext old code.

**Verify:**

```bash
pnpm test src/app/components/EventDoorStaff.test.tsx
```

---

### Task 22: Add Event Marker Types

**Files:**
- Modify: `src/app/lib/mapMarkers.ts`
- Modify: `src/app/components/MapView.tsx`
- Modify: `src/app/components/MapHome.tsx`
- Test: `src/app/components/MapView.test.tsx`
- Test: `src/app/components/MapHome.test.tsx`

**Types:**

```ts
type PersonMapMarker = {
  kind: 'person';
  id: string;
  displayName: string;
  approximateLatitude: number;
  approximateLongitude: number;
  photo?: string | null;
};

type EventMapMarker = {
  kind: 'event';
  id: string;
  eventKind: 'warehouse_party';
  name: string;
  venueName: string;
  approximateLatitude: number;
  approximateLongitude: number;
  attendeeCount: number;
  requiresCode: boolean;
  member: boolean;
  animation: 'warehouse_pulse';
};
```

**Acceptance:**

- Person pins keep existing behavior.
- Event pin is visually distinct and still heart/brand-compatible.
- Tapping party pin opens `PartyAccessDialog` for non-members and event detail for members.

**Verify:**

```bash
pnpm test src/app/components/MapView.test.tsx src/app/components/MapHome.test.tsx
```

---

### Task 23: Add Temporary Warehouse Icon Component

**Files:**
- Create: `src/app/components/WarehousePartyPin.tsx`
- Modify: `src/app/components/MapView.tsx`
- Test: `src/app/components/WarehousePartyPin.test.tsx`

**Behavior:**

- Animated warehouse-style marker placeholder until final asset exists.
- Must be accessible with `aria-label`.
- Do not pretend the final designed asset is complete.
- Keep animation restrained and performant.
- Respect reduced motion.

**Acceptance:**

- The component can later swap to a final designer-provided SVG/PNG without changing event access logic.

**Verify:**

```bash
pnpm test src/app/components/WarehousePartyPin.test.tsx
```

---

### Task 24: Replace Dense Venue DOM Markers With A Map Layer Strategy

**Files:**
- Create: `src/app/lib/denseVenueMarkers.ts`
- Modify: `src/app/components/MapView.tsx`
- Test: `src/app/lib/denseVenueMarkers.test.ts`
- Test: `src/app/components/MapView.test.tsx`

**Problem:**

500-600 people can stand in one venue. One DOM marker per person at identical coordinates is not usable and can hurt performance.

**Solution:**

- Use a GeoJSON source/layer for dense venue participants.
- Low zoom: show one party cluster with count.
- Mid zoom: show grouped count bubbles by deterministic cell.
- High zoom: spiderfy/offset participant hearts around the venue center.
- Always provide a bottom-sheet/list fallback from the cluster so every attendee is accessible.

**Offset algorithm:**

- Use `map.project()` to convert venue center to pixels.
- Assign each user a deterministic index from a stable hash of user ID.
- Place users on rings around the center:
  - ring 0: 1 marker
  - ring 1: 8 markers
  - ring 2: 16 markers
  - ring 3+: add capacity by circumference
- Pixel radius starts at 28px and grows by 18px per ring.
- Convert final pixel back with `map.unproject()`.
- Do not write offset coordinates back to the server.

**Acceptance:**

- At 600 participants, map remains interactive.
- No participant is permanently hidden behind another pin.
- Exact venue attendee GPS is not leaked through offsets.

**Verify:**

```bash
pnpm test src/app/lib/denseVenueMarkers.test.ts src/app/components/MapView.test.tsx
```

---

### Task 25: Add Party Attendee Map Payload

**Files:**
- Modify: `server/src/routes/events.ts`
- Create: `server/src/event-attendees.ts`
- Test: `server/src/event-attendees.test.ts`

**API:**

- `GET /api/events/:eventId/attendees/map`

**Rules:**

- Event members can see member attendee map data.
- Non-members see only event count, not attendee identities.
- Apply blocks both directions.
- Apply DL Mode rules: DL users appear in cluster counts but are not individually suggested/listed to non-mutual viewers unless policy allows.
- Return display-safe photo URLs.

**Verify:**

```bash
pnpm --dir server test -- src/event-attendees.test.ts
```

---

### Task 26: Add Event Data To MapHome

**Files:**
- Modify: `src/app/components/MapHome.tsx`
- Modify: `src/app/lib/eventsApi.ts`
- Test: `src/app/components/MapHome.test.tsx`

**Behavior:**

- Load `/api/events/active` alongside nearby users.
- Add The Chocolate Factory marker to marker list.
- Do not block map rendering if event API fails; show people and omit event with a logged nonfatal error.
- Event pin click behavior:
  - non-member: open `PartyAccessDialog`
  - member: navigate to `/events/:eventId`

**Verify:**

```bash
pnpm test src/app/components/MapHome.test.tsx
```

---

### Task 27: UI Redesign Pass For Beta Launch

**Files to audit and polish:**
- `src/app/components/Auth.tsx`
- `src/app/components/ProfileOnboarding.tsx`
- `src/app/components/MapHome.tsx`
- `src/app/components/MapView.tsx`
- `src/app/components/LocalFeed.tsx`
- `src/app/components/ProfileView.tsx`
- `src/app/components/ProfileEdit.tsx`
- `src/app/components/DirectMessages.tsx`
- `src/app/components/PrivateGroupChat.tsx`
- `src/app/components/EventDetail.tsx`
- `src/app/components/Settings.tsx`
- `src/app/components/BottomNav.tsx`

**Rules:**

- Mobile web first: verify 390x844.
- Desktop must still be intentional: verify 1440x900.
- Keep map-first experience; do not add a marketing/landing surface inside the app.
- Use dense but organized app UI, not oversized hero sections.
- Avoid nested cards and decorative gradient blobs.
- Keep controls out of safe-area/browser chrome zones.
- Maintain minimum 44x44 touch targets.
- Keep text inside buttons/cards from wrapping badly or overlapping.
- Use lucide icons or existing `CruushIcon` for controls.
- Keep brand gradient accents selective; do not turn whole pages into one-note purple/blue gradients.

**Acceptance:**

- Auth, map, party code, settings, profile, feed, chat, and event screens look ready for beta screenshots.
- Empty/error/loading states are present and not mocky.
- No visible fake production content remains in event surfaces.

**Verify:**

```bash
pnpm test
pnpm run build
```

Manual responsive pass required after build.

---

### Task 28: Add Staging Seed For The Chocolate Factory Event

**Files:**
- Create: `server/src/seed-launch-events.ts`
- Modify: `server/package.json`
- Document: `docs/open-beta-infrastructure-readiness.md`
- Test: `server/src/seed-launch-events.test.ts`

**Command:**

```bash
pnpm --dir server run seed:launch-events
```

**Config:**

- `LAUNCH_PARTY_ENABLED`
- `LAUNCH_PARTY_SLUG`
- `LAUNCH_PARTY_NAME`
- `LAUNCH_PARTY_VENUE_NAME`
- `LAUNCH_PARTY_VENUE_ADDRESS`
- `LAUNCH_PARTY_LATITUDE`
- `LAUNCH_PARTY_LONGITUDE`
- `LAUNCH_PARTY_RADIUS_METERS`
- `LAUNCH_PARTY_STARTS_AT`
- `LAUNCH_PARTY_ENDS_AT`
- `LAUNCH_PARTY_STAFF_EMAILS`

**Acceptance:**

- If production flag is true and coordinates/times/staff are missing, seed fails closed.
- Staff users must already exist and be verified.
- Seed is idempotent by slug.

**Verify:**

```bash
pnpm --dir server test -- src/seed-launch-events.test.ts src/config.test.ts
```

---

### Task 29: Add Operational Audit Events

**Files:**
- Create: `server/sql/045_event_audit_events.sql`
- Modify: `server/src/event-codes.ts`
- Modify: `server/src/routes/events.ts`
- Test: `server/src/event-audit-events.test.ts`

**Events to write:**

- door code generated
- door code redeemed
- failed redemption, with no plaintext code stored
- membership granted
- staff authorization failure

**Acceptance:**

- Audit rows never store plaintext 6-digit codes.
- Logs never include code hashes, plaintext codes, or full sensitive request body.

**Verify:**

```bash
pnpm --dir server test -- src/event-audit-events.test.ts
```

---

### Task 30: Final Verification

Run the focused suites first:

```bash
pnpm --dir server test -- src/migrate.test.ts src/content-preferences-routes.test.ts src/privacy-mode-routes.test.ts src/suggestions-routes.test.ts src/events-routes.test.ts src/event-codes.test.ts src/event-redemption-routes.test.ts src/event-feed-routes.test.ts src/event-attendees.test.ts
pnpm test src/app/components/Settings.test.tsx src/app/components/MapHome.test.tsx src/app/components/MapView.test.tsx src/app/components/EventDetail.test.tsx src/app/components/PartyAccessDialog.test.tsx src/app/components/EventDoorStaff.test.tsx src/app/components/SuggestedNearbyRail.test.tsx
```

Then run the full checks:

```bash
pnpm --dir server test
pnpm --dir server run build
pnpm test
pnpm run build
```

Manual staging smoke:

1. Create or use real tester-owned accounts only.
2. Sign up with invite and adult confirmation.
3. Complete onboarding with a real adult DOB.
4. Upload non-explicit photo and confirm it appears normally.
5. Upload consented explicit adult photo and confirm opted-out viewer sees only blurred/hidden media.
6. Enable `Show Explicit Photos` and confirm explicit media appears.
7. Enable DL Mode and confirm suggestions/discovery/profile data become discreet.
8. Visit map during event window and confirm The Chocolate Factory warehouse pin appears.
9. Staff generates 6-digit code on `/events/:eventId/door`.
10. User enters code from the party pin dialog.
11. User gains feed and chat access.
12. User moves outside venue radius or disables location and keeps party feed/chat access.
13. Reusing the same code fails.
14. Wrong-code retry limit triggers.
15. Load 600 synthetic local-dev attendees only, not staging fake profiles, and confirm clustering/spiderfy/list fallback remains usable.

---

## Suggested Commit Order

1. `chore(migrations): add beta content and party schema foundations`
2. `feat(settings): add dl mode and explicit content preferences`
3. `feat(media): serve viewer-safe explicit media variants`
4. `feat(auth): require invite and adult confirmation for beta signup`
5. `feat(suggestions): add nearby profile suggestions`
6. `feat(events): add party event and door code access`
7. `feat(events): add party feed and chat membership`
8. `feat(map): add warehouse party pin and dense venue clustering`
9. `style(app): polish beta launch surfaces`
10. `docs(beta): record staging smoke checklist`

---

## What To Do If Something Is Blocked

- If exact launch venue coordinates/times are not configured, build the schema/API/UI and keep production event activation disabled until config exists.
- If blurred variants cannot be generated for old media, hide old explicit media from opted-out viewers and add a backfill task.
- If MapLibre layer clustering gets risky, ship cluster-count plus attendee list first, then spiderfy. Do not ship 600 overlapping DOM markers.
- If group chat membership becomes slow at 600 members, keep durable `event_memberships` as source of truth and lazily create `conversation_members` on first chat open.
- If full test suites fail from unrelated legacy tests, run focused suites for touched files, document the unrelated failures, and do not claim full release readiness.

---

## Developer Stop Point

Do not stop after only the document or only backend schema. The beta/party launch slice is complete when the user can:

1. Open the map.
2. See suggested nearby profiles.
3. Turn on DL Mode.
4. Keep NSFW content blurred unless opted in.
5. Tap The Chocolate Factory warehouse pin.
6. Enter a staff-generated 6-digit code.
7. Access the party feed and chat permanently after code redemption.
8. Use the map at party density without inaccessible overlapping hearts.
