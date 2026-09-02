# Fable handoff: crypto checkout and settlement

Current worktree: `/Volumes/good/Cruushv2-crypto-release`

Current branch: `feat/crypto-pricing`

Publication target: `origin/feat/crypto-pricing` only. That remote feature
branch exists. This handoff does not establish the final commit or push state,
so record fresh SHA and ahead/behind evidence after the final verification
pass. Nothing in this handoff authorizes `main`, deployment, or live payment
activation.

This file supersedes the August 2026 recovery notes that referenced
`/Volumes/good/Cruushv2-crypto-processor-20260822` and
`feature/v2-crypto-processor-20260822`.

## Current state

The branch contains an account-linked stablecoin checkout, unique watch-only
receiving addresses, a read-only chain watcher, settlement, entitlement grant,
reconciliation, and a local operator wallet tool. The processor and watcher
remain disabled by default. No real-money readiness claim is authorized.

An intent is allowed only for a ready rail. Readiness requires the processor
enabled, a valid xpub, the watcher enabled, and that rail's chain RPC URL.
Global readiness means at least one rail is ready; it does not make every rail
ready. Checkout disables sources whose mapped rail is not ready.

Before an address becomes payable, the create route verifies the selected
endpoint's `eth_chainId` and reads its head. Migration
`120_crypto_payment_watch_start.sql` stores that head with the address as a
durable intended-chain watch origin. Migration
`121_crypto_payment_chain_positions.sql` gives every intent a durable origin
and cursor on every supported chain. A secondary chain with an existing durable
cursor still verifies `eth_chainId` and reads its current head because that
cursor may be stale after an idle period. Every configured secondary does this
before address issuance; a mismatch or failure blocks issuance. An unconfigured
secondary chain uses block zero and remains unwatchable, leaving an explicit
wrong-network evidence gap.
Each active watcher pass verifies the chain ID again before reading a head or
logs, and a mismatch aborts before any cursor advances. A later watcher outage
catches up in bounded ranges from the persisted per-intent chain positions
instead of a time estimate.

Rails:

| Rail | Chain | Token | Checkout use |
| --- | --- | --- | --- |
| `usdc_arbitrum` | Arbitrum | USDC | Cash App |
| `pyusd_arbitrum` | Arbitrum | PYUSD | PayPal |
| `pyusd_ethereum` | Ethereum | PYUSD | hidden fallback |
| `usdc_base` | Base | USDC | A crypto wallet |

PayPal is an external token transfer, not embedded merchant checkout. No
PayPal, card-provider, or third-party payment API was added.

## Checkout truth

The visible payment choices are exactly "Cash App", "PayPal", and
"A crypto wallet". Do not restore "Something else" or "Other payment
options". A crypto checkout needs a concrete source, not a generic escape
label.

For every plan of at least one month, the monthly equivalent is prominent on
the right and the total is the left-side subtitle. Weekly and lifetime retain
their one-payment amount.

| Term | Total | Monthly equivalent |
| --- | ---: | ---: |
| Six months | $65.94 | $10.99/month |
| Annual | $119.99 | $10.00/month |
| Founder annual | $99.99 | $8.33/month |

Prices always come from `CRUUSH_PLUS_PLANS` in `server/src/billing.ts`. Client
input never controls an amount, asset, network, token contract, or confirmation
target.

The checkout advertises seven capabilities present in this branch:

1. Who has a cruush on you: see your full incoming cruush and profile-view lists.
2. More Pulses: send more Pulses throughout the day.
3. Mile High Club: drop a pin where you are visiting and cruise from there.
4. Feed+: add up to three photo hearts, post to a specific Crowd, and choose when your post expires.
5. Cruise carousel: spin through nearby profiles and browse again.
6. All seeking and visibility controls: use all seeking filters, combine more visibility controls, and add up to 10 searchable profile tags. Basic includes 3.
7. Dark Room: browse the map without appearing on it.

Dark Room and Ghost Mode are separate features. Never call Dark Room Stealth
Mode or Ghost Mode. Nearby profile browsing, text feed posts, and the initial
Carousel spin remain basic capabilities and must not be described as paid
benefits.

The page restores the member's current active intent on reload. While an open
or paid intent owns checkout, the plan and payment-source selectors stay
locked. The server expiry is displayed as a countdown; once the payable window
closes, the page hides the address and QR and stops treating the quote as
fillable. An unavailable restored rail stays selected and locked through the
intent's `paid` state, so readiness changes never discard or switch payment
state.

