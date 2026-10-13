# Database credential cutover

Prepared 2026-10-13. This is an operator runbook for a future authorized staging rehearsal and production cutover. The local patch does not change any live credentials.

## Target and prerequisites

The read-only production check found that the API connects as the PostgreSQL superuser `postgres`, and that its current password matches the credential retained in four documented plaintext files. That establishes current credential exposure through retained files, not proof of third-party access.

The API should connect as a dedicated non-owner runtime role (`cruush_app`). Schema migration and administrative credentials stay outside the long-running API. Table and sequence ownership remains with the existing migration owner. Transferring ownership to the runtime role would still let that role alter or drop objects.

The server image now defaults to `npm run start` only. Every release that needs schema changes must complete `npm run migrate` in a separate process using the **same candidate image** before starting the API. The reviewed Coolify API build command is `docker compose build api && sh server/ops/migrate-built-api.sh server/compose.v2.yml <DEPLOYMENT_SHA> <API_RESOURCE_UUID>`. It builds the candidate, resolves its immutable image ID, checks its build SHA against the literal pinned deployment SHA, and runs the separate migration job before Coolify retires the old API. A failed job aborts that deployment. The release helper checks this wiring before pushing source. Normal API startup never migrates.

The migration runner keeps its existing registry, baseline detection, reward preflight, advisory locks, replay guards, and encryption checks. A durable migration ledger is a separate audit item. The manual `backfill-encrypted-club-enrollments` command with `--purge` also performs DDL and belongs in an administrative job, never an API runtime fallback.

## Environment changes

| Process or consumer | Intended change |
| --- | --- |
| Long-running API | Replace `DATABASE_URL` with the restricted runtime credential. No elevated migration credential or alternative admin URL in this environment. |
| One-off migration job | Supply its own `DATABASE_URL` for the current schema owner, separately from the API. Initially the schema owner may still be `postgres`; its exposed password must be replaced. |
| Migration encryption configuration | Preserve the exact existing `SESSION_SECRET`, `LOCATION_ENCRYPTION_KEY`, optional `LOCATION_ENCRYPTION_KEY_PREVIOUS`, and `LOCATION_ENCRYPTION_KEY_VERSION`. Preserve `NODE_ENV=production` in production. Do not generate new encryption keys as part of the database-password change. |
| Backup, restore, monitoring, manual jobs and Coolify database resource | Inventory which credential each actually uses. Update every affected consumer before revoking the old password. A successful API switch alone does not establish backup continuity. |
| Historical generated environment files | Remove or redact the obsolete database credential only after explicit file-cleanup authorization. Do not copy them into the build context or use them to construct the new configuration. |

No new API environment variable is introduced. The same `DATABASE_URL` name is scoped to separate processes. The migration loader needs only the encryption fields above in addition to its connection string; unrelated mail, media, payment, and API service credentials need not be supplied.

Keep new secrets in the existing secure operator/secret-management interface. Do not put a password or connection URL in a command argument, shell history, repository file, screenshot, or log. The server `.dockerignore` excludes environment files, private keys, local data and dependencies; keep the migration file outside the build context at `/opt/cruush-migration-private/migration-<API_RESOURCE_UUID>.env`, owned by root with mode0600. The job receives it only through a read-only file bind. Docker refuses a missing bind source instead of creating a directory. A one-off job must receive credentials at runtime, never as build arguments or copied files.

## Local verification

From `server/`, install the existing lockfile dependencies, then run:

```sh
npm run build
npm exec -- vitest run src/migration-config.test.ts src/migrate.test.ts
CRUUSH_RUNTIME_ROLE_POSTGRES_TEST=1 npm exec -- vitest run src/database-runtime-role.test.ts
```

The role test creates and removes its own private PostgreSQL cluster. It never reads `DATABASE_URL` and cannot target the application database. PostgreSQL 16 `initdb`, `pg_ctl`, and `psql` must be on PATH. Production data and credentials must never enter this proof.

