# Self-Hosted Migration Plan

This repo started with Supabase doing three different jobs:

1. Auth via `supabase.auth.*`
2. Direct table access to `profiles`
3. Server-side endpoints through Supabase Edge Functions

If the goal is the cheapest scalable path, the first move is not "replace Supabase with another hosted service." The first move is to own the backend surface area.

## Recommended open beta architecture

- One production VPS sized for city beta traffic
- Coolify installed on that VPS
- One PostgreSQL instance
- One Node API service
- Static frontend deployed separately or through Coolify
- Private S3-compatible object storage for encrypted media
- Backups to S3-compatible object storage

## Why this is the cheap path

- PostgreSQL is the durable core; it replaces the managed database bill.
- A small Node API lets the frontend stop calling Supabase directly.
- Coolify gives you deployment, SSL, logs, and database management without forcing platform lock-in.
- You only add storage and background jobs when the product actually needs them.

## Current status

Completed backend slices:

- app-owned auth and session cookies
- email verification flow
- profiles API
- posts API
- cruush API
- users/discovery API
- conversations/messages API
- direct-message open/create flow from profile and map actions

Security status:

- browser auth is now cookie-based
- the old `x-user-id` header path is test-only and no longer accepted in local development or production
- frontend `VITE_SUPABASE_*` config has been removed from the example env surface

That means the main product loop is now on the app-owned backend. This is the point where Coolify deployment stops being premature and becomes the correct next step.

## What was migrated

### Phase 1

Build our own backend and move read/write access for profiles behind it.

Targets:

- `utils/supabase/client.ts`
- `src/app/components/Auth.tsx`
- `src/app/components/ProfileOnboarding.tsx`
- `src/app/components/ProfileEdit.tsx`

### Phase 2

Replace the current Supabase function endpoints with our own API routes.

Current Supabase-shaped endpoints in the frontend:

- `/server/users`
- `/server/posts`
- `/server/conversations`
- `/server/messages`
- `/server/cruush`

Current migration status:

- Profiles are app-owned through `GET /api/profiles/me` and `PUT /api/profiles/me`.
- Posts are app-owned through `GET /api/posts` and `POST /api/posts`.
- Cruush activity/actions are app-owned through `GET /api/cruush/:userId` and `POST /api/cruush`.
- Users/discovery is app-owned through `GET /api/users`.
- Conversations/messages are app-owned through:
  - `POST /api/conversations/dm`
  - `GET /api/conversations`
  - `GET /api/messages/:conversationId`
  - `POST /api/messages`

### Phase 3

Replace Supabase auth with app-owned session auth.

Status:

- email/password auth is implemented
- secure httpOnly session cookies are implemented
- email verification is implemented
- password reset flow is still pending if you want it

### Phase 4

Add object storage for open beta media.

Recommended default:

- Cloudflare R2 Standard private buckets
- keep original encrypted objects private
- serve photos through authenticated API routes
- use the API server to encrypt media bytes before upload

## Coolify role

Coolify is not your backend. It is your control panel for self-hosting:

- deploy the API
- run PostgreSQL
- manage env vars
- attach domains and SSL
- schedule backups

## First deliverable in this repo

The `server/` folder is the first slice:

- Fastify API
- PostgreSQL connection
- `/health` route
- `/api/meta` route
- Dockerfile for deployment
- `docker-compose.selfhost.yml` for local bring-up

## Next step: Coolify

The next work is operational. For city beta, use a US-East production VPS, preferably Ashburn, VA, with at least `8 vCPU / 16 GB RAM / 160 GB SSD`. Use `4 vCPU / 8 GB` only for staging or very early testing.

1. Provision three services in Coolify
   - frontend
   - API (`server/`)
   - PostgreSQL

2. Set production env vars on the API
   - `NODE_ENV=production`
   - `DATABASE_URL`
   - `CORS_ORIGIN`
   - `SESSION_SECRET`
   - `APP_URL`
   - `MAIL_FROM`
   - `RESEND_API_KEY`
   - `MEDIA_OBJECT_STORAGE_DRIVER=s3`
   - `MEDIA_S3_BUCKET`
   - `MEDIA_S3_ENDPOINT`
   - `MEDIA_S3_REGION=auto`
   - `MEDIA_S3_ACCESS_KEY_ID`
   - `MEDIA_S3_SECRET_ACCESS_KEY`
   - all server-side encryption keys documented in `server/.env.example`

3. Apply SQL migrations in order
   - `server/sql/003_profiles_migration_slice.sql`
   - `server/sql/004_posts.sql`
   - `server/sql/005_cruushes.sql`
   - `server/sql/006_auth_session_upgrade.sql`
   - `server/sql/007_email_verification_tokens.sql`
   - `server/sql/008_messages.sql`
   - `server/sql/009_direct_messages.sql`
   - `server/sql/010_profile_locations.sql`
   - `server/sql/011_password_reset_tokens.sql`
   - `server/sql/012_substance_boundaries.sql`
   - `server/sql/013_kink_fetish_interests.sql`
   - `server/sql/014_profile_role_and_kink_visibility.sql`
   - `server/sql/015_profile_sensitive_tokens.sql`
   - `server/sql/016_profile_visibility_rules.sql`
   - `server/sql/017_rate_limit_buckets.sql`
   - newer checked-in migrations through `server/sql/024_open_beta_storage_messaging.sql`

   The server Docker image runs `npm run migrate` before `npm run start`, so normal container deploys apply the checked-in idempotent migrations automatically. If staging is already running an older image or a custom start command, run `npm --prefix server run migrate` once with the staging `DATABASE_URL`.

4. Point the frontend at the deployed API
   - either same-origin through the reverse proxy
   - or `VITE_API_BASE_URL=https://api.cruush.app`

5. Smoke-test the real product loop
   - signup
   - onboarding
   - verification email
   - map load
   - profile open
   - send cruush
   - open DM
   - send message
   - upload profile photo through encrypted object storage
   - create group chat
   - verify banned feed/profile language is rejected
   - verify backups run and one restore drill succeeds

6. Configure backups
   - daily Postgres backups to private S3/R2-compatible storage
   - 14-30 day retention for open beta
   - disk alerts before beta
   - VPS snapshots as secondary recovery only

## Local development

For local testing that does not affect staging:

1. Start local Postgres
   - `docker compose -f docker-compose.selfhost.yml up -d postgres`

2. Copy the env examples
   - optional if you want to override the defaults
   - `cp .env.local.example .env.local`
   - `cp server/.env.local.example server/.env.local`

3. Run the local stack
   - `npm run dev:local`

The local launcher applies server migrations first, then starts:
- the local API on `http://localhost:3001`
- the frontend on `http://localhost:5173`

It reads `server/.env.example` as the fallback local server config, so the copy step is only needed when you want to override the defaults.

If you want auth emails to return to staging while you are testing locally, set `APP_URL=https://staging.cruush.app` in `server/.env.local`. That changes the callback target only; it does not affect staging deployment settings.

## Remaining backend work after deployment

- password reset flow
- rate limiting on auth/profile/message routes
- photo/object storage migration
- pruning the last Supabase dependency and any dead migration code
