#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/commit.sh "commit message"
  scripts/commit.sh --check "command to run first" "commit message"

Examples:
  scripts/commit.sh "checkpoint: working on auth migration"
  scripts/commit.sh --check "pnpm test src/app/App.test.tsx" "test(app): add auth shell smoke test"
EOF
}

if [[ $# -eq 0 ]]; then
  usage
  exit 1
fi

check_cmd=""
message=""

if [[ "${1:-}" == "--check" ]]; then
  if [[ $# -lt 3 ]]; then
    usage
    exit 1
  fi

  check_cmd="$2"
  message="$3"
else
  message="$1"
fi

if [[ -n "$check_cmd" ]]; then
  echo "Running check: $check_cmd"
  eval "$check_cmd"
fi

git add -A

if grep -q '"security:check"' package.json; then
  echo "Running security check"
  npm run security:check
fi

if git diff --cached --quiet; then
  echo "Nothing staged. No commit created."
  exit 0
fi

git commit -m "$message"
