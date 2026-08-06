# cruush urgent bug-fix release evidence

Date: 2026-08-06 UTC  
Release branch: `codex/urgent-bugfix-safety-release`  
Verified application commit: `6b682253e26b643d411d6d1e9fb65ef9f04f1654`  
Production `main` was not changed.

## Executive status

The urgent bug-fix slice is implemented, tested, deployed to the existing production API/frontend and to a separate Coolify staging environment, and has passed the release gates that can be proven without using a real customer account or weakening production controls.

The release is fail-closed for unknown media. The one remaining legacy media object is provider-classified as `uncertain`, remains masked, and is recorded with `aws_rekognition` as the moderation provider. There are no legacy objects left in the `unknown` state.

The visual liquid-glass/magnifying-lens work is intentionally outside this release. It remains a later UI lane and was not mixed into the safety, feed, messaging, access, trial, or operations fixes.

## Release scope

This release covers the urgent issues reported during the Claude-session handoff and the coordinated safety plan:

- seeking-filter menu actions and server-side seeking filtering;
- feed visibility and posting behavior, including owner full access and explicit media metadata;
- quick-access gallery and public direct messaging;
- disappearing-message timers and clear-for-everyone behavior;
- seven-day `cruush+` trial on first login;
- bug-report persistence, GitHub issue creation, and scheduled issue synchronization;
- DL Mode fail-closed media masking and explicit classification rules;
- legacy media classification and resumable batch processing;
- moderation/provider failure behavior and operational health checks;
- the migration and real-Postgres regression surface required by the plan.

## Explicit non-goals

- No liquid-glass, SVG lens, magnifying-glass, or other visual polish was added to this branch.
- No unrelated dirty work in `/Volumes/corrupt/Cruushv2-1` was staged or modified.
- `main` was not pushed.
- No production customer credentials, profile photos, or session cookies were used for smoke testing.
- No production secret value is recorded in this document.

## Source changes delivered

The branch contains the urgent client/server changes and migrations previously listed in the 50-section whitepaper and DL Mode plan. The final safety-specific additions are:

- `server/src/legacy-media-classification.ts`: provider-backed legacy classification helper with an explicit human-presence requirement and fail-closed `uncertain` result.
- `server/src/legacy-media-classification.test.ts`: focused helper coverage for provider success, provider absence, provider uncertainty, explicit/non-explicit outcomes, and failure behavior.
- `server/src/backfill-media-classification.ts`: batch backfill now uses legacy-safe classification rather than the user-facing profile-photo identity rejection path.
- `server/src/urgent-release-real-postgres.test.ts`: optional real-Postgres route smoke covering group title persistence, disappearing timers, owner/member authorization, and clear-for-everyone persistence.
- migrations 058-063 and the coordinated client/server changes already present in the release branch.

## Verification matrix

### Local source and unit verification

| Gate | Result | Evidence |
| --- | --- | --- |
| Legacy classification helper tests | PASS | 5 tests passed in `server/src/legacy-media-classification.test.ts` |
| Server TypeScript build | PASS | `pnpm --dir server run build` |
| Real-Postgres migrations | PASS | Migrations 001-063 applied to isolated PostgreSQL 16.13 |
| Real-Postgres route smoke | PASS | Group title/timer persistence, owner-only timer update, and clear-for-everyone persistence verified from the database |
| DL Mode server seeded flow | PASS | Existing DL Mode end-to-end suite from the release verification run |
| Focused client DL Mode/media tests | PASS | Existing focused client verification run |
| Full root build | PASS | Existing release verification run |
| MapHome maximum-update-depth suite | KNOWN TEST-HARNESS ISSUE | Reproduces on the baseline when the bug-button slot is removed; not introduced by this release slice |

The real-Postgres test is intentionally opt-in. It does not silently replace mocked tests: it requires `CRUUSH_REAL_POSTGRES_URL`, uses a separate database, runs migrations, creates isolated fixtures, and verifies persisted rows after the HTTP calls.

### Staging deployment

Coolify staging was created as a separate environment rather than reusing production resources.

- Environment: `staging` (`jl4l3fdi7hjhiqc2f8tm7ev5`)
- API application: `sd6f4c9whf4v5r5kaxd0w8gb`
- Frontend application: `soei3fa2oqtwovi6hminchru`
- Database: separate staging PostgreSQL resource
- API URL: `http://sd6f4c9whf4v5r5kaxd0w8gb.87.99.152.196.sslip.io`
- Frontend URL: `http://soei3fa2oqtwovi6hminchru.87.99.152.196.sslip.io`
- API source: `codex/urgent-bugfix-safety-release`, verified application commit above