Existing encrypted migration integration cases additionally require their documented private `MIGRATION_219_TEST_SOCKET` fixture. A green unit-only run with those cases skipped is not integration evidence. Record actual commands, skips, and limitations in the local contract.

## Staging rehearsal and preparation

1. Reconfirm the exact production database resource, API resource, deployed commit, current object owners, PostgreSQL version, custom startup commands, and credential consumers. Check that both normal and rollback startup commands use `npm run start` only. Keep any existing development/staging resources separate from production.
2. Take a fresh backup and restore it into an isolated protected environment. Verify that it opens, has the expected schema/data counts, and can be read with the current encryption configuration. Do not test the migration runner or permission changes against production as a rehearsal. Do not allow restored schedulers to send messages or charge money.
3. Inspect PUBLIC privileges, role memberships, schema owners, extensions, callable SECURITY DEFINER routines, and application-table grants on the restored schema. The provisioning script fails on unsafe effective privileges instead of silently revoking privileges from unrelated roles. If it stops, review the affected object and make any required change a separate explicit part of the cutover plan.
4. Run the candidate image's explicit migration command in the isolated rehearsal with the schema-owner credential and unchanged crypto configuration. Require exit zero and encrypted-data preservation proof before continuing. Do not run migrations concurrently with credential replacement.
5. Run `server/ops/runtime-role.sql` as the authorized database administrator through `psql -X -v ON_ERROR_STOP=1`. Set its non-secret variables `expected_database`, `runtime_role`, and `migration_owner` to the reviewed names. Authenticate through the secure connection mechanism already in use, without a URL/password in shell arguments. For example, after securely configuring the connection:

   ```sh
   psql -X -v ON_ERROR_STOP=1 \
     -v expected_database=REVIEWED_DATABASE_NAME \
     -v runtime_role=cruush_app \
     -v migration_owner=postgres \
     -f server/ops/runtime-role.sql
   ```

   This script changes privileges when executed. It is not a dry run. It is deliberately outside the numbered migration registry and never runs during API startup. A new role starts `NOLOGIN`, without a password. Review the script's preflight results before activation.
6. Set a newly generated independent password via a secure interactive/operator mechanism, then enable LOGIN for the intended runtime role. Do not print or record the secret. NOLOGIN alone is not a credential rotation or login test.
7. Start the candidate API with only the runtime database credential. Verify actual connection identity and role flags; test signup/login/session renewal, discovery, profile writes, messaging, encrypted state, moderation metadata, outbox/worker writes, payment ledger reads and authorized synthetic write paths. Use representative staging data and disable external effects. Confirm triggers still enforce their invariants.
8. Verify that schema/database creation, ALTER/DROP, TRUNCATE, role creation, privileged SET ROLE, superuser operations, and ownership escalation fail. Check required DML, upserts, row locks, sequence allocation, trigger behavior, and grants on a new migration-owned test table. Check connection counts and permission errors during a restart. The role remains able to modify application data as the API requires; it is not a row-level security redesign. Existing PUBLIC CONNECT/TEMP privileges are unchanged; temporary-table creation is not included in the permanent-schema DDL denial claim. Default grants are scoped to the selected migration owner in `public`; future extensions installed by that owner there can inherit them, so install extensions under a separately reviewed owner/schema or review their grants explicitly.

## Production cutover order

Proceed only with explicit live role/credential/configuration and deployment authorization. Record the environment changes above before executing them.

