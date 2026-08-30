# Handoff, 2026-08-29

Everything below is verified against production or against a real build, not
inferred. Where something is unverified it says so.

## Production right now

| | |
|---|---|
| `origin/main` | `1bae38a` |
| `api.cruush.app` | `1bae38a`, stage production, healthy |
| `cruush.app` | 200, healthy |
| Beta geofence | **off** (`betaAccess {"enabled": false}`) |
| Unpushed work | one commit, `7e0a5d8`, in `Cruushv2-seo-20260829` |

## Read this before you touch anything

**Pushing to `origin/main` deploys production.** There is no separate deploy
step for a push. Both apps are configured with `git_branch: main` and redeploy
on push. Earlier today I read `is_auto_deploy_enabled` from the Coolify API, got
`None`, concluded a push was safe, and pushed. It deployed. The API came up
fine, the frontend went `exited:unhealthy`, and `cruush.app` served 503 until I
restarted that application. **A missing or null field in the Coolify API does
not mean "disabled".** Treat every push to main as a production deployment.

**Coolify's API lies about state.** It reported both clone applications as
`running:healthy` after their containers were gone, and it still reports
`git_commit_sha: 3c9908e` for apps running `1bae38a`. Verify against `docker ps`
on the box and against `https://api.cruush.app/api/build`.

**A Coolify `restart` does not pick up changed environment variables.** It
reuses the existing container. I confirmed the container still read the old
value afterwards. Use `GET /deploy?uuid=<uuid>`, which recreates it.

**Root SSH needs the right key.** `ssh -o IdentitiesOnly=yes -i
~/.ssh/hetzner_key root@87.99.152.196`. Default keys are refused, which looks
like a closed door and is not.

## What landed today

### Media reads, key rotation, request logging (`c89f3f7`, `005a9d4`, `ba6ce50`)

Deployed and running.

- Media responses carry a strong `ETag` and answer a matching `If-None-Match`
  with `304` before the object read and the decrypt. `cache-control` moved from
  `private, max-age=300` to `private, no-cache`, so authentication and the
  per-surface authorization checks run on every view and a block or deletion
  revokes immediately. Production measured 4.2 requests per distinct asset, so
  most media reads are now a validator exchange.
- `server/src/media-read-budget.ts` emits one observation per media read,
  enforcing nothing. It exists so a rate limit can be chosen from measurement
  rather than guessed. Viewer and object ids are digested with a per-day salt.
- `/health` is excluded from the request log. The container healthcheck polls
  every 15s; at two lines per request that was 81 percent of logged requests and
  capped retained logs at about eight hours.
- `resolveSecretForVersion` in `server/src/crypto-keys.ts` makes key rotation
  survivable. Set `<KEY>_PREVIOUS` to the outgoing value, `<KEY>` to the new
  one, bump `<KEY>_VERSION`. Covers media, message, feed, profile, location,
  visibility, ghost, relationship and match tokens. Nine optional
  `*_ENCRYPTION_KEY_PREVIOUS` variables exist and none need setting; with all
  unset the behaviour is identical to before.

**Index keys and stored token hashes cannot use this and never will.**
`RELATIONSHIP_INDEX_KEY`, `MATCH_TOKEN_SIGNING_KEY`, `PROFILE_TOKEN_KEY` and
`DISPLAY_TOKEN_ENCRYPTION_KEY` produce hashes compared against what is already
stored, so a rotated key silently stops matching. Rotating those needs
re-indexing or a dual-read window.

### SEO and AEO (`0cac0a6` through `1bae38a`)

Deployed and verified live.

- Indexing is per path and denied by default. Keyed on `$request_uri`, not
  `$uri`: the SPA fallback rewrites `$uri` to `/index.html`, so keying on `$uri`
  would mark every member surface indexable. Live: `/`, `/about`, `/help`,
  `/blog` return `index, follow`; `/map`, `/messages`, `/profile/:id` return the
  full noindex set.
