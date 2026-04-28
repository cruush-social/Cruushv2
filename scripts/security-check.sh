#!/usr/bin/env bash
set -euo pipefail

status=0

fail() {
  printf 'security:check failed: %s\n' "$1" >&2
  status=1
}

tracked_env_files="$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -Ev '(^|/)\.env\.(example|sample|template)$' || true)"
if [[ -n "$tracked_env_files" ]]; then
  printf '%s\n' "$tracked_env_files" >&2
  fail "tracked env files must be removed from git"
fi

untracked_env_files="$(git ls-files --others --exclude-standard | grep -E '(^|/)\.env($|\.)' | grep -Ev '(^|/)\.env\.(example|sample|template)$' || true)"
if [[ -n "$untracked_env_files" ]]; then
  printf '%s\n' "$untracked_env_files" >&2
  fail "untracked env files are not ignored correctly"
fi

tracked_private_files="$(git ls-files | grep -Ei '(^|/)(id_rsa|id_dsa|id_ecdsa|id_ed25519|.*\.(pem|key|p12|pfx))$' || true)"
if [[ -n "$tracked_private_files" ]]; then
  printf '%s\n' "$tracked_private_files" >&2
  fail "tracked private key or certificate files are not allowed"
fi

untracked_private_files="$(git ls-files --others --exclude-standard | grep -Ei '(^|/)(id_rsa|id_dsa|id_ecdsa|id_ed25519|.*\.(pem|key|p12|pfx))$' || true)"
if [[ -n "$untracked_private_files" ]]; then
  printf '%s\n' "$untracked_private_files" >&2
  fail "private key or certificate files are not ignored correctly"
fi

frontend_secret_env_refs="$(grep -RInE 'import\.meta\.env\.VITE_[A-Z0-9_]*(SECRET|TOKEN|PRIVATE|SERVICE|ROLE|PASSWORD|DATABASE|DB)' src utils --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' 2>/dev/null || true)"
if [[ -n "$frontend_secret_env_refs" ]]; then
  printf '%s\n' "$frontend_secret_env_refs" >&2
  fail "secret-like VITE_* environment variables are exposed to the browser"
fi

frontend_server_secret_refs="$(grep -RInE '(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|PRIVATE_KEY|DATABASE_URL|SESSION_SECRET|SEED_SECRET)' src utils --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' 2>/dev/null || true)"
if [[ -n "$frontend_server_secret_refs" ]]; then
  printf '%s\n' "$frontend_server_secret_refs" >&2
  fail "server-only secret names must not appear in frontend code"
fi

private_key_material="$(git grep -nE 'BEGIN (RSA |OPENSSH |DSA |EC |)?PRIVATE KEY' -- . 2>/dev/null || true)"
if [[ -n "$private_key_material" ]]; then
  printf '%s\n' "$private_key_material" >&2
  fail "private key material appears in tracked files"
fi

known_token_material="$(git grep -nE '(ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,})' -- . 2>/dev/null || true)"
if [[ -n "$known_token_material" ]]; then
  printf '%s\n' "$known_token_material" >&2
  fail "known token pattern appears in tracked files"
fi

if [[ "$status" -eq 0 ]]; then
  printf 'security:check passed\n'
fi

exit "$status"
