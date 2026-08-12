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

## Deployment drift worth checking

The two production containers are running different commits:

- `cruush-api` → `bed2ed0944abcf6cbf05a9e4901f7a6714ba77e7`
- `cruush-frontend` → `e953a99e02832d4c566c8e3f584ae32a65b8ea4d`

Nothing in the audit depends on this, but a frontend and API built from
different commits is worth confirming as intentional.

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

## Phase 3 — audit stored data — COMPLETE, no cleanup needed

The count-only audit was run against production on 2026-08-12 (read-only,
inside the API container; the script was removed from the container and the
host afterwards). Results:

    legacy cruushes.to_user_photo
      total rows:               1
      with photo set:           0
      credential-bearing URLs:  0
      non-HTTPS values:         0

    encrypted_relationship_records
      total records:            2074
      decrypt failures:         6
      cruush records:           214
      snapshots with photo:     0
      credential-bearing URLs:  0
      non-HTTPS values:         0
      (record types: cruush 214, mutual_cruush 27, profile_view 1826,
       removed_cruush 1)

**No snapshot photo URL is stored in production — not one, of any kind.** The
endpoint accepted them, but nothing was ever persisted. The transactional
cleanup originally planned as item 6 is therefore unnecessary and is dropped.

Two follow-ups from this audit:

1. Six encrypted records fail to decrypt with the current key material. Most
   likely an older `RELATIONSHIP_ENCRYPTION_KEY_VERSION`. Worth identifying,
   but not a data-exposure issue.
2. Keep existing logs and backups until the investigation is formally closed.

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

## Backups — DONE

The production database resource had no backup schedule configured. The
previous dumps, which belong to an older Coolify resource entry, stop on
2026-08-03, so production ran for nine days with no backup at all.

A daily 03:00 UTC schedule was added on `clone-postgres`
(`ym4skrhpzi5liz61rc5k7ho4`) and verified by triggering one run: a 5.8 MB
dump was written. Backups are local-only — Coolify reports no validated S3
storage — so an offsite destination is still worth configuring. Disk has
303 GB free, so retention is not a near-term concern.

## Phase 5 — permanent controls

- **DONE** — GitHub secret scanning and push protection are now enabled (both
  were disabled). Alert count is currently 0.
- **DONE (partial)** — `main` now blocks force-pushes and branch deletion.
  Pull requests, CI checks, and review are deliberately *not* required, so the
  existing `pnpm ship` direct-push flow keeps working. Note `enforce_admins`
  is false, so a repository admin can still bypass the force-push block; the
  server-side rejection was not tested, because the only honest test is a real
  force-push to `main`.
- Add CODEOWNERS. Deferred: with no required-review rule it only auto-assigns
  reviewers, so it should land together with any decision to require reviews.
- Remove `--skip-checks`, `git add -A`, and direct `HEAD:main` deployment
  paths from the release tooling; require staging (or authenticated smoke)
  proof before manual production promotion of the same SHA.
- Restore a strict public-HTTPS URL validator as the only way to introduce any
  future user-supplied URL field, with security-invariant tests that fail if a
  permissive validator reappears.

  An audit for other instances of this bug class found one more, now fixed in
  PR #77: the web push subscription endpoint was validated with
  `z.string().url()` and then dereferenced by the server, giving any
  authenticated user a blind server-side request forgery primitive against
  internal hosts. `WEB_PUSH_ENABLED` is true in production, so it was
  reachable. A count-only query confirmed no stored subscription abuses it.

  The audit also surfaced the structural problem behind both bugs:
  `publicHttpsUrlSchema` is correct but had **no production call site at all**
  — its only reference was its own unit test. The snapshot-photo bug removed
  its last real use, and nothing else had ever adopted it. Five further
  candidates were examined and refuted with evidence (support `pageUrl`,
  internal `prUrl`, report `profilePhotoUrl`, client `resolveMediaUrl`, and a
  dead `fallbackPhoto` parameter); none reaches a dangerous sink.
- **DONE** — the contract hook's checkout resolution is fixed. Root cause,
  reproduced deterministically: `claude-contract-hook.mjs` used the shell's
  working directory verbatim as the repository root. Running `git commit` from
  a subdirectory (`server/`) made it look for `server/AI_TASK.json`, and
  running it while the shell sat in a *different* cruush checkout made it
  enforce that checkout's contract — which is why commits were rejected with
  `server/src/…: forbidden by AI_TASK.json` naming paths only the main
  checkout forbids. It now resolves the real root with
  `git rev-parse --show-toplevel`.

  Separately, `resolveHooksDir` in `check-ai-contract.mjs` did not follow a
  linked worktree's `.git` file to the shared hooks directory, producing the
  "git hooks not inspectable" warning. It now reads the `commondir` file.

  Verified with four cases: commit from a subdirectory passes (exit 0),
  commit from a linked worktree passes with no warning (exit 0), an
  out-of-scope staged file is still blocked (exit 2), and invalid product
  casing is still blocked (exit 2). Enforcement is unchanged; only the
  checkout resolution moved. Originals backed up as
  `*.bak-20260812` in `~/.ai/bin/`.

  Note this bug could *under*-enforce as well as over-enforce: with the shell
  in a non-cruush directory, the `isCruush` test could miss and skip contract
  checks entirely.
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
