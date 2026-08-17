# cruush production Stream moderation repair

Status: planned; no production changes made.

## Problem

The moderation dashboard shows repeated Stream errors:

`Stream error code 5: V2Check failed with error: "Token signature is invalid"`

Production health and moderation feature flags are green, but Stream authentication is not proven. The likely cause is a mismatched, stale, duplicated, or incorrectly formatted production `STREAM_API_KEY` and `STREAM_API_SECRET` pair.

## Scope

- Repair production Stream credentials in the API runtime.
- Verify the Stream moderation config key belongs to the same Stream app.
- Verify one safe authenticated profile-photo moderation flow.
- Confirm the dashboard stops receiving new Stream authentication errors.

## Non-goals

- Do not paste secrets into chat.
- Do not rotate credentials without a secure source of truth.
- Do not change moderation policy thresholds.
- Do not disable fail-closed image moderation.
- Do not change the frontend or pending site-wide notification work.

## Procedure

1. Open the production Stream app dashboard and identify the app used by cruush.
2. Confirm the API key and secret belong to that exact app.
3. In Coolify, inspect the production API variables:
   - `STREAM_API_KEY` — secret
   - `STREAM_API_SECRET` — secret
   - `STREAM_MODERATION_CONFIG_KEY` — provider config identifier
   - `STREAM_MODERATION_ENABLED` — expected `true`
   - `STREAM_IMAGE_BRIDGE_ENABLED` — expected `true`
4. Replace only incorrect or stale values with the matching values from the same Stream app. Preserve the current values privately for rollback.
5. Redeploy the API only. Do not redeploy the frontend for this repair.
6. Wait for the API container to report healthy.

## Proof gates

- `https://api.cruush.app/health` returns HTTP 200.
- `/api/meta` reports Stream moderation and image bridge enabled.
- A real Stream config/provider probe succeeds without token-signature errors.
- One safe authenticated profile-photo upload completes through the visible app flow.
- The moderation dashboard shows no new Stream token-signature errors after the test.
- Rekognition fallback remains healthy.
- No secrets appear in logs, screenshots, URLs, or committed files.

## Rollback

If the provider probe or safe upload fails:

1. Restore the previous API image or previous known-good variable values.
2. Redeploy the API.
3. Recheck health and fail-closed upload behavior.
4. Leave the issue open with the exact provider error and failed proof gate.

## Completion record

- Date:
- Stream app confirmed:
- API deployment SHA:
- Coolify API deployment:
- Provider probe:
- Safe authenticated upload:
- Dashboard error trend:
- Rollback required:
- Notes:
