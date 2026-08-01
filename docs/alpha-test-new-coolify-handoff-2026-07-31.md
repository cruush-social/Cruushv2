# Alpha Test Handoff For New Coolify URL

Use this handoff to prepare the July 31 alpha test from the new Coolify instance at `http://87.99.130.8:8000/`.

## Important URL Boundary

- `http://87.99.130.8:8000/` is the Coolify dashboard/login URL.
- Do not send the Coolify dashboard URL to alpha testers.
- The tester link must be the deployed cruush frontend URL.
- The API URL must be a separate API origin or a same-origin proxy behind the frontend.
- If the frontend and API are split origins, the API `CORS_ORIGIN` must exactly match the frontend origin.

## Local Preflight

Run local commands with Node 22. This checkout requires `node >=22.12.0`; Node 20 can produce misleading failures.

```bash
cd /Volumes/corrupt/Cruushv2-1
PATH=/opt/homebrew/opt/node@22/bin:$PATH node --version
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm --dir server test -- src/alpha-test.test.ts src/config.test.ts src/beta-access.test.ts src/events-routes.test.ts src/photo-upload-availability.test.ts
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm test -- src/app/components/Auth.test.tsx src/app/components/AlphaBugButton.test.tsx src/app/components/MapHome.test.tsx
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm run security:check
```

Expected:

- Node prints `v22.x`.
- Alpha/config/beta/event/upload-availability tests pass.
- Auth, alpha bug button, and map tests pass.
- Security check reports no tracked secrets.

## Generate The Alpha Password Hash

Generate the hash locally. Do not paste the raw password into chat, docs, commits, screenshots, or frontend variables.

```bash
cd /Volumes/corrupt/Cruushv2-1
read -s "ALPHA_PASSWORD?Alpha password: "; echo
ALPHA_PASSWORD="$ALPHA_PASSWORD" PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm --dir server exec tsx -e "import { hashPassword } from './src/auth.ts'; console.log(await hashPassword(process.env.ALPHA_PASSWORD ?? ''))"
unset ALPHA_PASSWORD
```

Copy only the printed `scrypt$...` hash into the backend Coolify env value `ALPHA_TEST_PASSWORD_HASH`.

## Coolify Resource Setup

In `http://87.99.130.8:8000/`, create or confirm these resources:

- alpha frontend
- alpha API
- alpha Postgres
- optional alpha scheduler for moderation-media cleanup

Use a real tester-facing URL for the frontend. Prefer HTTPS and a real hostname before inviting testers. If a temporary Coolify-generated URL is used, paste that origin into the API env exactly.

## Alpha API Env

Set these backend/API values in Coolify. Replace placeholder URLs with the actual alpha frontend/API URLs from the new Coolify deployment.

