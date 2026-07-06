# Reports, Profile Photos, Messages, And Profile Navigation Implementation

This document summarizes the work added in this thread and the reasoning behind the implementation choices. The scope covered five product areas:

- A reporting MVP with a dedicated `/report` page and persisted backend storage.
- Authenticated local-disk profile photo uploads for profile pictures and profile photos.
- Removal of message preview/sample-data mode from live message screens.
- A fix for the bottom Profile tab incorrectly opening the map/profile preview overlay.
- A persistence fix so uploaded photos remain attached to the profile after navigation or refetch.

## Reporting MVP

### What Was Added

- Added a `reports` database migration in `server/sql/021_reports.sql`.
- Added report payload validation in `server/src/report-schema.ts`.
- Added `POST /api/reports` in `server/src/routes/reports.ts`.
- Registered the report route in `server/src/app.ts`.
- Added a frontend report API helper in `src/app/lib/reportApi.ts`.
- Added the report UI page in `src/app/components/ReportPage.tsx`.
- Added the `/report` route in `src/app/App.tsx`.
- Added report entry points from profile and chat safety surfaces.
- Added tests for report authentication, target validation, conversation membership, creation, and rate limiting.

### Public API

`POST /api/reports`

Request body:

```json
{
  "targetType": "profile",
  "targetUserId": "uuid",
  "reason": "harassment",
  "details": "optional details"
}
```

Response:

```json
{
  "id": "report id",
  "status": "open",
  "createdAt": "ISO timestamp"
}
```

The endpoint also supports conversation reports with `targetType: "conversation"` and `conversationId`.

### Why It Was Implemented This Way

- Reports are persisted in a dedicated `reports` table instead of being sent only as transient events. This gives moderation tooling a durable record to build on later.
- The endpoint validates target type and target ownership rules server-side. Profile reports verify the reported profile exists; conversation reports verify the reporter belongs to the conversation.
- The report admin UI was intentionally left out. The requested scope was a reporting MVP and backend storage, so the implementation stores review-ready data without expanding into moderation workflow design.
- Rate limiting is enforced on report creation to reduce spam and abuse without blocking legitimate occasional reports.
- The frontend report page accepts route state from profile/chat surfaces. This keeps the UI simple while still allowing direct navigation to `/report`.

## Profile Photo Uploads

### What Was Added

- Added multipart upload support with `@fastify/multipart`.
- Added static media serving with `@fastify/static`.
- Added media storage helpers in `server/src/media-storage.ts`.
- Added `POST /api/profile-photos` and public `/media/profile-photos/...` serving in `server/src/routes/media.ts`.
- Added `MEDIA_STORAGE_DIR` configuration in server config and `.env.example`.
- Added a persistent self-hosted Docker volume for uploaded media.
- Added `.gitignore` coverage for local uploaded media.
- Added frontend `uploadProfilePhoto` in `src/app/lib/profileApi.ts`.
- Added frontend URL resolution helpers in `src/app/lib/apiClient.ts`.
- Updated profile photo validation to accept either public HTTPS URLs or app-owned `/media/profile-photos/...` paths.
- Replaced the placeholder Photos tab in `ProfileEdit` with upload, preview grid, primary photo selection, remove, and save behavior.
- Updated profile image rendering paths to resolve app-owned media URLs correctly.
- Added server and frontend tests for valid uploads, invalid MIME types, oversized uploads, accepted app-owned media paths, rejected unsafe local/data URLs, and profile edit photo workflows.

### Public API

`POST /api/profile-photos`

Multipart field:

```text
photo
```

Response:

```json
{
  "url": "/media/profile-photos/<file>"
}
```

`GET /media/profile-photos/<file>` serves uploaded profile images.

### Upload Persistence Fix

The initial upload endpoint wrote the file and returned the URL, but it did not attach the URL to `profiles.photos`. That meant the photo could appear in local form state but disappear after navigating away or refetching the profile.

The route now:

- Checks the authenticated user’s current `profiles.photos` count.
- Rejects uploads if the user already has 9 photos.
- Writes the image to local media storage.
- Appends the returned `/media/profile-photos/...` URL to `profiles.photos`.
- Cleans up the written file if the database append fails.

### Why It Was Implemented This Way

- Local disk storage was selected because the requested plan explicitly called for self-hosted local storage. The implementation keeps storage simple and makes persistence explicit through `MEDIA_STORAGE_DIR` and Docker volume configuration.
- Uploaded media paths use app-owned relative URLs instead of public absolute URLs. This works in same-origin deployments and through the Vite dev proxy while keeping the database independent of one deployment hostname.
- File validation checks MIME type, file size, and image signatures. MIME alone is easy to spoof; signature checks provide a stronger baseline without introducing a full image processing pipeline.
- The first photo remains the PFP because the existing `profiles.photos` model already uses ordered photo arrays. Reordering the array is simpler and less risky than adding a new `primary_photo_id` field.
- The upload endpoint now persists the URL immediately so a successful upload survives route changes and profile refetches even before a broader profile edit save.
- Media moderation, image resizing, and CDN/object storage were left out because they were explicitly out of scope for this pass.

## Message Preview Mode Removal

### What Was Removed

- Removed fallback/sample conversation data from direct messages.
- Removed fallback/sample message data from private group chat.
- Removed `usingSampleData` behavior and “Preview mode” UI.
- Removed fake/sample chat send behavior.
- Deleted the message fixture source used for preview data.
- Updated empty and error states so live API responses are represented honestly.