New orders use a 60-minute server deadline. Before sending, a member may cancel
the order or cancel it to choose another method. The cancelled intent stays in
PostgreSQL, its address is never reused, and a replacement payment is a new
member-linked attempt. Confirming and paid intents cannot be cancelled.

## Settlement safety

The server maps every rail ID to fixed asset, chain, chain ID, contract,
decimals, and confirmation metadata. Each intent gets a unique address derived
from the configured public receive-chain xpub.

The watcher is implemented and remains inert unless deliberately enabled. It
reads ERC-20 `Transfer` logs, deduplicates by chain ID, transaction hash, and
log index, rechecks reorganizations, counts confirmations, settles, and calls
the shared `grantCruushPlusPlan` entitlement function.

Current invariants:

- Only the expected chain and exact token contract count toward settlement.
- Every configured supported chain scans every bounded watchable address for
  all known token contracts on that chain. Known wrong-chain and wrong-token
  transfers are retained as non-creditable evidence but cannot advance or
  settle the intent.
- An exact positive transfer is recorded and moves `awaiting_payment` to
  `confirming` in the same database statement, before final confirmations if
  necessary.
- Every candidate log gets an authoritative timestamp from
  `eth_getBlockByNumber`. The returned block number and hash must match the log,
  and a legacy transfer with a null timestamp never grants.
- `awaiting_payment` and `confirming` may become `paid`. A scheduler-expired
  intent may settle only when its exact-rail transfer is authoritatively
  timestamped at or before `expires_at`, preserving an on-time transfer that
  was still awaiting confirmations.
- A transfer mined after `expires_at` never grants. `failed` and `cancelled`
  never auto-settle or grant.
- A still-unsettled `confirming` intent becomes `failed` seven days after quote
  expiry, while its transfer evidence remains stored for support.
- A terminal intent returns neither payment URI nor QR code.
- Browser polls, copied addresses, and member-supplied transaction hashes
  cannot grant cruush+.
- The database protects the one-payment, one-grant boundary.
- Settlement locks member, intent, exact-rail confirmed transfer rows, then any
  limited-plan supply lock. It re-sums only locked, pre-expiry, exact-chain and
  exact-token evidence inside the paid-and-grant transaction, so a concurrent
  reorganization cannot invalidate the grant total.

Only one active crypto intent is allowed per member. A compatible open intent
is reused, including across a fresh idempotency key, and
`GET /api/crypto/payment-intents/current` is the reload path. Creation is
limited to 5 requests per member per minute. The current and intent-ID reads
share a 30 requests per member per minute limit.

Watcher recipient filters are split into batches of at most 100 addresses.
Payment QR generation uses a 256-entry bounded cache that reuses concurrent
work and removes failed entries. Finite crypto grants stack atomically from the
later existing subscription or entitlement end. Active lifetime access blocks
all new crypto purchases. A successful shared lifetime grant atomically closes
that member's `pending` and `awaiting_payment` crypto intents while preserving
`confirming` intents whose funds were already observed. Duplicate lifetime
access is refused for a fresh purchase. If authoritative on-time evidence later
proves an older lifetime intent was paid after lifetime access was already
active, the watcher records it as `paid`, makes no duplicate grant, adds an
explicit support-review note, and continues the chain pass. That record makes
no refund promise. Founder annual and lifetime founder reservation and grant
checks are serialized transactionally against the 1,000 and 250 supply caps.

The `confirmed_money_not_settled` reconciliation check uses the same threshold
as settlement: 50 basis points, capped at 250000 atomic units ($0.25), and only
the intent's exact chain and token count.

The watcher retains a bounded evidence window after expiry. Evidence-only
support recovery beyond that window is not complete. Older notes overstated
the transaction-hash lookup: a transfer that was never ingested is not made
discoverable merely because support knows its hash. Complete receipt evidence
verification and ingestion for unknown tokens or post-window transfers, plus
the owner policy for post-expiry funds, remain launch blockers.

## RPC decision

Dwellir is not the selected free endpoint. Its free plan returned HTTP 403 for
`eth_getLogs`, which makes it unusable for this watcher regardless of request
allowance.

Arbitrum's public endpoint, `https://arb1.arbitrum.io/rpc`, was exercised on
2026-09-01 against real USDC logs and decoded the expected transfers. It has no
account cost and no availability guarantee. A Base rail still needs a Base RPC
URL, and the Ethereum fallback still needs an Ethereum RPC URL. Per-rail
readiness prevents either from appearing payable without its own watcher
source.

