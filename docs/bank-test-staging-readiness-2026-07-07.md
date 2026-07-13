# Bank Test Staging Readiness - 2026-07-07

This document records the current staging state after wiring Stream moderation configuration in Coolify and redeploying the staging API.

## Current Staging Resources

- Frontend: `https://staging.cruush.app`
- API: `https://api-staging.cruush.app`
- Coolify API resource: `rhacv5wg4rigv1mj6lx08wtc`
- Coolify frontend resource: `osvowruef99ps8pgoa3w5ysp`
- Server: `cruush-prod-1`
- Moderation model: no human moderation queue. Stream AI/moderation provides moderation signals, and the cruush trust-score automod enforces save, publish, restriction, suspension, and rejection decisions.

## Profile-Photo Bridge Deployment Configuration

Bank-facing staging must use the dedicated provider-readable hostname and these API variables:

```env
STREAM_MODERATION_ENABLED=true
STREAM_IMAGE_BRIDGE_ENABLED=true
STREAM_API_KEY=<staging-stream-api-key>
STREAM_API_SECRET=<staging-stream-api-secret>
STREAM_APP_ID=<staging-stream-app-id>
STREAM_MODERATION_CONFIG_KEY=<staging-stream-moderation-config-key>
MODERATION_MEDIA_BASE_URL=https://moderation-media-staging.cruush.app
STREAM_PSEUDONYM_KEY=<random-secret-at-least-32-bytes>
MEDIA_OBJECT_STORAGE_DRIVER=s3
PHOTODNA_ENABLED=false
```

Route `https://moderation-media-staging.cruush.app` to the API without cookies or CDN caching. Configure a private five-minute scheduler to run `pnpm --dir server cleanup:moderation-media-grants` from the repository root. Confirm Coolify ingress, proxy, CDN/WAF, and APM logs do not retain raw request paths for this hostname. Public production must keep `STREAM_IMAGE_BRIDGE_ENABLED=false` until provider retention terms and staging evidence are accepted.

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

Latest profile-photo proof attempt on 2026-07-07 at 21:45 UTC:

- `main` is pushed at `6d51810 Update staging readiness after redeploy`.
- `https://api-staging.cruush.app/health`: `HTTP 200`
- `https://api-staging.cruush.app/api/meta`: `HTTP 200`
- `https://staging.cruush.app/`: `HTTP 200`
- Frontend `Last-Modified` header remains `2026-07-07 21:28 UTC`.
- `POST https://api-staging.cruush.app/api/profile-photos` without auth returns expected `401 AUTH_REQUIRED`, confirming the upload route is deployed and auth-gated.
- Chrome had an authenticated staging smoke session. `https://staging.cruush.app/profile` loaded the `Codex Smoke` profile, and `https://staging.cruush.app/profile/edit` loaded the profile editor.
- The Photos tab loaded with the upload control and existing profile photo controls.
- Attempting to upload the invalid non-human fixture `src/app/assets/ui-icons/feed-colored.png` through Chrome was blocked by the Codex Chrome extension file-upload bridge before the file reached the app. This does not prove either rejection or acceptance by cruush.
- To finish the proof through automation, enable Chrome extension file upload access: go to `chrome://extensions`, open Details for the Codex extension, and enable `Allow access to file URLs`.

Follow-up profile-photo proof attempt on 2026-07-08 at 16:45 UTC:

- `https://api-staging.cruush.app/health`: `HTTP 200`
- `https://api-staging.cruush.app/api/meta`: `HTTP 200`
- Direct API login tests without Turnstile proof returned `400 VALIDATION_ERROR` / `Captcha verification is required.`, so curl could not mint a staging session cookie for bank-review proof.
- Chrome loaded `https://staging.cruush.app/profile/edit` as an authenticated staging session and the Photos tab mounted one JPEG/PNG/WebP-only file input.
- Uploading `/private/tmp/seed-photo-01.jpg` and a re-encoded `/private/tmp/profile-proof-adult-human.png` through Chrome reached the crop modal, but the Codex Chrome extension file bridge produced a blob with `naturalWidth=0`, and the app showed `This image could not be loaded. Try a JPG, PNG, or WebP file.` The file still did not reach `/api/profile-photos`.
- The backend route is still not proven on staging with authenticated image bytes. Enable Chrome extension file upload access or run the upload manually in Chrome to finish safe adult-human acceptance and invalid non-human rejection proof.

## Not Yet Proven

