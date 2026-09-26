# Bitcoin processor deploy-ready scope

25 September 2026

## Goal

Prepare one isolated release candidate for the existing Bitcoin checkout. Members create and restore Bitcoin invoices, pay from Cash App, PayPal, Venmo or a compatible wallet, and receive the purchased benefit once the existing database-backed watcher independently verifies the exact payment through six confirmations.

The event trigger is the public Mempool WebSocket. Existing Esplora sources remain the settlement authority. The processor requires no QuickNode account, key, list, webhook, route or environment variable.

## Included behavior

- Bitcoin-only checkout, app minimums, exact amount/address, QR, copy controls, timer and saved order recovery.
- Persisted transaction evidence, canonical-block checks, restart recovery, reorg/replacement handling and exactly-once fulfillment at six confirmations.
- Public Mempool address subscriptions used only to wake the watcher. Provider events never grant access.
- Independent Esplora verification before settlement.
- Capacity warnings at 40 active checkout addresses and critical alerts at 50, delivered to the owner through the existing Resend configuration.
- Existing subscription-expiry reminders and billing-support categories already approved in the unified Bitcoin release.
- Previously approved checkout and Pulse presentation changes included by the unified release.

## Full release boundary

The release candidate starts from the previously reviewed processor integration through `06bbfef4ebbbd6f063279ddcfc4b8110310e94a5`, adds the scoped September 25 Mempool/readiness commit `b69b268`, and integrates current `origin/main` at `82613aa7c86cdb967e4abe4707b9b5e1b9a7c2d0`. The integrated base is merge commit `b0cc280a48ccdb865d5e721d9c3cb12b8f8930d7`; the tested processor release source including the allocator cutover and whitespace-only diff cleanup is `c91c087aee482f2faf42fc2e284d0a380342a680`. The separately authorized public changelog and announcement-email draft begin at commit `5f32723e5336c4d7f2f2beec2e4cb271844432ab`; the expanded v1.8 changelog, email and restored Bitcoin-only crypto article are commit `a310c3bd623bd2a8d81a23000f4c5d8cb00b35d8`.

The complete candidate contains 148 changed paths relative to current `origin/main`. The authoritative exact list is:

```bash
git diff --name-only origin/main...HEAD
```

That full diff consists of the existing processor migrations, server settlement/watcher code, checkout and order-history UI, wallet/forwarding operator tool, billing/support/reminder integration and processor documentation, plus the continuation files listed below. Existing map/settings changes in the base are limited to approved checkout/Pulse entry points and order-history navigation. No later dirty-worktree UI was copied into this candidate.

## September 25 continuation files

Server and database:

- `server/src/bitcoin-mempool-source.ts`
- `server/src/bitcoin-mempool-source.test.ts`
- `server/src/app.ts`
- `server/src/bitcoin.ts`
- `server/src/bitcoin.test.ts`
- `server/src/bitcoin-watcher.ts`
- `server/src/bitcoin-postgres.test.ts`
- `server/src/crypto-payments.ts`
- `server/src/crypto-payments.test.ts`
- `server/src/crypto-watcher-runtime.ts`
- `server/src/crypto-watcher-runtime.test.ts`
- `server/src/index.ts`
- `server/src/mailer.ts`
- `server/src/mailer.test.ts`
- `server/src/migrate.ts`
- `server/src/notification-service.ts`
- `server/src/push-service.ts`
- `server/src/support-schema.ts`
- `server/src/support-routes.test.ts`
- `server/src/subscription-expiry.ts`
- `server/src/subscription-expiry.test.ts`
- `server/src/subscription-push.test.ts`
- `server/sql/187_subscription_expiry_reminders.sql`
- `server/sql/188_billing_support_categories.sql`
- `server/sql/189_subscription_expiry_email_delivery.sql`
- `server/sql/190_crypto_payment_allocator_history_floor.sql`
- `server/package.json`
- `server/package-lock.json`

Frontend:

- `src/app/components/CruushPlusStore.tsx`
- `src/app/components/CruushPlusStore.test.tsx`
- `src/app/components/CryptoPaymentMethods.tsx`
- `src/app/components/GhostModeSettings.tsx`
- `src/app/components/MapPingSheet.tsx`
- `src/app/components/MapPingSheet.test.tsx`
- `src/app/components/RequestsDashboard.tsx`
- `src/app/components/Rewards.tsx`
- `src/app/components/SupportPage.tsx`
- `src/app/components/SupportPage.test.tsx`
- `src/app/components/SupportRequestForm.tsx`
- `src/app/lib/notificationsApi.ts`
- `src/app/lib/publicLegalContent.tsx`
- `src/app/lib/supportApi.ts`
- `src/styles/theme.css`

