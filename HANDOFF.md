# Handoff: `feat/crypto-pricing`

Worktree: `/Volumes/good/Cruushv2-crypto-release`

Publication target: `origin/feat/crypto-pricing` only. The feature branch
already exists on `origin`. This handoff does not establish the final commit or
push state, so fetch and record the current branch SHA and ahead/behind counts
before any publication. Do not merge, push `main`, deploy, or enable real money
from this handoff.

## Current outcome

This branch contains the production-capable in-house stablecoin checkout,
watcher, settlement, receipt recovery, support, and local wallet tooling for
cruush+. It remains disabled by default. Controlled operational, legal, and
deployment gates remain before real customer payments are enabled.

The first temporary software-wallet descriptor remains quarantined after Julien
reported that its paper recovery backup might be incorrect. Never fund or
configure it. Its replacement was written only after hidden exact re-entry of
all 24 recovery words. The active public descriptor is owned by julienlenaz with
mode `0600`; its fingerprint matches its receive-chain xpub, its treasury and
three sample addresses validate, and it contains no secret fields. Do not put a
descriptor or any wallet secret in the repository.

Readiness is per rail. A rail may accept an intent only when all four of its
gates are present:

1. `CRYPTO_PROCESSOR_ENABLED=true`.
2. A valid watch-only receive-chain xpub is configured.
3. `CRYPTO_PROCESSOR_WATCHER_ENABLED=true`.
4. That rail's chain has a configured RPC URL.

Global status is ready when at least one rail is ready. Checkout must disable
every source whose mapped rail is not ready. This prevents a customer from
receiving a payment address for a rail the watcher cannot settle. The current
local configuration keeps the processor and watcher off.

Intent creation verifies the selected RPC's `eth_chainId`, then reads its head
before assigning an address. Migration `100_crypto_payment_watch_start.sql`
persists that exact head as the address's durable intended-chain watch origin.
Migration `101_crypto_payment_chain_positions.sql` adds one durable origin and
cursor for every intent on every supported chain. The intended chain keeps its
exact pre-address head. Before publishing the address, each other supported
configured chain must verify `eth_chainId` and supply its current head. A global
cursor is not used for allocation because it can be stale after an idle period.
An unconfigured chain falls back to block zero and is not currently watchable,
so wrong-network evidence on it has an explicit recovery gap. All positions are
inserted atomically with address allocation. A transfer counts only when its
block number is strictly greater than that position's origin.

If the selected RPC or any configured secondary RPC is unavailable or
identifies the wrong chain, no address becomes payable. Every active watcher
pass checks `eth_chainId` again before reading the head or logs. A mismatch
aborts before any cursor advances. After an outage, bounded scans resume from
each persisted per-intent chain position until they catch up; they do not guess
from current chain speed.

## Checkout decisions

`/store` asks which app or wallet the member is paying from. These are the only
visible choices:

| Checkout label | Rail |
| --- | --- |
| Cash App | `usdc_arbitrum` |
| Venmo or PayPal | `pyusd_arbitrum` |
| A crypto wallet | `usdc_base` |

The hidden `pyusd_ethereum` rail remains a server fallback. Do not expose a
generic "Something else" or "Other payment options" choice. Those labels say
nothing useful in a crypto checkout.

For terms of one month or longer, the monthly equivalent is the prominent
right-side price and the total is the left-side subtitle. Weekly and lifetime
show their one-payment amount because they have no monthly rate.

Current price facts:

| Term | Total | Displayed monthly equivalent |
| --- | ---: | ---: |
| Six months | $65.94 | $10.99/month |
| Annual | $119.99 | $10.00/month |
| Founder annual | $99.99 | $8.33/month |

The server billing catalog remains the source of truth. Never accept a price,
token contract, network, chain ID, or confirmation target from the client.

The seven paid benefits this branch can truthfully advertise are:

1. Who has a cruush on you.
2. See who viewed your profile.
3. Send up to 3 Pulses every 24 hours.
4. Land on a nearby profile in Cruise Carousel, then browse again.
5. Use more than 3 seeking filter categories at once.
6. Use more than 3 visibility filters at once.
7. Use Dark Room to browse without appearing on the map.

Mile High Club and Feed+ remain separate v1.6 release-line work and are not
implemented in this checkout's current tree. Do not advertise either here
until its implementation is merged and verified.