Direct checks returned HTTP 200 for:

- staging `/health`;
- staging `/api/meta`;
- staging frontend root;
- the frontend bundle containing the staging API URL.

An isolated staging-only account was seeded and authenticated through a generated session. The following authenticated routes returned HTTP 200 and the session user ID matched the fixture:

- `/api/auth/me`;
- `/api/profiles/me`;
- `/api/billing/me`.

The normal login endpoint rejected a request without a captcha with `VALIDATION_ERROR: Captcha verification is required.` This confirms the configured Turnstile gate is active; no attempt was made to weaken it or use a production credential merely to force a login test.

### Production deployment and health

- Production API application: `rhacv5wg4rigv1mj6lx08wtc`.
- Production frontend application: `osvowruef99ps8pgoa3w5ysp`.
- Production API `/api/meta`: HTTP 200 after the release deployment.
- Production service status in Coolify: healthy/running.
- Production frontend remained healthy after deployment.
- The release branch was pushed to its remote branch; production `main` remains at its pre-release SHA.

## Live moderation/provider evidence

The production API container ran the repository Rekognition health command successfully:

`Rekognition OK in us-east-1 (283ms).`

An additional in-container AWS SDK probe successfully executed all three required operations against the configured region:

- `DetectLabels`;
- `DetectModerationLabels`;
- `DetectFaces`.

This proves the live container can reach Rekognition with its configured IAM boundary. Credentials were never printed or copied into the repository.

## Legacy-media operation

The first production backfill attempt exposed a real bug: the generic profile-photo moderation path enforced the user-facing “photo must be of you” identity gate against legacy data. That path was replaced with a legacy-safe classifier that does not punish or reject the account and requires provider-backed human evidence before treating the image as safe.

The corrected run was executed in a bounded batch:

`CRUUSH_MEDIA_BACKFILL_BATCH=1 npm run media:backfill-classification`

Result:

`processed=1, classified=1, failed=0`

Final production audit:

| Legacy classification | Count |
| --- | ---: |
| total legacy objects | 1 |
| `unknown` | 0 |
| `uncertain` | 1 |
| `non_explicit` | 0 |
| `explicit` | 0 |

The remaining object has:

- `explicit_classification = uncertain`;
- `explicit_classification_source = provider`;
- `explicit_classification_reason = legacy_provider_uncertain`;
- `moderation_provider = aws_rekognition`.

That is the intended safe outcome: the legacy object is not silently made public when the provider cannot establish the required human/explicitness evidence.

## GitHub bug-report operations

The production Coolify scheduled task `bug-report-issue-sync` is enabled on a ten-minute schedule. Its immediate execution completed successfully during verification. The runtime environment audit confirmed that the triage feature, repository, label, and token configuration keys are present without exposing their values.

The release therefore separates:

1. request persistence in the application database;
2. issue creation/synchronization in the scheduled worker;
3. the operational task status visible in Coolify.

An HTTP response from the report endpoint alone is not treated as proof that GitHub updated; the scheduled execution result is the operational proof recorded here.

## Rollback and incident rules

- Roll back the release branch/application image if health, `/api/meta`, database migration, or fail-closed media behavior regresses.
- Do not make unknown media visible to recover from a provider outage.
- Do not re-run the legacy backfill through the generic profile-photo identity gate.
- Keep batches bounded and resumable; inspect `processed`, `classified`, and `failed` counts after every run.
- Treat production provider availability, provider classification, and user-facing exposure as separate claims.
- Treat source tests, remote branch state, Coolify deployment state, and live HTTP behavior as separate claims.
- Preserve the pre-release `main` SHA until the release owner explicitly approves publication.

## Remaining operational follow-up

The code and deployment gates for this urgent release are complete. The following are post-release operating tasks rather than unverified implementation work:

- continue the planned first-day health and error-rate observation window;
- confirm the next scheduled GitHub synchronization after new reports arrive;
- keep the staging environment available for browser-level QA while the UI lane is deferred;
- remove or retain staging-only smoke fixtures according to the staging lifecycle policy;
- separately plan and approve the later liquid-glass/magnifying-lens UI work.

