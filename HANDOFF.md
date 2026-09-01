# Handoff: feat/crypto-pricing

Branch: `feat/crypto-pricing`
Worktree: `/Volumes/good/Cruushv2-crypto-release`
Base: current `origin/main`, 0 behind / 6 ahead. Nothing pushed, nothing merged.

This branch holds the whole in-house crypto payment rail for cruush+. It is for
review and testing. It is not intended to be merged as-is.

## Read this first

**Nothing here can take money.** The processor is off, no wallet xpub is
configured, no chain endpoint is set, and the watcher refuses to start unless all
three are deliberately enabled. Creating a payment intent returns
`503 CRYPTO_PROCESSOR_NOT_READY`. No code path or test has ever made a live RPC
call.

## What it does

A member picks a cruush+ term on `/store` and pays in stablecoin. Each order gets
its own receiving address, derived from a public watch-only xpub, so a payment
identifies the order that it settles. A watcher reads ERC-20 `Transfer` logs for
those addresses, and only chain evidence can grant access.

Rails, in the order the checkout offers them:

| Rail | Chain | Token | Confirmations | Who can pay from it |
| --- | --- | --- | --- | --- |
| `usdc_arbitrum` | Arbitrum 42161 | USDC | 240 (~60s) | Cash App |
| `pyusd_arbitrum` | Arbitrum 42161 | PYUSD | 240 (~60s) | Venmo, PayPal |
| `pyusd_ethereum` | Ethereum 1 | PYUSD | 12 (~2.4m) | fallback |
| `usdc_base` | Base 8453 | USDC | 30 (~60s) | crypto wallets only |

Arbitrum leads because it is the only chain Cash App, Venmo, and PayPal can all
send to, and because collecting a payment costs two transactions per order (fund
the derived address with gas, then sweep it), so a mainnet rail charges a fee on
every sale forever. Base reaches none of those three apps.

Token addresses were taken from the issuers' own documentation, not block
explorers: Circle for USDC, Paxos for PYUSD. They are pinned in a route test so
an accidental change fails loudly.

## Running it locally

Requires Postgres. There is a Homebrew `postgresql@16` on `5432` on this machine;
the repo's docker-compose default points at `5433`, which is a separate thing.

```
createdb -h 127.0.0.1 -p 5432 cruush_crypto_dev
```

`server/.env.local` needs at least:

```
PORT=3011
HOST=0.0.0.0
DATABASE_URL=postgres://<you>@127.0.0.1:5432/cruush_crypto_dev
CORS_ORIGIN=http://localhost:5180
APP_URL=http://localhost:5180
SESSION_SECRET=<any 32+ chars>
DEVELOPMENT_ADMIN_ENABLED=true
DEVELOPMENT_ADMIN_PASSWORD=admin-password
MODERATION_PROVIDER=mock
```

Then:

```
VITE_DEV_PORT=5180 VITE_API_BASE_URL=http://localhost:3011 VITE_DEV_HTTPS=0 pnpm dev:local:seeded
```

Use `localhost` on both sides, not `127.0.0.1` on one. The session cookie is
host-scoped, so a mismatch logs in over curl but leaves the browser at 401.

Sign in as `admin@cruush.local` / `admin-password`, then open `/store`.

Several dev servers are usually running on this machine from different sessions,
each serving something that looks exactly like cruush. Judge which one you are
looking at by the port alone.

## Testing it

```
cd server && pnpm vitest run src/crypto-payments.test.ts src/crypto-watcher.test.ts \
  src/crypto-watcher-runtime.test.ts src/crypto-chain-source.test.ts \
  src/crypto-settlement-policy.test.ts src/crypto-payment-routes.test.ts \
  src/crypto-wallet.test.ts src/config.test.ts src/migrate.test.ts src/billing.test.ts
```

145 pass. The wallet tool has its own 21 (`cd tools/cruush-wallet && npx vitest run`).
Do not run the full suite; it is slow and there are unrelated pre-existing
failures on main.

Every test injects a fake chain source. Nothing reaches a network.

## Where to look

| Concern | File |
| --- | --- |
| Rails, intents, idempotency, expiry, ERC-681 URI and QR | `server/src/crypto-payments.ts` |
| Read-only JSON-RPC and ERC-20 log decoding | `server/src/crypto-chain-source.ts` |
| The watcher: scanning, dedup, reorgs, settlement, grant | `server/src/crypto-watcher.ts` |
| Scheduling and which chains are watched | `server/src/crypto-watcher-runtime.ts` |
| What an amount means | `server/src/crypto-settlement-policy.ts` |
| Support lookup and the exception report | `server/src/crypto-reconciliation.ts` |
| Address derivation from the xpub | `server/src/crypto-wallet.ts` |
| Schema and its constraints | `server/sql/096`–`099` |
| Checkout page | `src/app/components/CruushPlusStore.tsx` |

`docs/plans/v2-crypto-processor.md` carries the reasoning behind every decision
and is the more useful read than the code for a reviewer.

## Things worth attacking during review

These are the properties the design depends on. Each has a test, but a test only
proves what it asserts.

- Price is always derived server-side from `planId`. A client may name a rail and
  nothing else: not an amount, asset, network, token address, or confirmation
  target.
- Entitlement is granted only from the `paid` transition, and only by the pass
  that successfully claimed it. The database refuses a second grant, refuses a
  grant on an unpaid intent, and refuses a paid intent with no confirmed amount.
- One chain log is one row, keyed on `(chain_id, transaction_hash, log_index)`,
  so re-reading a range cannot double-count.
- Reorganized transfers stop counting but are never deleted.
- The xpub, its fingerprint, the derivation index, and the RPC endpoint URL never
  appear in a client response, a log, or an error message. The endpoint URL can
  embed an API key.
- `grantCruushPlusPlan` is the single entitlement implementation, shared with the
  existing checkout path so the two cannot drift.

## Known gaps, deliberate

- **No sweeping or gas funding.** Money lands at derived addresses and stays
  there. Collecting it is a separate, unbuilt operator task.
- **No refunds.** cruush does not refund cruush+, recorded as product invariant
  G7. The `refunded` status is unreachable record-keeping only.
- **No rendered proof of the QR code.** Showing it needs an assigned address,
  which needs the processor enabled with an xpub, and enabling a test-vector xpub
  outside automated tests is forbidden. Covered by unit and route tests only.
- **One RPC endpoint per chain**, so provider disagreement is not handled.
- **Depeg is not handled.** The quote is arithmetic on USD cents against a
  dollar-pegged token. If a token loses its peg, nothing halts checkout.

## Blocked on the owner

1. A wallet. It must be created outside this repo and outside any agent session;
   only the public xpub is ever handed over. No seed phrase, private key, or
   xprv touches cruush or a machine running an agent.
2. A JSON-RPC provider. Dwellir was chosen on its free tier: at a 60-second poll
   the worst case is about 5,760 requests a day across both chains, under 6% of
   the free allowance, and it costs nothing while no payment is in progress.
   Its European status was not verified from a primary source.
3. Sign-off on the settlement policy table in the plan doc.
4. An unresolved HIGH security finding in the local wallet tool: its check for
   agent sessions is bypassable with a pseudo-terminal. Mitigated, documented,
   and explicitly not a security boundary. It gates the recovery drill.
5. Checkout consent capture for the EU right of withdrawal, which the no-refunds
   position depends on.