- Banned public/profile coded-language rejection was not tested on the active staging smoke user because those attempts intentionally create trust evidence and may restrict the account.
- Profile photo upload reached the authenticated edit UI, but the fixture upload did not reach the app because Chrome file upload access is not enabled for the Codex extension. This remains the top bank-readiness blocker because profile photos must reject non-human/gradient images while accepting adult-human/body images.
- DM and group message writes were not tested in this run. Bank review must not use seeded/fake messages, fake DMs, fake groups, or seeded bank/payment accounts; test those flows only through real tester-owned accounts during the review.
- Message-photo uploads remain disabled and are not part of the bank-facing profile-photo bridge.
- Group messaging backend routes exist, but the full Signal-style frontend admin/member UI is still incomplete.
- PhotoDNA remains disabled. Do not tell a bank or payment processor that PhotoDNA is active until the adapter is verified against Microsoft sample requests and responses.
- Stream may process or retain submitted photo bytes or moderation-derived data under its contract. The capability bridge limits time and identifiers but is not zero-knowledge and does not prove provider-side zero retention.

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

Create every bank-review account through the normal visible staging signup flow and use tester-owned email addresses, consented profile details, and consented images. Do not use seeded or fake accounts, fake profiles, fake messages, fake DMs, fake mutual cruushes, fake groups, or payment fixtures for this proof.

Minimum bank smoke script:

1. Open `https://staging.cruush.app`.
2. Create or sign in to a tester-owned account through the normal visible signup/login flow.
3. Confirm signup/login works with Turnstile and email verification behavior expected for staging.
4. Edit profile basics and bio with allowed text.
5. Attempt a public/profile banned term on the disposable account and verify the write is rejected.
6. Upload one consented adult-human profile photo and confirm it is published from cruush-controlled encrypted storage.
7. Attempt a neutral nonhuman image and confirm rejection with no remaining media or grant row. Do not use actual minor imagery; minor and ambiguous-age handling stays covered by provider-response fixtures and policy tests.
8. Replay the captured capability URL after its first successful provider fetch and confirm `404`.
9. Inspect API, Coolify/proxy, CDN/WAF, and APM logs and confirm the raw capability token was not retained.
10. Create or use a second real tester-owned account for DMs.
11. Send an allowed DM during review.
12. Verify drug discussion is allowed in DMs, but sale/solicitation language is rejected.
13. Create a group conversation through the visible app flow during review.
14. Verify group owner/admin/member permissions once the UI is complete.
15. Create a report with the fetishization reason and verify it records report evidence.
16. Verify expired feed posts/messages are hidden or removed according to the configured timer.

## Immediate Engineering Next Steps

1. Enable Chrome extension file upload access or manually run the upload proof in Chrome, then finish profile photo upload staging verification with safe adult-human and invalid-image fixtures.
2. Confirm Stream image moderation is configured to return positive adult-human/body proof or reject non-human profile photos. cruush now fails closed when the provider is silent.
3. Create a real disposable staging account through the normal app flow for destructive moderation tests.
4. Run banned feed/profile coded-language tests only on that disposable account.
5. Verify feed post delete on the bank reviewer account now that `DELETE /api/posts/:postId` is deployed.
6. Add frontend helpers and UI for group remove member, demote admin, close group, rename group, member management, and disappearing timer controls.
7. Use the reviewer-account seeder only to create auth/profile/location shells; DM/group smoke tests must use real tester-owned accounts and review-time actions.
8. Update or verify the PhotoDNA adapter before enabling `PHOTODNA_ENABLED=true`.
9. Keep PhotoDNA disabled until that adapter verification passes.
10. Add an automated bank smoke-test checklist or script that can be rerun before every staging review.

## Bank-Facing Statement

For bank/payment-processor review, describe the current moderation architecture this way:

> cruush uses automated moderation. There is no human moderation queue for launch. Stream AI/moderation tools provide moderation signals, and cruush's trust-score automod enforces blocking, rejection, restriction, suspension, and evidence decisions before content is saved or published.

After the bridge is deployed and the bank smoke script passes, add: automated Stream profile-photo moderation is active through an ephemeral capability bridge. Until then, describe it as implemented but awaiting staging proof. PhotoDNA is inactive and must not be represented as active unless separately verified.

Do not claim end-to-end encryption. The open beta target is cruush-controlled server-side/application-layer encryption, where the backend can decrypt only when authorized for product, moderation, safety, export, deletion, and compliance workflows.