1. Confirm the rehearsal and recoverable backup, pin the candidate image/commit, pause competing releases, and retain an independent secure administrative recovery session.
2. Run the candidate migration job with the current schema-owner credential and unchanged encryption settings. Require success. Provision the reviewed runtime role and privileges. The operator SQL must target the exact intended database.
3. Activate the runtime role with its new secret. Put that credential only in the API's runtime `DATABASE_URL`. Verify that Coolify/custom commands cannot reintroduce migrations in API startup.
4. Deploy the candidate API under the restricted role. Verify build identity, health, database identity/flags, normal application operations, and worker/queue health. Drain the old API containers and database sessions using the elevated credential. A health response alone is insufficient.
5. Rotate the exposed schema-owner/admin password and update every inventoried admin, backup, restore, and migration consumer through secure interfaces. Verify a new administrative connection and a fresh backup. Account for already-open old sessions: changing a password only affects new authentication; drain or terminate the specifically identified obsolete sessions within the authorized cutover.
6. Prove a **new connection** using the old credential is rejected without logging it. Prove the API still uses the restricted role and the new admin credential works only in the intended management contexts. Do not mark the audit item closed until these checks and the new backup/restore consumer checks are recorded.
7. With separate file-cleanup authorization, redact/remove only the identified obsolete local credential entries. Preserve unrelated file contents. Re-scan the agreed locations with value-redacted reporting. Never put a valid replacement credential in those files. Revocation is the security boundary; deleting copies alone does not rotate a password.

## Failure recovery

- If migrations or provisioning fail, do not activate the new runtime credential or start a candidate against an incompatible schema. Preserve sanitized errors and use the reviewed backup/migration recovery procedure.
- If an application permission is missing, identify the exact denied operation and grant only the required privilege after review. Do not grant superuser, schema ownership, role membership, blanket ALL privileges, or disable protective triggers to pass a check.
- Prefer rollback to the previously verified compatible image with a start-only command and the secured runtime role. An older image's default command may replay migrations; never roll back by blindly restoring its default entrypoint.
- If a safe rollback requires an administrative API credential, that is a separate temporary live security decision, not an automatic fallback in this patch. Do not restore the exposed password. Preserve a newly secured administrative credential for controlled recovery.
- Keep newly rotated administrative and runtime credentials distinct. Reconfirm backups and application operations after any recovery. The patch does not automate destructive rollback, object ownership transfer, or data restoration.

## Privilege model references

Privileges include grants through PUBLIC and role membership, and ownership itself carries DDL rights. See PostgreSQL 16 [GRANT](https://www.postgresql.org/docs/16/sql-grant.html) and [schema privileges](https://www.postgresql.org/docs/16/ddl-schemas.html). Default grants apply to future objects created by the specified owner; they do not repair existing objects or apply to every possible creator. See [ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/16/sql-alterdefaultprivileges.html).

## Candidate migration wiring

The job file contains only DATABASE_URL for the schema owner, unchanged SESSION_SECRET and LOCATION_ENCRYPTION_KEY, and optional LOCATION_ENCRYPTION_KEY_PREVIOUS/LOCATION_ENCRYPTION_KEY_VERSION. It must contain no mail, payment or API service keys. NODE_ENV is forced to production by the runner. Existing API runtime environment values are not inherited by the migration child. No password or full URL appears in command arguments or job output. Migration stderr/stdout are captured and only a success/failure summary is emitted.

Coolify runs the reviewed custom build command before its stop-running-container phase. Do not replace it with a pre-deployment hook: that hook executes inside the old API container. The shell script resolves `api` from the rendered Compose configuration, uses the immutable image ID and a private bind mount on the existing coolify network, and propagates a nonzero migration exit. No new Compose service, shared .env, or elevated API environment variable is needed. The long-running API's DATABASE_URL remains the restricted role after the credential cutover. The migration file is updated securely when the schema-owner password is rotated.

This job runs alongside the old API. Candidate schema changes must stay backward compatible; this release adds migration226's gas-warning state without removing or replacing existing tables/fields. Existing migrations retain their reviewed replay guards and encrypted-data preservation checks. Runtime-role provisioning and password changes are separate explicit cutover actions, never run by the migration job.

The expected SHA and API resource UUID are explicit non-secret arguments, because the installed Coolify custom-build helper does not export SOURCE_COMMIT while build secrets are disabled. Keep that existing setting unchanged. The release helper pins the API commit and its matching migration command before main push, avoiding an auto-deploy race. Each API resource has its own private migration file; staging never reuses the production file. Missing files fail before the running API is stopped.
