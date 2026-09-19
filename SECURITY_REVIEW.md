# cruush crypto processor security review

## Review target

Branch: `security/crypto-processor-review-20260908`.
Compare against `cad6048f3d85b3662317ef473e68a0d9962a08d6`, the original processor branch base. This is a local review snapshot, not a deployment branch rebased onto today's production code. Do not compare against a moving `main` tip and mistake newer production changes for processor removals.

The original dirty checkout at `/Volumes/good/Cruushv2-crypto-release` was preserved. This branch contains the processor, operator wallet, checkout, payment policy, migrations, tests and direct billing/entitlement integration. Accessibility, map UI, group features, shared benefit-copy changes and an unrelated side-quest rename are excluded. Product prices and supply settings already carried by the processor are retained; they need owner review before release.

This document supersedes historical readiness claims in other handoffs. Ready for security review does not mean approved for real-money launch.

## Supporting documents

- [Threat model](THREAT_MODEL.md): assets, trust boundaries, abuse cases, controls and residual risks.
- [Technical white paper](PROCESSOR_WHITE_PAPER.md): implementation, payment lifecycle and design rationale.

The review branch is now backed by `/Volumes/good/Cruushv2-1`, with its checkout at `/Volumes/good/cruush-processor-security-handoff`. The prior worktree depended on unavailable archive Git metadata. Its intact processor source snapshot was recovered onto the same original base in the good-volume repository; earlier test results below describe that source snapshot, not a newly repeated test run.

## Architecture and review map

| Area | Entry points | Review focus |
| --- | --- | --- |
| Authenticated checkout | `server/src/routes/crypto-payments.ts`, `crypto-payments.ts` | Member ownership, server-derived prices, idempotency, transaction rollback, unique child address allocation, bounded reservations |
| Mandatory gas fee | `server/src/crypto-collection-fee.ts` | RPC chain identity, fresh block sample through price fetch completion, upward cent rounding, fee snapshot, fail-closed source outages |
| Chain evidence | `server/src/crypto-chain-source.ts`, `crypto-watcher.ts` | Exact chain/token/recipient, block identity and timestamp, per-rail confirmations, pre-publication origins, reorgs, exactly-once grants |
| Settlement and recovery | `crypto-settlement-policy.ts`, `crypto-reconciliation.ts`, support receipt route | Fee-bearing quotes allow no underpayment tolerance; old quotes retain policy; on-time evidence after expiry versus late transfers; support authorization |
| Entitlement accounting | `server/src/billing.ts`, `ping-packs.ts`, `side-quests.ts` | Concurrent grant/reservation locks, finite term stacking, lifetime limits, purchased-credit accounting |
| Operator custody | `tools/cruush-wallet/src/wallet.ts`, `signing.ts`, `interactive.ts`, `wallet-rpc.ts` | Backup verification, derivation, strict plan/signed-payload validation, recipient allowlist, native gas funding, receipt-aware retries |
| Member UI | `src/app/components/CruushPlusStore.tsx`, `src/app/lib/cryptoCheckoutApi.ts` | Exact quoted total, network/address instructions, recovery of pending orders, fee disclosure and info tooltip |
| Activation/schema | `server/src/config.ts`, `crypto-watcher-runtime.ts`, `server/sql/116_*.sql` through `124_*.sql` | Disabled defaults, testnet forbidden in production, migration upgrade/replay and persistent watcher positions |

The server uses an extended public key only. Signing stays in the operator tool. Interactive/agent detection is explicitly a heuristic, not a secure isolation boundary. An ELLIPAL address is a pinned recipient; this implementation does not integrate ELLIPAL device signing.

## Fee behavior

New orders add mandatory estimated collection cost to the purchase in USDC/PYUSD. The backend simulates zero-value token and native transfers, adds conservative gas allowances, reads current gas pricing, and includes Base Layer 1/operator fees. Coinbase's public ETH/USD spot endpoint converts the estimate, rounded upward to cents. Both the quoted total and fee provenance are stored before publishing the address.

Existing addressed orders remain unchanged. Underpaying a fee-bearing quote cannot be excused by the legacy underpayment allowance. If the fee source fails, the database reservation rolls back. The quote is fixed for that order, not reconciled to actual collection cost. The purchaser's own sending-wallet network fee is separate. Stablecoin fees do not automatically replenish ETH; treasury gas must still be managed.

