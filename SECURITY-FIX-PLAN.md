# cruush security fix plan — snapshot photo URLs and credential hygiene

Written 2026-08-12. Production is on `bed2ed0944abcf6cbf05a9e4901f7a6714ba77e7`
and must keep serving throughout. Every phase is ordered so the deployed app
never depends on something that has already been revoked.

Authorization gates: nothing below the "already done" section runs without an
explicit go-ahead per phase. Release A
(`Cruushv2-release-a-credential-url-compat-20260811`) stays frozen and is not
part of this plan. Julien's active bug-fix worktrees are untouched.

## Already done (local only, nothing deployed)

- Hotfix built on branch `hotfix/snapshot-photo-null` in the isolated worktree
  `/Volumes/good/Cruushv2-hotfix-snapshot-photo-20260812`, based on the exact
  production SHA:
  - `server/src/cruush-schema.ts`: the `photo` field is still accepted for
    client compatibility but every value becomes `null` (no more URL storage,
    no scheme or credential edge cases left).
  - `server/src/routes/cruush.ts`: `photo: null` hardcoded at the storage
    boundary as a second layer.
  - `src/app/lib/cruushApi.ts`: the web client always sends `photo: null`.
  - `server/src/cruush-schema.test.ts`: regression tests for
    credential-bearing, `javascript:`, plain HTTPS, non-string, and omitted
    photo values, plus strict-key rejection.
- Evidence so far: schema tests 6/6 passed, client cruushApi tests 3/3 passed,
  server `tsc` clean, `vite build` passed, `security:check` and product-name
  casing checks passed. Not committed yet (blocked — see below), not pushed,
  not deployed.
- Count-only audit script written and smoke-tested against the local dev
  database: `server/scripts/audit-snapshot-photos-count-only.ts`. It prints
  counts only, never stored values, and is read-only.

## Local blocker (user action required)

System git fails with "You have not agreed to the Xcode license agreements",
which also breaks the publication contract hook. Run in Terminal:

    sudo xcodebuild -license accept

Until then no cruush commit can pass the contract hook.

## Phase 1 — revoke the Coolify API token, then deploy the hotfix via the UI

Order note: revoking the token first (per the audit direction) means the
release script cannot deploy, so the hotfix ships through the Coolify UI
Deploy button instead, which the token does not gate.

1. Revoke the current Coolify API token in the Coolify UI (already open in ego
   lite). Its endpoint is plain HTTP, so the token crosses the network in
   cleartext; no replacement is created until the dashboard has HTTPS.
2. Commit the hotfix (after the Xcode license fix), push the branch, open a PR
   into `main`, merge after CI.
3. Deploy `cruush-api` and `cruush-frontend` from the Coolify UI.
4. Environment variables changed by this deploy: none. The hotfix adds,
   removes, and renames no variables.
5. Verify (mandatory gates): `https://api.cruush.app/health` healthy; real
   sign-in on `https://www.cruush.app` and one real cruush send succeeds;
   container logs clean.

## Phase 2 — HTTPS for Coolify, then a replacement token

1. Put the Coolify dashboard behind HTTPS (DNS name plus certificate, or
   Coolify's own instance-domain setting).
2. Only after HTTPS works: create a replacement API token with least
   privilege, an expiration, and IP restrictions; store it only in
   `.env.coolify.local` files; update the copy in `Cruushv2-main`.

## Phase 3 — audit stored data, then clean it

1. Run the count-only audit inside the production API container (read-only):
   `docker exec <api-container> npx tsx scripts/audit-snapshot-photos-count-only.ts`.
2. Take and seal a database backup before any cleanup; keep all existing logs
   and backups until the investigation is closed.
3. If counts show stored photo URLs: transactional cleanup — null out legacy
   `cruushes.to_user_photo` values and re-encrypt affected cruush records with
   `photo: null`. Cleanup script to be written once the counts are known, and
   it runs only with separate explicit authorization.

## Phase 4 — DATABASE_URL rotation (zero downtime)

The production `DATABASE_URL` (postgres superuser on the "clone-postgres"
resource) is confirmed exposed in four plaintext files on local disk. Rotation
follows the already-agreed ordering: backup; create an app-scoped
`cruush_app` role and transfer table ownership; test the new credential from
the docker network; update `DATABASE_URL` in Coolify; redeploy `cruush-api`;
verify health, sign-in, and logs; only then rotate the superuser password;
finally delete the four plaintext files:

- `/Volumes/good/Cruushv2-1/.env.coolify-staging-api.generated` (+ README)
- `/Volumes/good/Cruushv2-1.worktrees/test-notifications-onboarding/.env.coolify-staging-api.generated` (+ README)
- `/Volumes/good/Cruushv2-1.worktrees/landing-page-liquid-glass-antigravity/.env.coolify-staging-api.generated` (+ README)
- `/Volumes/good/Adobe Illustrator 2025/Cruushv2-1/.env.coolify-staging-api.generated` (+ README)

Also in this phase: configure scheduled backups on the production database in
Coolify (none exist today).

## Phase 5 — permanent controls

- Protect `main` on GitHub: require pull requests, CI checks, and owner
  approval; block direct and force pushes.
- Enable GitHub secret scanning and push protection (currently disabled).
- Add CODEOWNERS.
- Remove `--skip-checks`, `git add -A`, and direct `HEAD:main` deployment
  paths from the release tooling; require staging (or authenticated smoke)
  proof before manual production promotion of the same SHA.
- Restore a strict public-HTTPS URL validator as the only way to introduce any
  future user-supplied URL field, with security-invariant tests that fail if a
  permissive validator reappears.
- Fix the contract hook's worktree handling (it currently warns "git hooks not
  inspectable" in linked worktrees) so enforcement inspects the right checkout.
- Keep intentional moderation and Web Push capability URLs separate from any
  public snapshot URL logic.
- Clone the repository fresh and audit full git history there (the local
  repository has corrupt objects, so local history scans are incomplete).

## Rollback

- Hotfix deploy: redeploy the previous image from Coolify (production SHA
  `bed2ed0944...` remains the fallback).
- Database role switch: point `DATABASE_URL` back at the old credential and
  redeploy — valid until the final superuser rotation step.
- Token revocation: a new token can be created at any time from the UI.
