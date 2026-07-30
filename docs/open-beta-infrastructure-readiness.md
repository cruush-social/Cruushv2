# Open Beta Infrastructure Readiness

This is the open beta infrastructure checklist for the production path, not a bank-only demo path. The target is a city beta on the current Coolify/self-hosted architecture, with cruush-controlled application-layer encryption and private object storage.

## Target Runtime

- Use Coolify for the frontend, API, Postgres 16, env vars, deploys, SSL, logs, and scheduled database backups.
- Keep staging and production as separate Coolify projects with separate domains, databases, buckets, and secrets.
- Use a US-East production VPS, preferably Ashburn, VA for NYC latency.
- Target at least `8 vCPU / 16 GB RAM / 160 GB SSD` for production. `4 vCPU / 8 GB` is staging or early-test capacity only.
- Keep production Postgres self-hosted for this slice, but require offsite backups, restore testing, and disk alerts before open beta.

## Browser Audit Checklist

Run this before resizing servers or wiring production secrets:

- Coolify server region, CPU, RAM, disk size, disk usage, and current load.
- Coolify projects and whether staging/prod are separated.
- Frontend/API deploy branch, domains, health checks, and SSL state.
- API env vars present/missing for Stream, PhotoDNA, Resend, Turnstile, and encryption keys.
- Postgres version, database names, attached app resources, and backup schedule.
- Backup destination, retention, latest successful backup, and restore-test status.
- Cloudflare DNS records for app/API domains.
- Cloudflare R2 buckets and access keys for staging/prod media.

Secrets should be pasted directly into provider dashboards by the account owner. Do not paste real secrets into chat, docs, commits, screenshots, or terminal logs.

## R2 Media Storage

Create private Cloudflare R2 Standard buckets:

- `cruush-media-staging`
- `cruush-media-prod`

Create separate least-privilege R2/S3 access keys for staging and production. The API needs object read/write/delete access only for its environment bucket. Do not make the buckets public.

Set these API environment variables in Coolify:

```env
MEDIA_OBJECT_STORAGE_DRIVER=s3
MEDIA_S3_BUCKET=cruush-media-prod
MEDIA_S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
MEDIA_S3_REGION=auto
MEDIA_S3_ACCESS_KEY_ID=<set in Coolify only>
MEDIA_S3_SECRET_ACCESS_KEY=<set in Coolify only>
MEDIA_PUBLIC_BASE_URL=https://api.cruush.app
```

Local development and tests may continue using:

```env
MEDIA_OBJECT_STORAGE_DRIVER=local
MEDIA_STORAGE_DIR=media
```

Production config intentionally rejects `MEDIA_OBJECT_STORAGE_DRIVER=local` so beta media cannot silently land on the API container filesystem.

## Backups And Restore

- Schedule daily Postgres backups to private S3/R2-compatible storage.
- Keep at least 14-30 days of backups for open beta.
- Run one restore test before bank review and before public open beta.
- Enable VPS snapshots only as secondary recovery. Snapshots do not replace database backups.
- Add disk usage alerts before beta. Treat database disk above 75% as urgent.

Minimum restore drill:

1. Create a fresh throwaway Postgres service or local Postgres container.
2. Restore the latest backup into it.
3. Run migrations against the restored database.
4. Verify login, profile, feed, messages, reports, and media metadata queries work.
5. Record date, backup file, restore target, duration, and any errors.

## Required Production Secrets

Generate fresh production values for:

- `SESSION_SECRET`
- `PROFILE_ENCRYPTION_KEY`
- `PROFILE_TOKEN_KEY`
- `RELATIONSHIP_ENCRYPTION_KEY`
- `RELATIONSHIP_INDEX_KEY`
- `MATCH_TOKEN_ENCRYPTION_KEY`
- `MATCH_TOKEN_SIGNING_KEY`
- `MESSAGE_ENCRYPTION_KEY`
- `FEED_ENCRYPTION_KEY`
- `MEDIA_ENCRYPTION_KEY`
- `LOCATION_ENCRYPTION_KEY`
- `LOCATION_INDEX_KEY`
- `VISIBILITY_POLICY_ENCRYPTION_KEY`
- `GHOST_DERIVATION_KEY`
- `DISPLAY_TOKEN_ENCRYPTION_KEY`
- Stream API key, secret, app ID, and moderation config key.
- PhotoDNA endpoint, operation path, and subscription key. Keep `PHOTODNA_ENABLED=false` until CSAM reporting is configured and verified.
- CSAM reporting settings: `CSAM_REPORTING_ENABLED`, `CSAM_REPORTING_MODE`, `CSAM_REPORTING_TEST_MODE`, and `TRUST_SAFETY_ALERT_EMAIL`.
- Resend API key and verified `MAIL_FROM` for account email, trust/safety alerts, and support inbox notifications.
- `SUPPORT_INBOX_EMAIL` for support requests submitted from login/signup and Settings.
- Turnstile frontend site key and backend `TURNSTILE_SECRET_KEY` if signup captcha is enabled.
- Temporary alpha gate, if enabled: `ALPHA_TEST_ENABLED=true`, `ALPHA_TEST_PASSWORD_HASH=<scrypt hash>`, and `ALPHA_TEST_ENDS_AT=2026-07-31T00:00:00-04:00`. Do not store the raw alpha password in chat, docs, commits, screenshots, or frontend variables.
- Launch beta geofence: set `BETA_ACCESS_GEOFENCE_ENABLED=true`, `BETA_ACCESS_CENTER_LATITUDE=40.70982`, `BETA_ACCESS_CENTER_LONGITUDE=-73.92256`, `BETA_ACCESS_RADIUS_MILES=15`, and `BETA_ACCESS_VENUE_NAME=70 Scott Ave`. Outside-radius newsletter/city requests store encrypted email/city values, not plaintext.

Use deployment secrets first. Move to KMS/Vault later only if operational complexity is justified.

## Bank And Beta Smoke Test

Run this after staging deploys from the reviewed branch:

- Signup/login with a bank-review account.
- Email verification or provided verified login works.
- Profile edit saves normal profile text and rejects banned public/profile coded language.
- Safe profile photo upload is accepted and served through `/api/media/profile-photos/:filename`.
- Rejected profile photo does not become visible.
- Feed post works for allowed text and rejects banned feed language.
- DM text works, including allowed drug discussion without sales.
- DM/group photo messages upload, render, and stay unavailable to non-members.
- Group creation works, creator is owner/admin, admin can add/promote members, and disappearing timer labels appear.
- Reports can be submitted, including fetishization/chaser report reason.
- During the current same-night alpha only, signup requires the alpha password, the floating alpha bug button submits support requests with page context, screenshots are allowed for alpha feedback, and every session/login/signup path stops working after `2026-07-28 11:59 PM America/New_York`.
- Expired messages do not return from the messages API.
- Backups run successfully and a restore drill has been completed.

## Current Branch Behavior

- Encrypted media writes use local filesystem storage in development and tests.
- Production must use the S3-compatible object storage driver.
- Media bytes are encrypted by the API before object storage upload.
- Object storage receives ciphertext, not plaintext media.
- Postgres stores object keys, encrypted data-key metadata, moderation status, PhotoDNA status, owner, media type, and key version.
- Stream receives moderation inputs as needed, but cruush-owned encrypted storage remains the source of truth.