### What Was Added

- Direct messages now show an empty inbox when the live conversations API returns no conversations.
- Direct messages now show a real error state when the conversations API fails.
- Private group chat now shows an empty chat state when the live messages API returns no messages.
- Private group chat now surfaces real API failures instead of silently falling back.
- Chat safety/report navigation now routes to `/report`.
- Tests were added for live-only empty states, error states, and report navigation.

### Why It Was Implemented This Way

- Preview/sample data is useful for prototypes but dangerous in a live messaging product because it can hide backend failures and make fake conversations look real.
- Empty API responses now map to empty UI states. API failures now map to error states. This makes production behavior easier to debug and avoids misleading users.
- The desktop profile preview overlay was not part of the message preview removal and was intentionally left intact until the separate Profile tab bug fix below.

## Profile Tab Map Bug Fix

### What Was Fixed

Clicking the bottom Profile tab on desktop previously:

1. Intercepted the `/profile` navigation in `BottomNav`.
2. Navigated to `/map`.
3. Opened a fixed own-profile `MapProfilePopup`.

That created the bug where the Profile tab opened the map and broke the expected profile flow.

### What Was Changed

- Removed `onProfilePreviewRequest`, `isProfilePreviewOpen`, and the desktop-only `/profile` click branch from `src/app/components/BottomNav.tsx`.
- Removed the app-shell-owned `isOwnProfilePreviewOpen` state from `src/app/App.tsx`.
- Removed the fixed own-profile `MapProfilePopup` render path from `App`.
- Stopped passing own-profile preview props into `MapHome` and `BottomNav`.
- Removed the stale `isOwnProfilePreviewOpen` prop from `MapHome`.
- Updated tests so the Profile tab navigates to `/profile` from both `/map` and `/messages`.
- Removed tests that expected redirect-to-map/profile-preview behavior.

### What Was Preserved

- Map-selected user popups still work.
- Desktop map profile previews still work for nearby/selected users.
- Only the bottom-nav own-profile preview behavior was removed.

### Why It Was Implemented This Way

- Bottom navigation should behave consistently across desktop and mobile. A tab labeled Profile should navigate to the full profile page.
- Keeping map-selected popups separate avoids breaking the discovery map workflow while removing the surprising own-profile override.
- Removing the app-shell state prevents the old behavior from being accidentally reintroduced through props.

## Frontend Media URL Resolution

### What Was Added

- `resolveApiUrl` and `resolveMediaUrl` in `src/app/lib/apiClient.ts`.
- Profile image renderers now resolve app-owned `/media/...` paths through the configured API base URL when needed.
- Vite is configured to proxy `/media` in development.

### Why It Was Implemented This Way

- The backend returns stable relative media paths. The frontend resolver decides how to turn those into browser-loadable URLs.
- This avoids storing environment-specific hostnames in `profiles.photos`.
- It supports both same-origin deployments and local development with `VITE_API_BASE_URL`.

## Backend Storage And Deployment Changes

### What Was Added

- `MEDIA_STORAGE_DIR` server config.
- Local media directory ignore rules.
- Self-hosted Docker volume mapping for media persistence.
- Static media serving under `/media/profile-photos`.

### Why It Was Implemented This Way

- Uploaded files must outlive container restarts in self-hosted deployments. A Docker volume makes that persistence explicit.
- Keeping media under a single configured root makes it easier to back up, migrate, or later replace with object storage.
- The media route is public because profile photos are already public profile assets.

## Testing And Validation Added

### Server Coverage

- Report authentication and validation.
- Profile report creation.
- Conversation report membership enforcement.
- Report rate limiting.
- Profile photo upload authentication.
- Valid profile photo upload.
- Invalid MIME rejection.
- Oversized file rejection.
- Max-photo-count rejection.
- App-owned media path schema acceptance.
- Rejection of data/local/private arbitrary photo URLs.

### Frontend Coverage

- ProfileEdit upload, preview, set-primary, remove, and save.
- ProfileEdit keeps uploaded photos visible across edit tab switches.
- ReportPage submit success and error states.
- Profile/chat report navigation.
- DirectMessages empty and error states without preview data.
- PrivateGroupChat live-only empty state and report navigation.
- BottomNav Profile click navigation from map and messages.

### Commands Run During This Work

The following validation commands were run successfully during the thread:

```bash
npm --prefix server test
npm --prefix server run build
corepack pnpm test
corepack pnpm build
corepack pnpm exec vitest run src/app/components/BottomNav.test.tsx src/app/components/MapHome.test.tsx src/app/App.test.tsx
corepack pnpm exec vitest run src/app/components/ProfileEdit.test.tsx
```

The frontend production build still reports the existing Vite large-chunk warning. That warning was not introduced by these changes and does not fail the build.

## Tradeoffs And Future Work

- Report review/admin tooling is still needed before reports can be operationally processed.
- Uploaded media should eventually get moderation, image resizing, thumbnail generation, and orphan cleanup.
- Local disk storage is correct for the current self-hosted pass, but object storage may be a better fit for larger deployments.
- The message screens now expose real API failures; this may reveal backend or network problems that preview mode previously hid.
- The profile photo upload endpoint persists immediately, while other profile edit fields still require Save. This is intentional for uploaded files because the file already exists once the upload succeeds, but the UI should eventually make that persistence model explicit.
