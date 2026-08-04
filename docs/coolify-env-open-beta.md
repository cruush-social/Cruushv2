# Coolify Open Beta Environment Template

Last updated: 2026-07-14

Use this when configuring Coolify for the cruush app frontend and API. Do not paste placeholder values literally. Do not commit real values.

## How To Use

The Coolify dashboard is an admin/control-plane URL. Do not give it to alpha testers as the app link. Alpha testers need the frontend app URL, and the API needs its own URL or a same-origin proxy.

Production now runs on `http://87.99.152.196:8000`. Earlier revisions of this document named `87.99.130.8`, which is retired and unreachable. See `docs/coolify-production-config.md` for the current host, resource UUIDs, and required build and health-check settings.

Create separate Coolify resources/projects for staging and production:

- staging frontend
- staging API
- staging Postgres
- production frontend
- production API
- production Postgres

Set frontend variables only on the frontend resource. Set backend/API variables only on the API resource.

Cloudflare R2 satisfies the API's S3-compatible storage requirement; a separate AWS S3 account is not required. Use a staging-only R2 bucket and a bucket-scoped token with object read and write permissions, which are required for encrypted upload, authenticated reads, and deletion/cleanup. Do not make the bucket public.

Secrets must be generated or pasted directly into Coolify. Do not paste real secrets into chat, repo files, screenshots, or terminal logs.

Frontend safety rule: never add backend/API secrets to a frontend Coolify resource. The only frontend variables should be public `VITE_*` values. Vite embeds `VITE_*` values into browser JavaScript by design, so `VITE_*` values must never contain Stream secrets, PhotoDNA keys, database URLs, session secrets, encryption keys, R2 secret keys, Resend keys, or backend Turnstile secret keys.

## Staging API Variables

Use this block for the staging API resource.