Dark Room is the browse-without-appearing benefit. Ghost Mode is separate.
Never call Dark Room Stealth Mode or Ghost Mode. Basic members can browse
nearby profiles, post text to the local feed, and spin Cruise Carousel. Do not
sell those basic capabilities as cruush+ benefits.

## Payment rails

| Rail | Chain | Token | Confirmations | Checkout source |
| --- | --- | --- | --- | --- |
| `usdc_arbitrum` | Arbitrum 42161 | USDC | 240 | Cash App |
| `pyusd_arbitrum` | Arbitrum 42161 | PYUSD | 240 | Venmo or PayPal |
| `pyusd_ethereum` | Ethereum 1 | PYUSD | 12 | hidden fallback |
| `usdc_base` | Base 8453 | USDC | 30 | crypto wallets |

Token addresses are fixed server-side and were taken from issuer material.
Arbitrum's public RPC endpoint, `https://arb1.arbitrum.io/rpc`, was exercised
against real USDC logs on 2026-09-01. Dwellir's free plan was rejected because
it returned HTTP 403 for `eth_getLogs`, the method this watcher requires. Do
not restore the stale Dwellir recommendation. Base and Ethereum rails still
need their own RPC URLs before those rails can become ready.

## Settlement invariants

- Each intent gets a unique address derived from a public watch-only xpub.
- One member may have at most one active crypto intent. A compatible open
  intent is reused, and `GET /api/crypto/payment-intents/current` restores it
  after a reload.
- Active lifetime access blocks every new crypto purchase. A successful shared
  lifetime grant atomically closes that member's `pending` and
  `awaiting_payment` crypto intents, while preserving `confirming` intents so
  funds already observed can finish settlement.
- A fresh second lifetime purchase is refused. If authoritative on-time
  evidence later proves an older lifetime intent was paid after lifetime access
  was already active, the watcher records that intent as `paid`, makes no
  duplicate grant, adds an explicit support-review note, and continues the
  chain pass. This records no refund and makes no refund promise.
- Only matching chain, token contract, receiving address, and confirmed amount
  count toward settlement.
- Every configured supported chain scans every bounded watchable address and
  every known token contract on that chain. A known wrong-chain or wrong-token
  transfer is retained as non-creditable support evidence. It never advances
  or settles the intent.
- Recording any positive exact-chain, exact-token transfer and moving
  `awaiting_payment` to `confirming` happen atomically, even before the transfer
  reaches its confirmation target.
- Only exact-rail evidence with an authoritative block timestamp at or before
  `expires_at` may count. The watcher reads that timestamp from
  `eth_getBlockByNumber`, validates the returned block number and hash against
  the log, and never grants from a legacy row whose timestamp is null.
- `awaiting_payment` and `confirming` may transition to `paid`. An intent that
  the scheduler already marked `expired` may settle only when the authoritative
  block timestamp proves the exact-rail funds arrived by `expires_at`; this
  preserves an on-time transfer that was still awaiting confirmations.
- Transfers mined after `expires_at` never grant. `failed` and `cancelled`
  intents never auto-settle or grant, even if later evidence is observed.
- A `confirming` intent that still has not settled seven days after quote
  expiry becomes `failed`; its transfer rows remain available to support.
- Terminal intents return no payment URI and no QR code.
- Reorganization-aware transfer rows are retained and cannot double-count.
- Settlement takes locks in one order: member, intent, exact-rail confirmed
  transfer rows, then any limited-plan supply lock. It re-sums the locked,
  pre-expiry, exact-chain and exact-token evidence inside the same transaction
  that claims `paid` and grants access, so a concurrent reorganization cannot
  invalidate the grant total.
- Entitlement uses `grantCruushPlusPlan`, shared with the existing checkout
  path, and is claimed once at the database boundary.
- Finite crypto purchases extend atomically from the later of the current
  subscription end, entitlement end, or now. Founder annual and lifetime
  founder supply reservations and grants are serialized transactionally
  against their 1,000 and 250 caps.

The create route is limited to 5 attempts per member per minute. The current
and ID status routes share a 30 reads per member per minute limit. Watcher log
queries batch at most 100 recipient topics. Payment QR generation uses a
bounded 256-entry cache with concurrent request reuse and failed-entry removal.
The `confirmed_money_not_settled` reconciliation check uses the settlement
threshold exactly: 50 basis points, capped at 250000 atomic units ($0.25), on
the intent's exact chain and token.

