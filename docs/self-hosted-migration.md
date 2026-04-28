# Self-Hosted Migration Plan

This repo is currently using Supabase for three different jobs:

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

## What to migrate first

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

- Profiles are already app-owned through `GET /api/profiles/me` and `PUT /api/profiles/me`.
- Posts are already app-owned through `GET /api/posts` and `POST /api/posts`.
- Cruush activity/actions are already app-owned through `GET /api/cruush/:userId` and `POST /api/cruush`.
- The next remaining function slices are users/discovery and messages/conversations.

### Phase 3

Replace Supabase auth with app-owned session auth.

Recommended shape:

- email/password auth
- secure httpOnly session cookies
- password reset flow
- email verification only if product needs it immediately

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

## Recommended next coding step

Implement app-owned user discovery routes:

- `GET /api/users`
- optional seed/dev-only helpers outside the public app surface

Once those exist, update `MapHome.tsx` and the map/feed discovery surfaces to stop depending on the old Supabase `users` edge function. After that, migrate messages and conversations.

## Phase 1 notes

- The temporary `x-user-id` header is only a migration boundary while Supabase auth remains on the frontend. It is not production authentication.
- Before shipping this API publicly, replace that header with app-owned auth and add request rate limiting on profile writes, ideally per user and per IP.