## Wallet boundary

The operator wallet tool is local and separate from the production client and
server runtime. It may handle recovery words only in a direct private Terminal
ceremony. No model, agent, chat, repo, file, command argument, environment
variable, pipe, screenshot, or log may receive recovery words, a private key,
or an xprv.

The current authorized destination is Julien's existing macOS user, not a
separate `cruushwallet` user. After the private confirmation, the tool writes
only an allowlisted public descriptor to:

`/Users/julienlenaz/Library/Application Support/cruush/operator-wallet/public-descriptor.json`

The descriptor contains public fields only and is not a substitute for the
paper recovery backup. Configure only its public receive-chain xpub
server-side, still with the processor and watcher disabled. Independently match
several derived addresses before any customer address is shown.

The first descriptor remains quarantined after Julien reported that its paper
recovery backup might be incorrect. Never fund or configure it. Its replacement
was written only after hidden exact re-entry of all 24 recovery words. The
active public descriptor passed permission, fingerprint, address, and
secret-field checks. No production configuration changed.

## Legal correction

cruush+ is an ongoing interactive digital service, not an immediately consumed
digital good. For EU consumers, immediate access and a checkout acknowledgement
do not generally erase the 14-day withdrawal right before the service is fully
performed. A checkbox is not a no-refund switch.

cruush does not offer generic voluntary refunds for cruush+, but legally
required withdrawals, refunds, remedies, and forced reversals still apply. The
`refunded` state remains so those exceptional outcomes can be recorded
truthfully. Do not add generic refund tooling or refund-offering copy unless
Julien names that scope.

EU/EEA sales remain blocked until jurisdiction-specific legal review and a
compliant service-withdrawal flow are complete, or those consumers are excluded
server-side.

## Useful implementation history

- Migrations `116` through `122` define intents, multi-asset constraints,
  observed transfers, settlement constraints, the durable pre-address watch
  origin, and per-intent positions for every supported chain. Migration `121`
  also adds authoritative block timestamps to transfer evidence. Migration
  `122` sets the database fallback for new order windows to 60 minutes. The ordered
  list in `server/src/migrate.ts` must stay synchronized with the SQL directory.
- `grantCruushPlusPlan` was extracted so crypto and existing checkout grants do
  not drift.
- Payment URI and QR output use fixed server rail metadata. Terminal states now
  suppress both.
- Idle watcher passes return before an RPC call when no intent needs evidence.
- Arbitrum leads Cash App and PayPal reach. Base remains the self-custody
  wallet rail.
- Base Sepolia-only gas and USDC sweep signing primitives exist in the local
  wallet tool, with no RPC client or broadcast command. Mainnet gas funding,
  sweeping, and an independently reviewed operator procedure are not built.
  Funds would remain at derived addresses until those launch gates are complete.

## Remaining launch gates

1. Complete 2026-09-01: replacement wallet passed hidden backup verification and public-only descriptor validation.
2. Independently reproduce derived addresses and a spend path.
3. Complete evidence-only support handling outside the bounded watch.
4. Build and verify gas funding and sweeping without exposing signing material.
5. Render and exercise ready, pending, confirming, paid, expired, failed, and
   unavailable checkout states on desktop and small mobile.
6. Run one controlled payment through chain evidence, grant, and reconciliation.
7. Complete current legal, tax, sanctions, privacy, and consumer review.
8. Keep EU/EEA sales blocked unless their legal flow or exclusion is verified.
9. Keep every unready rail disabled and keep the processor off until all
   applicable gates pass.

## Server environment controls

- `CRYPTO_PROCESSOR_ENABLED`, server boolean, default `false`.
- `CRYPTO_PROCESSOR_WALLET_XPUB`, server-only public descriptor value,
  privacy-sensitive.
- `CRYPTO_PROCESSOR_WATCHER_ENABLED`, server boolean, default `false`.
- `CRYPTO_PROCESSOR_ARBITRUM_RPC_URL`, server URL, may contain a secret.
- `CRYPTO_PROCESSOR_BASE_RPC_URL`, server URL, may contain a secret.
- `CRYPTO_PROCESSOR_ETHEREUM_RPC_URL`, server URL, may contain a secret.
- `CRYPTO_PROCESSOR_WATCHER_INTERVAL_SECONDS`, server integer.

Never expose RPC URLs in client status, logs, or errors. Verify the environment
matrix before publication because this handoff does not establish deployment
configuration.