```env
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
DATABASE_URL=<coolify-staging-postgres-internal-url>
CORS_ORIGIN=https://staging.cruush.app
SESSION_SECRET=<generate-secret-32-plus-chars>
APP_URL=https://staging.cruush.app
APP_DEPLOYMENT_STAGE=staging

MEDIA_STORAGE_DIR=media
MEDIA_PUBLIC_BASE_URL=https://api-staging.cruush.app
MEDIA_OBJECT_STORAGE_DRIVER=s3
MEDIA_S3_BUCKET=cruush-media-staging
MEDIA_S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
MEDIA_S3_REGION=auto
MEDIA_S3_ACCESS_KEY_ID=<staging-r2-access-key-id>
MEDIA_S3_SECRET_ACCESS_KEY=<staging-r2-secret-access-key>

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
ALPHA_PROFILE_PHOTO_UPLOADS_WITHOUT_PHOTODNA_ENABLED=false
SEVERE_ACCESS_BANS_ENABLED=true
SEVERE_ACCESS_BAN_HMAC_KEY=<independent-random-secret-at-least-32-bytes>
TRUST_PROXY_HOPS=1
AWS_ACCESS_KEY_ID=<staging-rekognition-only-access-key>
AWS_SECRET_ACCESS_KEY=<staging-rekognition-only-secret-key>
STREAM_API_KEY=<stream-api-key>
STREAM_API_SECRET=<stream-api-secret>
STREAM_APP_ID=<stream-app-id>
STREAM_MODERATION_CONFIG_KEY=<stream-moderation-config-key>
STREAM_PSEUDONYM_KEY=<generate-secret-32-plus-bytes>
BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED=false
BANK_PROFILE_PHOTO_TESTER_USER_IDS=

PHOTODNA_ENABLED=true
PHOTODNA_API_URL=<microsoft-photodna-api-base-url>
PHOTODNA_OPERATION_PATH=<microsoft-photodna-operation-path>
PHOTODNA_SUBSCRIPTION_KEY=<microsoft-photodna-subscription-key>
PHOTODNA_TIMEOUT_MS=5000
CSAM_REPORTING_ENABLED=true
CSAM_REPORTING_MODE=manual_packet
CSAM_REPORTING_TEST_MODE=true
TRUST_SAFETY_ALERT_EMAIL=<private-trust-safety-inbox>
SUPPORT_INBOX_EMAIL=reports@cruush.app

INTERNAL_API_SECRET=<generate-internal-api-secret-or-leave-empty-if-unused>
MAIL_FROM=cruush <hello@cruush.app>
RESEND_API_KEY=<resend-api-key>
EMAIL_PREVIEW_ENABLED=false
DEVELOPMENT_ADMIN_ENABLED=false
DEVELOPMENT_ADMIN_PASSWORD=
ALPHA_TEST_ENABLED=true
ALPHA_TEST_PASSWORD_HASH=<scrypt-hash-generated-outside-chat-and-git>
ALPHA_TEST_ENDS_AT=<planned-beta-launch-timestamp-with-timezone>
BETA_ACCESS_GEOFENCE_ENABLED=true
BETA_ACCESS_CENTER_LATITUDE=40.70982
BETA_ACCESS_CENTER_LONGITUDE=-73.92256
BETA_ACCESS_RADIUS_MILES=15
BETA_ACCESS_VENUE_NAME=70 Scott Ave
TURNSTILE_SECRET_KEY=<turnstile-secret-key-or-empty-if-disabled>

LAUNCH_PARTY_ENABLED=true
LAUNCH_PARTY_LATITUDE=40.70982
LAUNCH_PARTY_LONGITUDE=-73.92256
LAUNCH_PARTY_RADIUS_MILES=1
LAUNCH_PARTY_STARTS_AT=2026-07-31T22:00:00-04:00
LAUNCH_PARTY_ENDS_AT=2026-08-01T05:00:00-04:00
LAUNCH_PARTY_CHAT_EXPIRES_AT=2026-08-07T03:59:00-04:00
LAUNCH_PARTY_RA_URL=https://ra.co/events/2483120

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

Do not open deployed profile- or message-photo uploads for open beta until the Microsoft API Management operation path and real allowed/blocked responses are verified. Deployed open-beta uploads stay unavailable unless `PHOTODNA_ENABLED`, Stream automod, the signed image bridge, and Rekognition human detection are all enabled. For alpha staging only, an active `ALPHA_TEST_ENABLED=true` gate temporarily permits profile- and message-photo uploads without PhotoDNA while the remaining launch safety providers are being verified.

Stream fetches signed inspection URLs from `MEDIA_PUBLIC_BASE_URL`. Confirm Coolify ingress, proxy, CDN/WAF, and APM logs do not retain signed query strings on that API route. Add a private five-minute scheduled task from the repository root:

```cron
*/5 * * * * pnpm --dir server cleanup:moderation-media-grants
```

That cleanup command also recalculates a batch of trust profiles with decaying negative trust events. To force a one-time trust recovery pass after deploy, run:

```bash
pnpm --dir server trust:recalculate
```

## Staging Frontend Variables

Use this block for the staging frontend resource.

```env
VITE_API_BASE_URL=https://api-staging.cruush.app
VITE_TURNSTILE_SITE_KEY=<turnstile-site-key-or-empty-if-disabled>
VITE_MAP_STYLE_URL=
VITE_MAP_VECTOR_TILEJSON_URL=https://tiles.openfreemap.org/planet
VITE_MAP_GLYPHS_URL=https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf
VITE_MAP_USE_RASTER_TILES=false
VITE_MAP_TILE_URL=
VITE_MAP_ATTRIBUTION=&copy; CARTO &copy; OpenStreetMap contributors
```

If the frontend and API are deployed same-origin behind the same proxy, `VITE_API_BASE_URL` may be blank. If the API is on `api-staging.cruush.app`, keep it set to that API origin. For a temporary alpha host on the new Coolify server, replace `https://staging.cruush.app` and `https://api-staging.cruush.app` with the actual alpha frontend and API origins after the app resources are bound; do not use the Coolify dashboard URL as the app or API origin.

## Production API Variables

Use this block for the production API resource.

