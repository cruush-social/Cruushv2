# Self-Hosted Migration Plan

This repo started with Supabase doing three different jobs:

1. Auth via `supabase.auth.*`
2. Direct table access to `profiles`
3. Server-side endpoints through Supabase Edge Functions

If the goal is the cheapest scalable path, the first move is not "replace Supabase with another hosted service." The first move is to own the backend surface area.

## Recommended cheap architecture

- One VPS
- Coolify installed on that VPS
- One PostgreSQL instance
- One Node API service
- Static frontend deployed separately or through Coolify
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

Add object storage only when photo upload is ready to move.

Cheapest usual choice:

- S3-compatible bucket
- keep originals private
- serve resized/public variants through the app or CDN later

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

The next work is operational:

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

## Remaining backend work after deployment

- password reset flow
- rate limiting on auth/profile/message routes
- photo/object storage migration
- pruning the last Supabase dependency and any dead migration code