Release communications:

- `docs/changelog.md`
- `docs/previews/cruush-1.8-bitcoin-update-email.html`
- `nginx.conf`
- `public/blog/crypto-first.html`
- `public/blog/index.html`
- `public/sitemap.xml`
- `src/app/components/Changelog.tsx`
- `src/app/components/Changelog.test.tsx`

Release record:

- `docs/bitcoin-checkout/DEPLOY_READY_SCOPE_2026-09-25.md`

## Explicit exclusions

- All QuickNode source, routes, tests, environment variables, credentials, lists, webhook setup and paid subscription work.
- Stablecoin checkout activation.
- Signer or forwarding changes and any funds movement.
- Production environment mutation, database migration execution, push, merge or deployment.
- Unrelated map, profile, onboarding, moderation, accessibility or general UI work.
- The v1.8 release-announcement email draft, public changelog copy and crypto article were added only after Julien's separate 25 September authorizations. They are not sent, published, pushed, or deployed by this candidate work.
- The restored crypto article describes the Bitcoin-only release. Stablecoin activation remains excluded.

## Configuration boundary

This candidate adds no environment variable. Deployment uses the existing processor enable flag, watcher enable flag, Bitcoin public receive descriptor, Esplora URL, confirmation target and Resend configuration.

The read-only production preflight on 25 September found the correct receive-key fingerprint, processor and watcher enabled, testnet disabled, public Blockstream Esplora configured, Resend configured, no QuickNode key, an empty production order ledger and an unused allocator at index 1. The canonical local history now contains 11 Bitcoin orders with 11 unique addresses, no open Bitcoin order, two paid Bitcoin orders, matching receive-key fingerprints and a last allocator value of 12. Every saved Bitcoin address was re-derived from the recorded descriptor successfully.

Migration `190_crypto_payment_allocator_history_floor.sql` completes the cutover without copying member/order history into production: it advances the production allocator to at least 12 without ever moving it backward, so the first production invoice uses index 13. It is replay-safe. Production becomes the sole issuing ledger when the separately authorized deployment starts; the local rehearsal ledger must remain non-issuing.

## Integrated-candidate verification

- QuickNode runtime/config references in the candidate: none.
- Bitcoin, Mempool, watcher, mailer, payment, support, reminder and image-safety selection: 216 passed, 33 PostgreSQL tests skipped because no disposable database was configured for that run.
- Complete server application selection: 336 passed.
- Checkout, Pulse, order-history, support and notification client selection: 79 passed.
- Migration registration selection: 35 passed.
- Full migrations `001` through `190` installed and replayed cleanly on a disposable PostgreSQL database; the empty-ledger cutover left the allocator at 12 and the next index at 13. A separate higher-sequence replay stayed forward-only.
- Canonical history reconciliation: all 11 saved Bitcoin addresses match the production receive-key fingerprint and re-derive correctly; no Bitcoin order is open; both paid orders have an entitlement marker and exactly one linked grant.
- Wallet/operator-tool suite: 56 passed.
- Server TypeScript build: passed.
- Frontend production build: passed; the whitespace-only cleanup produced the identical Order History JavaScript artifact hash.
- Public changelog component: 2 tests passed after adding all v1.8 changes.
- Public changelog, announcement email, blog index and crypto article: rendered locally at 1280-pixel and 375-pixel widths with no horizontal overflow; the existing layouts and styles were unchanged.
- Crypto article publication plumbing: sitemap XML and JSON-LD parsed; the inline JSON-LD hash matches the CSP allowlist; the production build contains the article; the email links to its canonical URL; no stablecoin claim remains.
- Wallet TypeScript build: passed.
- Product-name casing, conflict-marker scan and `git diff --check`: passed.
- Production dependency audit: zero known vulnerabilities after updating Fastify, Sharp and their vulnerable transitive URI parser; the server image already uses the required Node 22 runtime.

The skipped PostgreSQL cases retain the earlier disposable-database and real-payment acceptance evidence. This candidate is deploy-ready. It has not been pushed, merged to `main`, deployed, used to mutate production configuration, or used to send funds or announcement email. No production browser or native-app UI was opened or controlled. A local development preview was used only to verify the authorized changelog, email and blog pages at desktop and mobile widths.
