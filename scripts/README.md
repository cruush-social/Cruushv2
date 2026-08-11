# Repo Scripts

## `commit.sh`

Quick commit helper.

Examples:

```bash
scripts/commit.sh "checkpoint: working on auth migration"
scripts/commit.sh --check "pnpm test src/app/App.test.tsx" "test(app): add auth shell smoke test"
```

## `security-check.sh`

Checks for tracked env files, private key material, known token patterns, and secret-like frontend `VITE_*` usage.

```bash
npm run security:check
```

## `run-regression-gates.mjs`

Runs the mandatory local release gate: product casing, copy, security, layout,
all frontend tests and build, all server tests and build, and whitespace checks.
Both release helpers invoke this command and do not provide a skip flag.

```bash
pnpm regression:gate
```

GitHub Actions adds two checks that need dedicated infrastructure: real
PostgreSQL migration, reward, and account-deletion integrity tests; and mobile
Chromium interaction tests for map menus, pin gestures, Ghost/DL rendering,
Ping, and navigation. A local pass does not replace those required checks or
live-flow verification.

## `release-main-coolify.mjs`

Pushes a reviewed branch to `origin/main`, sets the Coolify app branch to `main`, applies the launch runtime envs, triggers Coolify deployments, and smokes the public URLs.

Required shell envs:

```bash
export COOLIFY_API_BASE_URL="https://<your-coolify-host>/api/v1"
export COOLIFY_API_TOKEN="<coolify-api-token>"
export COOLIFY_STAGING_FRONTEND_UUID="<staging-frontend-uuid>"
export COOLIFY_STAGING_API_UUID="<staging-api-uuid>"
export COOLIFY_PRODUCTION_FRONTEND_UUID="<production-frontend-uuid>"
export COOLIFY_PRODUCTION_API_UUID="<production-api-uuid>"
```

Do not paste the token into chat, docs, screenshots, or commits. The script does not read `.env` files, so set the values in the shell that runs the command.

Dry-run production release to `cruush.app`:

```bash
node scripts/release-main-coolify.mjs --source main --target production --confirm-production
```

Live production release to `cruush.app`:

```bash
node scripts/release-main-coolify.mjs --source main --target production --confirm-production --no-dry-run
```

Use `--target both` when staging should deploy before production. The worktree must be clean, and checks run by default: server tests, server build, frontend tests, frontend build, and `git diff --check`.

Focused guardrail test:

```bash
npm run test:release-coolify
```

That test fails if the release guard would allow the API to stay on a stale Coolify branch, a stale pinned commit, missing source-commit build args, a missing `/api/build` route, a mismatched SHA, or a non-production live stage.
