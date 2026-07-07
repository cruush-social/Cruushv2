# Bank Test Staging Readiness - 2026-07-07

This document records the current staging state after wiring Stream moderation configuration in Coolify and redeploying the staging API.

## Current Staging Resources

- Frontend: `https://staging.cruush.app`
- API: `https://api-staging.cruush.app`
- Coolify API resource: `rhacv5wg4rigv1mj6lx08wtc`
- Coolify frontend resource: `osvowruef99ps8pgoa3w5ysp`
- Server: `cruush-prod-1`
- Moderation model: no human moderation queue. Stream AI/moderation provides moderation signals, and the cruush trust-score automod enforces save, publish, restriction, suspension, and rejection decisions.

## Completed Checks

- API redeploy finished successfully in Coolify.
- API health endpoint returned `HTTP 200` at `/health`.
- API metadata endpoint returned `HTTP 200` at `/api/meta`.
- Signed-out auth probe returned expected `401 AUTH_REQUIRED`, not a server error.
- CORS allowed the staging frontend origin: `https://staging.cruush.app`.
- Frontend loaded successfully at `https://staging.cruush.app`.
- Frontend environment variables were checked in Coolify Developer View. Only frontend-safe keys were present:
  - `NIXPACKS_NODE_VERSION`
  - `NODE_ENV`
  - `VITE_API_BASE_URL`
  - `VITE_TURNSTILE_SITE_KEY`
- No backend-only secrets were visible on the frontend Coolify resource.
- Frontend redeploy was not needed because no frontend environment change was made.
- Signup API correctly enforced captcha when called without Turnstile proof.
- Profile screen loaded for the existing staging smoke session.
- Messages screen loaded for the existing staging smoke session.
- Feed screen loaded for the existing staging smoke session.
- An allowed public feed post saved and rendered through the current moderation gate.

Latest public endpoint check on 2026-07-07 at 20:42 UTC:

- `https://api-staging.cruush.app/health`: `HTTP 200`
- `https://api-staging.cruush.app/api/meta`: `HTTP 200`
- `https://staging.cruush.app/`: `HTTP 200`

Latest redeploy follow-up check on 2026-07-07 at 21:37 UTC:

- `main` is pushed at `86c87fb Move Ghost Mode settings into map shortcut`.
- `https://api-staging.cruush.app/health`: `HTTP 200`
- `https://api-staging.cruush.app/api/meta`: `HTTP 200`
- `https://staging.cruush.app/`: `HTTP 200`
- `DELETE /api/posts/:postId` is deployed; an unauthenticated probe returns `401 AUTH_REQUIRED`, confirming the route exists and is auth-gated.
- Frontend `Last-Modified` header is `2026-07-07 21:28 UTC`, consistent with the latest redeploy.

## Not Yet Proven

- Banned public/profile coded-language rejection was not tested on the active staging smoke user because those attempts intentionally create trust evidence and may restrict the account.
- Profile photo upload was not tested in this run. This is now the top bank-readiness blocker because profile photos must reject non-human/gradient images while accepting adult-human/body images.
- DM and group message writes were not tested in this run because the visible staging UI did not expose a ready conversation fixture.
- Group messaging backend routes exist, but the full Signal-style frontend admin/member UI is still incomplete.
- PhotoDNA remains disabled. Do not tell a bank or payment processor that PhotoDNA is active until the adapter is verified against Microsoft sample requests and responses.

## PhotoDNA Status

Current safe staging posture:

```env
PHOTODNA_ENABLED=false
PHOTODNA_API_URL=https://api.microsoftmoderator.com
PHOTODNA_OPERATION_PATH=/photodna/v1.0/Match
PHOTODNA_TIMEOUT_MS=5000
```

Microsoft's portal shows `/photodna/v1.0/Match` as deprecated and recommends `MatchHash` for ongoing support. The current cruush adapter sends raw image bytes to the configured operation path, so it matches the deprecated `Match` shape better than `MatchHash`. Before enabling PhotoDNA for staging or bank review, update or verify the adapter against the exact Microsoft operation path, required headers, request body, and blocked/allowed response examples.

The PhotoDNA keys were visible in a screenshot during setup. Rotate them before production or bank-facing staging if there is any chance the screenshot was shared outside the trusted workspace.

## Bank Test Account Plan

Use a dedicated disposable reviewer account, not the existing smoke account, for moderation rejection tests.

Minimum bank smoke script:

1. Open `https://staging.cruush.app`.
2. Create or use the bank reviewer account.
3. Confirm signup/login works with Turnstile and email verification behavior expected for staging.
4. Edit profile basics and bio with allowed text.
5. Attempt a public/profile banned term on the disposable account and verify the write is rejected.
6. Upload an allowed adult human profile photo and verify the approved/pending state.
7. Attempt a clearly invalid profile image fixture and verify rejection without publishing it.
8. Create or use a second test account for DMs.
9. Send an allowed DM.
10. Verify drug discussion is allowed in DMs, but sale/solicitation language is rejected.
11. Create a group conversation fixture.
12. Verify group owner/admin/member permissions once the UI is complete.
13. Create a report with the fetishization reason and verify it records report evidence.
14. Verify expired feed posts/messages are hidden or removed according to the configured timer.

## Immediate Engineering Next Steps

1. Finish profile photo upload staging verification with safe adult-human and invalid-image fixtures.
2. Confirm Stream image moderation is configured to return positive adult-human/body proof or reject non-human profile photos. cruush now fails closed when the provider is silent.
3. Create a disposable staging bank reviewer account for destructive moderation tests.
4. Run banned feed/profile coded-language tests only on that disposable account.
5. Verify feed post delete on the bank reviewer account now that `DELETE /api/posts/:postId` is deployed.
6. Add frontend helpers and UI for group remove member, demote admin, close group, rename group, member management, and disappearing timer controls.
7. Add a staging conversation fixture so DM/group smoke tests do not depend on random existing users.
8. Update or verify the PhotoDNA adapter before enabling `PHOTODNA_ENABLED=true`.
9. Keep PhotoDNA disabled until that adapter verification passes.
10. Add an automated bank smoke-test checklist or script that can be rerun before every staging review.

## Bank-Facing Statement

For bank/payment-processor review, describe the current moderation architecture this way:

> cruush uses automated moderation. There is no human moderation queue for launch. Stream AI/moderation tools provide moderation signals, and cruush's trust-score automod enforces blocking, rejection, restriction, suspension, and evidence decisions before content is saved or published.

Do not claim end-to-end encryption. The open beta target is cruush-controlled server-side/application-layer encryption, where the backend can decrypt only when authorized for product, moderation, safety, export, deletion, and compliance workflows.