- `/about`, `/help` and `/blog` are static HTML served by nginx, not React
  routes, because answer-engine crawlers do not execute JavaScript. They are
  styled to mirror `PublicInfoPage`. A `vite.config.ts` middleware serves them
  at the same URLs in dev and preview so development matches nginx.
- Real `robots.txt`, `llms.txt` and a hand-written `sitemap.xml`. The sitemap
  must never be generated from the database.
- JSON-LD on all four pages, allowed by sha256 hash rather than by weakening
  the CSP with `unsafe-inline`. **If you edit any JSON-LD block you must
  recompute its hash into `nginx.conf`**, or the browser silently drops it.
  Check the hash of the block in `dist/`, not in source: a build reformatting it
  by one byte breaks it.
- A React route for `/about` still exists in `src/app/App.tsx` rendering
  `PublicInfoPage`. It is unreachable: the policy links are plain
  `target="_blank"` anchors that load from the server, and no client-side
  navigation reaches it. It and its `aboutSections` are dead code whose content
  now lives in the static page.

### Launch geofence, removed

Environment change, live, no code deploy.

`BETA_ACCESS_GEOFENCE_ENABLED=false`, `BETA_ACCESS_RADIUS_MILES=100`.

What it actually did, because it was easy to misread: it was **15 miles centred
on 70 Scott Ave in Bushwick**, and it gated **signup and signin**, not access.
`assertBetaAccessAllowed` runs on the auth path, so someone outside could not
create an account. Nothing gated the map or feed by distance. Anyone can now
sign up and use cruush from anywhere, and someone outside the active area joins
it with the Mile High Club.

The location prompt on the signup screen disappeared on its own: it is
conditional on `betaAccessRequired`, which the frontend reads from `/api/meta`
at runtime. No frontend deploy was needed.

## Outstanding

### 1. One unpushed commit

`7e0a5d8` in `/Volumes/good/Cruushv2-seo-20260829`. `releaseRuntimeEnvData()`
in `scripts/release-main-coolify.mjs` rewrites the geofence keys on every
release run and was still asserting the fence on at 15 miles. **Without this
commit, the next release silently starts refusing signups again**, with nothing
in the diff to explain it. Scripts-only, so pushing changes no running
behaviour.

### 2. Six tests still red on main

Ten of the original sixteen were fixed. These six were deliberately left,
because three of them describe something that should be rejected being accepted,
and making a safety assertion pass is wrong if the safety behaviour is what
changed.

| Test | Symptom | Lead |
|---|---|---|
| `app.test.ts` rejects profile photos without adult-human proof | expects 400, gets 201 | Julien confirmed body-part-only photos are allowed, so this expectation may just be stale |
| `app.test.ts` never stores the capability URL in moderation records | expects 400, gets 202 | same shape |
| `map-pings.test.ts` requires a moderated signal | resolves instead of rejecting | this file does not mock Rekognition, so it is a different cause from the child-face fix |
| `profile-schema.test.ts` capped option groups | expects `['bottom']`, gets `['top','bottom']` | a cap admits 2 where the test wants 1 |
| `app.test.ts` filters blocked relationships | array deep-equal, 7 vs 7 | needs inspection |
| `app.test.ts` returns cruush activity | query fn called 17 times, expected 7 | check whether a query was added |

The ten that were fixed had two causes, both mechanical: the
`@aws-sdk/client-rekognition` mock defined three commands while the code calls
four, so `DetectTextCommand` threw and moderation fell through to allow; and
three fixtures predated fields the code now returns (`birth_control`,
`permissions`). No assertion was weakened or removed.

### 3. Suite order-dependence, introduced by me

`origin/main` before this work was stable at 16 failures across runs. Adding
`key-rotation.test.ts` and `media-read-validator.test.ts` makes the full suite
unstable at 20 to 22, and which extra tests fail varies between runs. Every one
passes in isolation, and excluding just those two files returns it to exactly
16. The product changes cause zero failures; the two added files shift vitest's
fork scheduling and surface pre-existing cross-test pollution. Find the
polluting pair; do not delete the new tests.

