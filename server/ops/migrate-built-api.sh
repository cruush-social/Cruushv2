#!/bin/sh
# Coolify executes this after building and before stopping the running API.
set +x
set -eu
compose_file=${1:-server/compose.v2.yml}
image=$(docker compose --env-file /dev/null -f "$compose_file" config --no-env-resolution --no-interpolate --images api)
case "$image" in ''|*[!a-zA-Z0-9_./:@-]*) echo 'Candidate API image is not resolved.' >&2; exit 1;; esac
# Resolve the tag once; the migration runs immutable bytes even if a tag moves.
image_id=$(docker image inspect --format '{{.Id}}' "$image")
image_sha=$(docker image inspect --format '{{range .Config.Env}}{{if eq (index (split . "=") 0) "APP_BUILD_SHA"}}{{index (split . "=") 1}}{{end}}{{end}}' "$image_id")
source_sha=${2:-}
resource_uuid=${3:-}
case "$resource_uuid" in ''|*[!a-zA-Z0-9]*) echo 'Deployment resource is invalid.' >&2; exit 1;; esac
migration_file=/opt/cruush-migration-private/migration-${resource_uuid}.env
case "$source_sha" in *[!a-fA-F0-9]*|'') echo 'Deployment commit is missing.' >&2; exit 1;; esac
if [ "${#source_sha}" -ne 40 ]; then echo 'Deployment commit is invalid.' >&2; exit 1; fi
if [ "$image_sha" != "$source_sha" ]; then
  echo 'Candidate API image does not match the deployment commit.' >&2
  exit 1
fi
case "$image_id" in sha256:*) ;; *) echo 'Candidate API image ID is invalid.' >&2; exit 1;; esac
docker run --rm --network coolify --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --cap-drop ALL --security-opt no-new-privileges \
  --mount "type=bind,src=$migration_file,dst=/run/cruush/migration.env,readonly" \
  --entrypoint node "$image_id" /app/ops/run-migrations.mjs
