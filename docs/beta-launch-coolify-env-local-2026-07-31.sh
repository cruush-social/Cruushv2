#!/usr/bin/env bash
# Local copy-paste env for the cruush beta launch Coolify release script.
# Generated from the Coolify browser UI on 2026-07-31.
#
# Do not paste the real API token into chat, docs, screenshots, or commits.
# Set these values in the shell that runs scripts/release-main-coolify.mjs.

export COOLIFY_API_BASE_URL="http://87.99.130.8:8000/api/v1"
export COOLIFY_API_TOKEN="<paste-coolify-api-token-here>"

# Coolify project/environment IDs visible in the browser URL.
# The release script does not use these directly; they are here for lookup.
export COOLIFY_PROJECT_UUID="rjltsuurlqyytejweauzkcqi"
export COOLIFY_PRODUCTION_ENVIRONMENT_UUID="i9eyj8mkwpqrq91t7l322nbi"
export COOLIFY_WAITLIST_ENVIRONMENT_UUID="torevk7cfib9uriceqp5y07k"

# Production apps confirmed in Coolify:
# production frontend: https://cruush.app, https://www.cruush.app
# production backend: https://api.cruush.app, https://moderation-media.cruush.app
export COOLIFY_PRODUCTION_FRONTEND_UUID="osvowruef99ps8pgoa3w5ysp"
export COOLIFY_PRODUCTION_API_UUID="rhacv5wg4rigv1mj6lx08wtc"

# Current script requires these variables even for --target production.
# They are intentionally dummy values for a production-only beta launch.
# Do not use --target staging or --target both until real staging apps are confirmed.
export COOLIFY_STAGING_FRONTEND_UUID="not-used-for-production-only"
export COOLIFY_STAGING_API_UUID="not-used-for-production-only"

# Production dry run:
# node scripts/release-main-coolify.mjs --source main --target production --confirm-production

# Production live run:
# node scripts/release-main-coolify.mjs --source main --target production --confirm-production --no-dry-run

# Fast production live run, only if the commit is already verified:
# node scripts/release-main-coolify.mjs --source main --target production --confirm-production --no-dry-run --skip-checks