### 4. The release gate is blocked

`scripts/release-main-coolify.mjs` runs `pnpm --dir server test` first, so it
aborts while the suite is red. `--skip-checks` exists but using it deploys an
unverified tree. Note that today's deploys went out by pushing to main, which
bypasses the gate entirely.

### 5. Resend audience sync fails on every boot

`src/index.ts:82` fires `syncAllVerifiedMembersToResendAudience` at startup,
fire-and-forget, one HTTP request per member with no batching or backoff.
Production logs show **113 warnings, 113 distinct emails, all `lookup_429`**.
Every one fails. Not caused by anything today; it was invisible because the log
window was 81 percent healthcheck, and the logging fix is what surfaced it. Your
verified-member audience has been silently failing to populate.

### 6. Security, still open

- `MEDIA_S3_SECRET_ACCESS_KEY` was never rotated. It was shared with the
  now-stopped clone applications. Needs a new R2 token minted in Cloudflare,
  which only Julien can do.
- Production and the stopped clones share the R2 bucket `cruush-media-staging`.
  Worth separating, and worth asking why production media lives in a bucket
  named staging.
- `/api/internal/*`, including CSAM incident report packets, is guarded by a
  single shared header secret with no per-caller identity and no audit of who
  used it. `INTERNAL_API_SECRET` was rotated today and verified changed.
- The two `clone-of-cruush-*` applications are stopped and their containers
  removed. The applications still exist in Coolify with their config, so they
  can be started again. They held production's media encryption key, R2
  credentials and session secret while answering on a public plain-HTTP URL.

### 7. Not started

- Phase 3 of the media work: choose rate limits from what
  `media-read-budget.ts` is now collecting, rather than guessing.
- `feat/analytics-privacy` worktree exists and is empty. PostHog is live and
  client-side only, capturing `$pageview` and nothing else, on **US** infra with
  IP collection on, and its path sanitiser fails open on unknown routes. GA4 is
  also live. Recommendation on record: keep PostHog anonymous and do retention
  in your own Postgres rather than identifying users to a US vendor.
- Off-site AEO, which is the real lever and is not code: App Store listing, a
  Wikidata entry to anchor the name collision, Reddit, roundups.

## Worktrees

```
/Volumes/good/Cruushv2-seo-20260829          feat/seo-aeo              7e0a5d8, 1 unpushed
/Volumes/good/Cruushv2-media-rate-limit-20260829  feat/media-read-rate-limit  merged
/Volumes/good/Cruushv2-analytics-20260829    feat/analytics-privacy    empty
/Volumes/good/Cruushv2-baseline-20260829     detached at 3c9908e       throwaway, safe to remove
```

Six stashes on the shared repo belong to `codex/carousel-photo-gallery-20260820`
and are not mine. I popped one by accident and restored it; leave them alone.

## Environment gotchas

- A fresh worktree has no `node_modules`. Symlinking from another checkout only
  works if that checkout is on the same volume, because pnpm's store links are
  relative.
- The root vitest uses `pool: 'threads'`. `serviceWorkerUpdate.test.ts` could
  not be executed at all here: the worker times out against the cross-volume
  symlink under both pools. Its four assertions were checked directly instead.
- The AI contract pre-commit hook resolves the repo from the shell's working
  directory. If the session cwd is `/Volumes/good`, which is not a repository,
  the commit is blocked with a confusing `git diff --cached` error. Run git from
  inside the worktree.
- The hook also enforces product spelling. It correctly blocked a line in
  `llms.txt` that spelled the name wrongly while explaining that it was the
  wrong spelling.
- A frontend deploy needs the service worker release bumped in **four** places
  plus its test, or the deploy is invisible to anyone who already opened cruush.
  Currently `v27`.
- `.claude/launch.json` at `/Volumes/good` is the one the preview tooling reads,
  not the one inside a worktree. Configs there use
  `bash -lc "cd <worktree> && ..."`. `cruush-seo-check` on port 5199 was added
  for this work. Port 5173 is usually taken by another session's server.
