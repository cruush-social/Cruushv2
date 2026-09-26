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

The release candidate starts from the previously reviewed processor integration through `06bbfef4ebbbd6f063279ddcfc4b8110310e94a5`, adds the scoped September 25 Mempool/readiness commit `b69b268`, and integrates current `origin/main` at `82613aa7c86cdb967e4abe4707b9b5e1b9a7c2d0`. The integrated source tested below is merge commit `b0cc280a48ccdb865d5e721d9c3cb12b8f8930d7`.

The complete candidate contains 139 changed paths relative to current `origin/main`. The authoritative exact list is:

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

Release record:

- `docs/bitcoin-checkout/DEPLOY_READY_SCOPE_2026-09-25.md`

## Explicit exclusions

- All QuickNode source, routes, tests, environment variables, credentials, lists, webhook setup and paid subscription work.
- Stablecoin checkout activation.
- Signer or forwarding changes and any funds movement.
- Production environment mutation, database migration execution, push, merge or deployment.
- Unrelated map, profile, onboarding, moderation, accessibility or general UI work.
- The public crypto blog post and release-announcement email. They remain separate publication/copy actions.

## Configuration boundary

This candidate adds no environment variable. Deployment uses the existing processor enable flag, watcher enable flag, Bitcoin public receive descriptor, Esplora URL, confirmation target and Resend configuration. Before deployment, production address history and the allocator must be reconciled without printing the descriptor or database credentials.

## Integrated-candidate verification

- QuickNode runtime/config references in the candidate: none.
- Bitcoin, Mempool, watcher, mailer, payment, support, reminder and image-safety selection: 216 passed, 33 PostgreSQL tests skipped because no disposable database was configured for that run.
- Complete server application selection: 336 passed.
- Checkout, Pulse, order-history, support and notification client selection: 79 passed.
- Migration registration selection: 34 passed.
- Wallet/operator-tool suite: 56 passed.
- Server TypeScript build: passed.
- Frontend production build: passed.
- Wallet TypeScript build: passed.
- Product-name casing, conflict-marker scan and `git diff --check`: passed.
- Production dependency audit: zero known vulnerabilities after updating Fastify, Sharp and their vulnerable transitive URI parser; the server image already uses the required Node 22 runtime.

The skipped PostgreSQL cases retain the earlier disposable-database and real-payment acceptance evidence. This candidate is locally deploy-ready. It has not been pushed, merged to `main`, deployed, used to mutate production configuration, or used to send funds or announcement email.