The checkout shows the server expiry countdown and stops displaying payable
details when the window closes. Pending or awaiting polling stops at expiry;
confirming polling has a 20-minute post-expiry ceiling. Plan and payment-source
selectors stay locked while an open or paid intent owns checkout. The page
reloads the member's current active intent before choosing defaults. If that
intent's original rail becomes unavailable, the page preserves that rail and
its payment state through `paid`; it never switches or unlocks the checkout.

The watcher keeps a bounded post-expiry evidence window. The moderator-only
`POST /api/crypto/support/payment-receipts` path recovers a transaction first
presented after that window. A supplied hash is only a lookup key. The server
independently reads a successful canonical receipt from the selected configured
chain, verifies its block hash and timestamp, confirmation count, token,
recipient, amount, address origin, and expiry, then reuses the atomic settlement
path. Wrong-token and post-expiry transfers are retained as non-creditable
evidence. Unknown token contracts never grant. The owner decision and legally
required treatment for funds received after quote expiry remain launch work.

## Legal boundary

cruush+ is an ongoing interactive digital service, not immediate digital
content. EU consumers generally retain a 14-day withdrawal right. Immediate
access plus a checkbox does not erase it before full performance. Legally
required withdrawals, refunds, remedies, and forced reversals remain possible.

Do not build generic voluntary refund tooling or refund-offering copy unless
Julien names that scope. Keep the `refunded` ledger state for truthful recording
of exceptional or legally required outcomes. EU/EEA sales remain blocked until
jurisdiction-specific legal review and a compliant service-withdrawal flow are
complete, or those consumers are excluded server-side.

## Primary files

| Concern | File |
| --- | --- |
| Catalog and entitlement grant | `server/src/billing.ts` |
| Rails, intents, readiness, URI, and QR | `server/src/crypto-payments.ts` |
| Route status and intent creation | `server/src/routes/crypto-payments.ts` |
| Read-only JSON-RPC decoding | `server/src/crypto-chain-source.ts` |
| Watcher and settlement | `server/src/crypto-watcher.ts` |
| Per-chain scheduling | `server/src/crypto-watcher-runtime.ts` |
| Amount policy | `server/src/crypto-settlement-policy.ts` |
| Support, receipt recovery, and reconciliation | `server/src/crypto-reconciliation.ts`, `server/src/routes/crypto-payments.ts` |
| Intended-chain watch origin | `server/sql/100_crypto_payment_watch_start.sql` |
| Per-intent chain positions and block timestamps | `server/sql/101_crypto_payment_chain_positions.sql` |
| Checkout | `src/app/components/CruushPlusStore.tsx` |
| Public wallet descriptor tool | `tools/cruush-wallet` |

Migrations `096` through `101` are the complete ordered crypto schema slice.
Keep `server/src/migrate.ts` synchronized with all six files.

## Local preview target

The branch's assigned frontend is `http://localhost:5191/store` and its API is
`http://localhost:3022`. Keep the same `localhost` host on both URLs so the
local session cookie remains first-party. Use `admin@cruush.local` /
`admin-password`. Keep the
API explicitly disabled while previewing:

```sh
PORT=3022 HOST=127.0.0.1 CORS_ORIGIN=http://localhost:5191,http://127.0.0.1:5191 \
  APP_URL=http://localhost:5191 CRYPTO_PROCESSOR_ENABLED=false \
  CRYPTO_PROCESSOR_WATCHER_ENABLED=false npm run dev
```

Verify `/api/crypto/status` reports no ready rail before offering a disabled
preview. Use the exact local ports; other cruush worktrees may also be running.

## Remaining launch gates

- Keep the verified replacement public descriptor as the only active wallet.
  Never expose recovery words, private keys, or an xprv to an agent, repo, log,
  screenshot, or chat.
- Independently match several derived addresses and complete a disposable-wallet
  Base Sepolia recovery, gas-funding, sweep, and broadcast drill.
- Approve production RPC endpoints and an operating gas budget. Mainnet sweep
  planning, offline signing, and confirmed sequential broadcast are implemented
  but no agent has signed or broadcast a transaction.
- Render and exercise every configured payment state at desktop and small
  mobile sizes. Source tests and builds do not replace that proof.
- Complete a controlled receive-through-entitlement and reconciliation run.
- Complete jurisdiction-specific legal, tax, sanctions, privacy, and consumer
  review. Block EU/EEA sales until its legal gate is resolved.
- Keep the processor disabled until every applicable gate passes.