```env
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
DATABASE_URL=<coolify-production-postgres-internal-url>
CORS_ORIGIN=https://cruush.app,https://www.cruush.app
SESSION_SECRET=<generate-secret-32-plus-chars>
APP_URL=https://cruush.app
APP_DEPLOYMENT_STAGE=production

MEDIA_STORAGE_DIR=media
MEDIA_PUBLIC_BASE_URL=https://api.cruush.app
MEDIA_OBJECT_STORAGE_DRIVER=s3
MEDIA_S3_BUCKET=cruush-media-prod
MEDIA_S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
MEDIA_S3_REGION=auto
MEDIA_S3_ACCESS_KEY_ID=<production-r2-access-key-id>
MEDIA_S3_SECRET_ACCESS_KEY=<production-r2-secret-access-key>

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
SEVERE_ACCESS_BANS_ENABLED=true
SEVERE_ACCESS_BAN_HMAC_KEY=<independent-random-secret-at-least-32-bytes>
TRUST_PROXY_HOPS=1
AWS_ACCESS_KEY_ID=<production-rekognition-only-access-key>
AWS_SECRET_ACCESS_KEY=<production-rekognition-only-secret-key>
STREAM_API_KEY=<stream-api-key>
STREAM_API_SECRET=<stream-api-secret>
STREAM_APP_ID=<stream-app-id>
STREAM_MODERATION_CONFIG_KEY=<stream-moderation-config-key>
STREAM_PSEUDONYM_KEY=<generate-secret-32-plus-bytes>
BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED=false
BANK_PROFILE_PHOTO_TESTER_USER_IDS=

PHOTODNA_ENABLED=true
PHOTODNA_API_URL=<microsoft-photodna-api-base-url>
PHOTODNA_OPERATION_PATH=<microsoft-photodna-operation-path>
PHOTODNA_SUBSCRIPTION_KEY=<microsoft-photodna-subscription-key>
PHOTODNA_TIMEOUT_MS=5000
CSAM_REPORTING_ENABLED=true
CSAM_REPORTING_MODE=manual_packet
CSAM_REPORTING_TEST_MODE=false
TRUST_SAFETY_ALERT_EMAIL=<private-trust-safety-inbox>
SUPPORT_INBOX_EMAIL=reports@cruush.app

INTERNAL_API_SECRET=<generate-internal-api-secret-or-leave-empty-if-unused>
MAIL_FROM=cruush <hello@cruush.app>
RESEND_API_KEY=<resend-api-key>
EMAIL_PREVIEW_ENABLED=false
DEVELOPMENT_ADMIN_ENABLED=false
DEVELOPMENT_ADMIN_PASSWORD=
ALPHA_TEST_ENABLED=false
ALPHA_TEST_PASSWORD_HASH=
ALPHA_TEST_ENDS_AT=
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

Do not reuse staging secrets in production. Production must have fresh keys.

## Production Frontend Variables

Use this block for the production frontend resource.

```env
VITE_API_BASE_URL=https://api.cruush.app
VITE_TURNSTILE_SITE_KEY=<turnstile-site-key-or-empty-if-disabled>
VITE_MAP_STYLE_URL=
VITE_MAP_VECTOR_TILEJSON_URL=https://tiles.openfreemap.org/planet
VITE_MAP_GLYPHS_URL=https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf
VITE_MAP_USE_RASTER_TILES=false
VITE_MAP_TILE_URL=
VITE_MAP_ATTRIBUTION=&copy; CARTO &copy; OpenStreetMap contributors
```

If the frontend and API are deployed same-origin behind the same proxy, `VITE_API_BASE_URL` may be blank. If the API is on `api.cruush.app`, keep it set to that API origin.

## Frontend Source Visibility

Browser JavaScript cannot be truly hidden from users. Production Vite builds are bundled and minified, and this repo explicitly disables production source maps, so users should not see readable TypeScript source files in DevTools. They can still download and inspect the bundled JavaScript because the browser must receive it to run the app.

This is why all secrets and privileged logic must stay on the API server. Do not rely on obfuscation for security.

## What I Can Safely Add Without Seeing Secrets

These values are safe to add directly if the domains/buckets are correct:

- `NODE_ENV=production`
- `PORT=3001`
- `HOST=0.0.0.0`
- `CORS_ORIGIN`
- `APP_URL`
- `MEDIA_STORAGE_DIR=media`
- `MEDIA_PUBLIC_BASE_URL`
- `MEDIA_OBJECT_STORAGE_DRIVER=s3`
- `MEDIA_S3_BUCKET`
- `MEDIA_S3_REGION=auto`
- `MODERATION_PROVIDER=mock`
- `MODERATION_TIMEOUT_MS=5000`
- `STREAM_MODERATION_ENABLED=true`
- `STREAM_IMAGE_BRIDGE_ENABLED=true` only after the dedicated no-cache moderation-media hostname is routed and its upstream logs are verified not to retain raw paths
- `PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED=true` for the shared bank/open-beta Stream path; keep manual review false
- `PROFILE_PHOTO_REKOGNITION_ENABLED=true`, a Rekognition-only IAM principal with `DetectFaces` and `DetectLabels`, and the documented human/animal/face/age thresholds
- `ALPHA_PROFILE_PHOTO_UPLOADS_WITHOUT_PHOTODNA_ENABLED=true` only for legacy alpha staging notes; the active `ALPHA_TEST_ENABLED=true` staging gate now permits the same temporary profile- and message-photo exception, but leave both paths false for open beta or production
- `ALPHA_TEST_ENABLED=true`, `ALPHA_TEST_PASSWORD_HASH=<scrypt hash>`, and `ALPHA_TEST_ENDS_AT=<planned-beta-launch-timestamp-with-timezone>` keep alpha active until the beta launch cutover. The beta deployment sets `ALPHA_TEST_ENABLED=false`, clears `ALPHA_TEST_PASSWORD_HASH`, and clears `ALPHA_TEST_ENDS_AT` without exposing secrets in logs.
- `BETA_ACCESS_GEOFENCE_ENABLED=true` limits launch beta signup/signin to the configured 15-mile radius around `70 Scott Ave`. Outside-radius users see the newsletter/city-request path; those email/city entries are encrypted at rest with HMAC-only dedupe indexes.
- Support requests, alpha bug reports, and in-app moderation reports notify `reports@cruush.app`. Beta launch feedback stays text-only; there is no screenshot prompt or screenshot upload path for beta.
- Launch party envs should stay backend-only. Keep `LAUNCH_PARTY_ENABLED=true` for the July 31 alpha launch so the map pin is visible. The Chocolate Factory pin is active from `2026-07-31T22:00:00-04:00` until `2026-08-01T05:00:00-04:00`; after that timestamp, the backend cutoff removes the pin while beta can continue. The party group chat expires at `2026-08-07T03:59:00-04:00` for users who accepted the invite from the party hat flow.
- Use `node scripts/release-main-coolify.mjs --source codex/beta-launch-release-20260731 --target both --confirm-production --no-dry-run` only after checks pass. Dry-run is the default; production deploy is blocked without `--confirm-production`.
- `SEVERE_ACCESS_BANS_ENABLED=true`, `SEVERE_ACCESS_BAN_HMAC_KEY=<32+ byte secret>`, and `TRUST_PROXY_HOPS=1` only after confirming the Coolify/Traefik proxy chain
- `PHOTODNA_ENABLED=true` only after the Microsoft endpoint and response contract are verified; deployed uploads remain disabled while it is false
- `PHOTODNA_TIMEOUT_MS=5000`
- `EMAIL_PREVIEW_ENABLED=false`
- `DEVELOPMENT_ADMIN_ENABLED=false`
- all `*_KEY_VERSION=v1`
- frontend map defaults
- frontend API base URL

The legacy `HUMAN_MODERATION_ENABLED` and `VITE_HUMAN_MODERATION_ENABLED` keys may be omitted. Moderator routes are always mounted and require an active authenticated user present in `moderator_users`.

These require secret values or dashboard-generated values:

- `DATABASE_URL`
- `SESSION_SECRET`
- `MEDIA_S3_ENDPOINT`
- `MEDIA_S3_ACCESS_KEY_ID`
- `MEDIA_S3_SECRET_ACCESS_KEY`
- `STREAM_API_KEY`
- `STREAM_API_SECRET`
- `STREAM_APP_ID`
- `STREAM_MODERATION_CONFIG_KEY`
- `STREAM_PSEUDONYM_KEY`
- `PHOTODNA_API_URL`
- `PHOTODNA_OPERATION_PATH`
- `PHOTODNA_SUBSCRIPTION_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `SEVERE_ACCESS_BAN_HMAC_KEY`
- `INTERNAL_API_SECRET`
- `RESEND_API_KEY`
- `TURNSTILE_SECRET_KEY`
- `VITE_TURNSTILE_SITE_KEY`
- `ALPHA_TEST_PASSWORD_HASH`
- every encryption/index/signing key

## Coolify Verification After Save

After env vars are saved and the service redeploys:

1. API health returns `200` at `/health`.
2. Frontend can call `/api/auth/me` without CORS errors.
3. Signup/login works.
4. Email verification works or test login is already verified.
5. Profile edit works.
6. Profile photo upload stores encrypted media through R2/S3.
7. A PhotoDNA non-match plus complete Stream `keep` plus Rekognition age-safety result publishes without a manual-review row. Profile photos additionally require person/no-animal approval. A definite child face publishes nothing and permanently suspends the account, revokes sessions, restricts every feature, and writes HMAC-only device/IP bans. An age range overlapping 18 is accepted so 18+ users are not blocked by an imprecise range.
8. Feed accepts safe text and rejects public/profile coded-language terms.
9. DM text works.
10. DM/group photo uploads pass through the same PhotoDNA, Stream, Rekognition child-face, cleanup, and permanent-ban path before attachment.
11. Report submission works.
12. Logs show no missing required env variable errors.
13. API, Coolify/proxy, CDN/WAF, and APM logs contain no signed moderation query string.