Review the estimation allowances, oracle byte-size bound, public price-source availability, quote lifetime and collection delay. The price API does not provide a source timestamp in the consumed response; a successful fetch alone is not independent proof of market-data freshness. The current cap is 100000 fee cents and requires product/operational review before launch.

## Evidence

- 197 processor assertions passed across the crypto test files, including the added final-freshness test. The PostgreSQL cases ran against new disposable databases with schema only, not production data.
- The database rehearsal verifies rollback when pricing fails, persisted/reused mandatory totals, no grant for purchase-only payment, reconciliation of the outstanding fee, and exactly one grant from concurrent settlement attempts after the balance is complete.
- 47 operator-wallet assertions passed across six explicitly selected test files.
- 31 checkout/API-client assertions passed across three explicitly selected test files.
- Config, migration-source and pack tests passed, including the pack PostgreSQL case. Across the database suites, 13 integration cases ran. Server, client and operator-wallet builds passed.
- Earlier live Base Sepolia transfer receipts are recorded in `CODEX_HANDOFF.md`. No transaction was signed or broadcast while preparing this branch. The new fee's database rehearsal uses simulated confirmed transfer rows, not a new on-chain payment.
- Prior live read-only pricing returned 1 cent on Base Sepolia and 2 cents on Arbitrum. Those samples are historical evidence, not current quotes.
- Fee tooltip hover, click and focus were visually checked at 412px and desktop in the original checkout. This branch excludes unrelated benefit-copy additions; its final whole-page appearance was not re-rendered. Checkout component tests cover the resulting seven-benefit catalog.

## Reproduction

Use Node 22.12 or newer and the committed lockfiles. Install dependencies separately at the repository root, `server`, and `tools/cruush-wallet` using their existing package workflows. The verification here reused installed local dependencies; a fresh install from lockfiles is still a reviewer check.

Run these commands from the corresponding directory:

```sh
# Repository root
npx vitest run src/app/components/CruushPlusStore.test.tsx src/app/lib/cryptoCheckoutApi.test.ts src/app/lib/billingApi.test.ts
npm run build
pnpm check:cruush-casing

# server
npx vitest run src/crypto-*.test.ts src/config.test.ts src/migrate.test.ts src/ping-packs.test.ts
npm run build

# tools/cruush-wallet
npx vitest run src/signing.test.ts src/wallet-rpc.test.ts src/wallet.test.ts src/interactive.test.ts src/public-descriptor-file.test.ts src/networks.test.ts
npm run build
```

For database tests, provide `CRUUSH_CRYPTO_WATCHER_POSTGRES_URL` and `CRUUSH_CRYPTO_ATOMICITY_POSTGRES_URL` through the local environment. Their database names must match `cruush_crypto_watcher_*` and `cruush_crypto_atomicity_*`. Use disposable, migrated local databases only: these tests insert and delete fixtures. Without both variables, database checks skip. No connection strings or runtime environment files are included in this branch.

## Required before real-money launch

1. Independent code/custody review and resolution of its findings.
2. A fresh-install migration/upgrade rehearsal and a fresh dependency install. The completed concurrency run used a schema-only copy of the existing local migrated database.
3. A controlled testnet payment including the new fee through issuance, watcher evidence, entitlement and collection. This needs operator signing outside agent tooling. The current frontend does not offer a labeled Base Sepolia payment option; do not use its unlabeled testnet display as a production checkout.
4. Verify mainnet receiver ownership and spending on the actual custody setup, then fund and monitor native gas under an approved operator procedure. No mainnet spending has been proved here.
5. Confirm settlement/finality policy, fee allowances/cap, price-source outage handling, legally required refunds, tax and geographic/legal restrictions with the appropriate reviewers.
6. Explicit deployment and activation approval. Keep `CRYPTO_PROCESSOR_ENABLED`, `CRYPTO_PROCESSOR_WATCHER_ENABLED`, and production testnet controls off until release approval. No branch push, deployment or activation was performed for this handoff.

A reorg after an irreversible entitlement grant is an operational risk requiring review; tests do not prove immunity to all consensus failures. Public RPC data and the public ETH/USD feed remain trust dependencies. The earlier generic transaction rejection was not definitively diagnosed.
