# Handoff: media read hardening and key rotation

Date: 2026-08-29
Branch merged to `main` as `ba6ce50`. Production is **not** running it yet.

## Current state

| Thing | Value |
|---|---|
| `origin/main` | `ba6ce50` |
| Production `api.cruush.app` | `3c9908e` (the commit before this work) |
| Auto-deploy | Disabled on both production apps. Pushing to `main` deploys nothing. |
| Worktree used | `/Volumes/good/Cruushv2-media-rate-limit-20260829` |

Production will not pick this up until someone runs the release script. See
"Deploying" below.

## What landed (3 commits)

**`c89f3f7` — media validators, read observation, healthcheck log noise**

- `sendEncryptedMedia` sends a strong `ETag` derived from the stored object key
  plus its wrapping key version, and answers a matching `If-None-Match` with
  `304` before the object read and the decrypt.
- `cache-control` changed from `private, max-age=300` to `private, no-cache`.
  That means revalidate every view, not do-not-store. Authentication and the
  per-surface authorization checks therefore run on every request, so blocks,
  deletions and withdrawn moderation approvals revoke immediately instead of
  lingering in a browser cache.
- Production logs measured 4.2 requests per distinct asset, so roughly three
  quarters of media reads become a validator exchange rather than a transfer.
- `server/src/media-read-budget.ts` emits one structured observation per media
  read, covering both the 200 and 304 paths. It enforces nothing. Viewer and
  object identifiers are reduced to a digest salted with the UTC day, which
  keeps per-viewer request and distinct-object counts exact within a day
  without recording which member viewed whose photo.
- Fastify request logging moved into hooks so `/health` can be excluded. The
  container healthcheck polls every 15s; at two log lines per request that was
  81 percent of logged requests and capped retained logs at about eight hours.

**`005a9d4` — key rotation**

`resolveSecretForVersion` in `server/src/crypto-keys.ts`. Every encrypted value
already stores the key version it was written under; that version now selects
*which secret* to use, not only the derivation method.

To rotate: set `<KEY>_PREVIOUS` to the outgoing value, set `<KEY>` to the new
value, bump `<KEY>_VERSION`. Old rows keep decrypting, new writes use the new
key, no migration.

Covered: media, message content, feed content, profile sensitive and
visibility, location envelopes, visibility policies, ghost rotations, privacy
audit records, relationship records, match tokens.

**Not covered, and cannot be by this mechanism:** `RELATIONSHIP_INDEX_KEY`,
`MATCH_TOKEN_SIGNING_KEY`, `PROFILE_TOKEN_KEY`, `DISPLAY_TOKEN_ENCRYPTION_KEY`.
These produce hashes compared against what is already stored, so a rotated key
silently stops matching rather than failing loudly. Rotating them needs
re-indexing or a dual-read window.

**`ba6ce50` — test fixture and mock repairs**

Fixed 10 of the 16 tests that were red on `origin/main`. No assertion was
relaxed, weakened or removed.

## Environment variables added

Nine, all on `cruush-api` (server only), all `z.string().optional()` with no
default. Secret when set. **None need setting now** — they are read only during
a rotation, and with all unset the behaviour is byte-identical to before.

```
MEDIA_ENCRYPTION_KEY_PREVIOUS              PROFILE_ENCRYPTION_KEY_PREVIOUS
MESSAGE_ENCRYPTION_KEY_PREVIOUS            RELATIONSHIP_ENCRYPTION_KEY_PREVIOUS
FEED_ENCRYPTION_KEY_PREVIOUS               MATCH_TOKEN_ENCRYPTION_KEY_PREVIOUS
LOCATION_ENCRYPTION_KEY_PREVIOUS           VISIBILITY_POLICY_ENCRYPTION_KEY_PREVIOUS
GHOST_DERIVATION_KEY_PREVIOUS
```

## Work remaining

### 1. Six tests still red on main