```env
NODE_ENV=production
APP_DEPLOYMENT_STAGE=staging
PORT=3001
HOST=0.0.0.0
DATABASE_URL=<coolify-alpha-postgres-internal-url>
CORS_ORIGIN=<alpha-frontend-origin>
APP_URL=<alpha-frontend-origin>
SESSION_SECRET=<generate-secret-32-plus-chars>

ALPHA_TEST_ENABLED=true
ALPHA_TEST_PASSWORD_HASH=<scrypt-hash-generated-outside-chat-and-git>
ALPHA_TEST_ENDS_AT=<planned-beta-launch-timestamp-with-timezone>
SUPPORT_INBOX_EMAIL=reports@cruush.app

BETA_ACCESS_GEOFENCE_ENABLED=false
LAUNCH_PARTY_ENABLED=true

MEDIA_OBJECT_STORAGE_DRIVER=s3
MEDIA_S3_BUCKET=cruush-media-staging
MEDIA_S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
MEDIA_S3_REGION=auto
MEDIA_S3_ACCESS_KEY_ID=<staging-r2-access-key-id>
MEDIA_S3_SECRET_ACCESS_KEY=<staging-r2-secret-access-key>
MEDIA_PUBLIC_BASE_URL=<alpha-api-origin>

MODERATION_PROVIDER=mock
MODERATION_TIMEOUT_MS=5000
STREAM_MODERATION_ENABLED=true
STREAM_IMAGE_BRIDGE_ENABLED=true
PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED=true
PROFILE_PHOTO_REKOGNITION_ENABLED=true
PROFILE_PHOTO_REKOGNITION_REGION=us-east-1
PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE=90
PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE=80
PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE=90
PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE=18
PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS=5000
PHOTODNA_ENABLED=false
CSAM_REPORTING_ENABLED=false
CSAM_REPORTING_TEST_MODE=false
ALPHA_PROFILE_PHOTO_UPLOADS_WITHOUT_PHOTODNA_ENABLED=false

SEVERE_ACCESS_BANS_ENABLED=true
SEVERE_ACCESS_BAN_HMAC_KEY=<independent-random-secret-at-least-32-bytes>
TRUST_PROXY_HOPS=1

RESEND_API_KEY=<resend-api-key>
MAIL_FROM=cruush <hello@cruush.app>
EMAIL_PREVIEW_ENABLED=false
TURNSTILE_SECRET_KEY=<turnstile-secret-key-or-empty-if-disabled>

PROFILE_ENCRYPTION_KEY=<generate-secret-32-plus-chars>
PROFILE_TOKEN_KEY=<generate-secret-32-plus-chars>
PROFILE_TOKEN_KEY_VERSION=v1
RELATIONSHIP_ENCRYPTION_KEY=<generate-secret-32-plus-chars>
RELATIONSHIP_INDEX_KEY=<generate-secret-32-plus-chars>
RELATIONSHIP_ENCRYPTION_KEY_VERSION=v1
RELATIONSHIP_INDEX_KEY_VERSION=v1
MATCH_TOKEN_ENCRYPTION_KEY=<generate-secret-32-plus-chars>
MATCH_TOKEN_SIGNING_KEY=<generate-secret-32-plus-chars>
MATCH_TOKEN_KEY_VERSION=v1
MESSAGE_ENCRYPTION_KEY=<generate-secret-32-plus-chars>
MESSAGE_ENCRYPTION_KEY_VERSION=v1
FEED_ENCRYPTION_KEY=<generate-secret-32-plus-chars>
FEED_ENCRYPTION_KEY_VERSION=v1
MEDIA_ENCRYPTION_KEY=<generate-secret-32-plus-chars>
MEDIA_ENCRYPTION_KEY_VERSION=v1
LOCATION_ENCRYPTION_KEY=<generate-secret-32-plus-chars>
LOCATION_INDEX_KEY=<generate-secret-32-plus-chars>
VISIBILITY_POLICY_ENCRYPTION_KEY=<generate-secret-32-plus-chars>
GHOST_DERIVATION_KEY=<generate-secret-32-plus-chars>
DISPLAY_TOKEN_ENCRYPTION_KEY=<generate-secret-32-plus-chars>
LOCATION_ENCRYPTION_KEY_VERSION=v1
LOCATION_INDEX_KEY_VERSION=v1
VISIBILITY_POLICY_ENCRYPTION_KEY_VERSION=v1
GHOST_DERIVATION_KEY_VERSION=v1
DISPLAY_TOKEN_ENCRYPTION_KEY_VERSION=v1
```

For alpha without PhotoDNA, profile- and message-photo uploads now share the same active alpha launch exception. Keep both closed unless active alpha is intentionally enabled and the Stream image bridge, profile-photo Stream automod, and Rekognition status are explicitly verified.

## Alpha Frontend Env

Set these only on the frontend resource:

```env
VITE_API_BASE_URL=<alpha-api-origin>
VITE_TURNSTILE_SITE_KEY=<turnstile-site-key-or-empty-if-disabled>
VITE_MAP_STYLE_URL=
VITE_MAP_VECTOR_TILEJSON_URL=https://tiles.openfreemap.org/planet
VITE_MAP_GLYPHS_URL=https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf
VITE_MAP_USE_RASTER_TILES=false
VITE_MAP_TILE_URL=
VITE_MAP_ATTRIBUTION=&copy; CARTO &copy; OpenStreetMap contributors
```

Do not put backend secrets in any `VITE_*` variable.

## Live Verification

After deploy:

```bash
curl -i <alpha-api-origin>/health
curl -i <alpha-api-origin>/api/meta
curl -I <alpha-frontend-origin>/
```

Expected `/api/meta` alpha state:

```json
{
  "alphaTest": {
    "enabled": true,
    "active": true,
    "ended": false
  }
}
```

Manual smoke:

- Open the frontend alpha URL, not the Coolify dashboard.
- Confirm signup shows the alpha password field.
- Confirm missing or wrong alpha password is rejected.
- Confirm correct alpha password reaches signup/login flow.
- Confirm the floating alpha bug button appears after sign-in.
- Submit one test bug report and confirm it arrives at `reports@cruush.app` or in Resend logs.
- Confirm `/map`, `/profile/edit`, feed, messages, reports, and launch-party pin load without console CORS errors.
- Confirm `/api/meta.photoUploads` matches the intended alpha safety state before asking testers to upload photos.

## Tester Message

Send testers only:

```text
Use this alpha link: <alpha-frontend-origin>
Use the alpha password we sent separately.
Screenshots are allowed for alpha feedback. Use the in-app Report alpha bug button after signing in.
Do not share the link or password outside the alpha group.
```
