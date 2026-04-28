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