These were red before this work and were deliberately left alone. Three of them
describe *something that should be rejected being accepted*, so they may be
behaviour changes rather than test drift. Do not make a safety assertion pass
without first establishing which.

| Test | Symptom | Lead |
|---|---|---|
| `app.test.ts` rejects profile photos without adult-human proof | expects 400, gets 201 | Julien confirmed photos of just a body part are allowed. This expectation may simply be stale. |
| `app.test.ts` never stores the capability URL in moderation records | expects 400, gets 202 | Same shape as above. |
| `map-pings.test.ts` requires a moderated signal | resolves instead of rejecting | This file does not mock Rekognition at all, so it is a different cause from the child-face fix. |
| `profile-schema.test.ts` limits explicitly capped option groups | expects `['bottom']`, gets `['top','bottom']` | A validation cap admits 2 where the test wants 1. Check whether the cap changed deliberately. |
| `app.test.ts` filters blocked relationships from `GET /api/posts` | array deep-equal, 7 vs 7 | Needs inspection. |
| `app.test.ts` returns cruush activity | a query fn called 17 times, expected 7 | Query count changed; check whether a new query was added. |

### 2. Suite order-dependence (introduced here, needs fixing)

`origin/main` before this work was **stable** at 16 failures across repeated
runs. With the two new test files (`key-rotation.test.ts`,
`media-read-validator.test.ts`) the full suite becomes **unstable at 20-22**,
and the extra failures differ between runs. Every one of them passes in
isolation.

Verified: running the full suite with only those two files excluded returns to
16, matching baseline exactly. So the product changes cause zero failures; the
two added files shift vitest's fork scheduling (`pool: forks`, `maxWorkers: 4`)
and surface pre-existing cross-test pollution.

Next step is to find the polluting pair, not to delete the new tests. Start by
bisecting which file pairs share a worker.

### 3. Release is blocked until the suite is green

`scripts/release-main-coolify.mjs` runs `pnpm --dir server test` as its first
preflight check, so it aborts before deploying anything while the suite is red.
`--skip-checks` exists but using it would deploy an unverified tree.

### 4. Still open, unrelated to this branch

- `MEDIA_S3_SECRET_ACCESS_KEY` was never rotated. It was shared with the
  now-stopped clone apps. Needs a new R2 token minted in Cloudflare.
- Production and the stopped clones share the R2 bucket `cruush-media-staging`.
  Worth separating, and worth questioning why production media lives in a
  bucket named staging.
- The `/api/internal/*` routes, including CSAM incident report packets, are
  guarded by a single shared header secret with no per-caller identity and no
  audit of who used it.
- Phase 3 of the media work: choose rate limits from the observations that
  `media-read-budget.ts` is now collecting, rather than guessing them.

## Deploying

Nothing deploys on push. To actually ship:

```
node scripts/release-main-coolify.mjs --source main --target production --confirm-production --no-dry-run
```

Requires a clean worktree and the `COOLIFY_*` environment variables. Confirm
what landed by reading `https://api.cruush.app/api/build`, which returns the
running `sha` and `stage`.

## Gotchas for whoever picks this up

- Root SSH to the box needs the right key: `ssh -o IdentitiesOnly=yes -i
  ~/.ssh/hetzner_key root@87.99.152.196`. Default keys are refused, which looks
  like a closed door but is not.
- The Coolify API hides env *values* (they come back empty). To compare
  configuration between apps, `docker inspect` on the box instead.
- Coolify's application list can report a stopped app as `running:healthy` for
  a while. Trust `docker ps`, not the API's status field.
- A fresh worktree has no `node_modules`. Symlinking
  `server/node_modules` from another checkout works only if that checkout is on
  the same volume, because pnpm's store links are relative.
- Vitest needs `pool: forks` here; it is already set in `vitest.config.ts`.
- The AI contract pre-commit hook resolves the repo from the shell's working
  directory. If the session cwd is `/Volumes/good`, which is not a repository,
  the commit is blocked with a confusing `git diff --cached` error. Run git
  from inside the worktree.
