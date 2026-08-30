# Fable handoff: crypto checkout and Venmo-compatible rail

Worktree: `/Volumes/good/Cruushv2-crypto-processor-20260822`
Branch: `feature/v2-crypto-processor-20260822`
Publication target: none

## Current state

The recovered crypto payment implementation is still disabled by default. It
accepts no funds and has not been deployed. The checkout remains account-linked
and voucher-free.

The implementation now supports two server-selected receiving rails:

- USDC on Base.
- PYUSD on Ethereum, for customers who use Venmo or PayPal external crypto
  transfers.

The server maps rail IDs to fixed asset, network, chain ID, and token metadata.
Client input cannot choose arbitrary token addresses or prices. Both rails use
watch-only EVM address derivation from the configured receive-chain xpub.

## Changes in this recovery

- Added `server/sql/097_crypto_payment_intents_multi_asset.sql` to allow USDC /
  PYUSD and Base / Ethereum values while preserving the existing schema.
- Extended `server/src/crypto-payments.ts` with fixed rail metadata, idempotent
  rail validation, and public chain/token metadata.
- Extended the crypto route and client API with a named rail selector.
- Updated `src/app/components/CruushPlusStore.tsx` with USDC/Base and
  PYUSD/Ethereum options and asset/network-specific payment instructions.
- Updated wallet quote naming while retaining the existing USDC test alias.
- Updated the plan and tests for the additive PYUSD rail.

## Verification

Green:

- Server crypto tests: 8 passed.
- Client checkout tests: 6 passed.
- Server TypeScript build passed.
- Client Vite build passed.
- Product-name casing check passed.
- `git diff --check` passed.

The client build still reports pre-existing warnings in
`src/app/components/PulseEffectPreview.tsx` and a dynamic/static import notice
for `MapView.tsx`. They are outside this crypto slice.

## Wallet boundary

No wallet was created by the agent. The local operator wallet tool is
development-only and must be initialized by the owner in the separate
`cruushwallet` Mac user after independent security review. Never request or
handle a seed phrase, private key, xprv, QR code, or secret-bearing output.
Only the public receive-chain xpub may later be configured server-side.

The user currently has not created the wallet. Setup instructions were placed
in `/Users/Shared`, but Finder visibility was confusing. Do not treat the
wallet as configured. The setup script is only a non-secret dependency/help
check; wallet initialization remains a separate gated action.

## Remaining blockers and gates

1. Independent review of the local wallet implementation and operator procedure.
2. Owner creates and backs up the software wallet privately.
3. Owner provides only the public receive-chain xpub, never recovery words or
   private keys.
4. Configure the xpub server-side without enabling live settlement.
5. Render and inspect `/store` at desktop and 360x740 mobile sizes.
6. Add a real chain watcher, settlement, entitlement activation, reconciliation,
   refunds, and mainnet operations only in a separately authorized task.

Venmo does not provide an embedded one-click merchant checkout here. Customers
must approve an external PYUSD transfer in Venmo. No Venmo API or card provider
integration was added.

## Continued 2026-08-30

Full detail is in `docs/plans/v2-crypto-processor.md` (Verification recorded
2026-08-30, and the open finding under "Zero-cost software wallet contract").
Short version:

- Fixed a real pre-existing build break in `server/src/crypto-payments.ts`:
  `CryptoPaymentIntentRow` claimed `rail`/`chainId`/`tokenAddress` as DB
  columns that don't exist; moved them to the `CryptoPaymentIntent` output
  type instead, where the client already expected them. `tsc --noEmit` in
  `server/` was failing before this fix and is clean after it.
- Added checkout-completion payment URIs and QR codes (plan slice 5):
  `buildCryptoPaymentUri` (ERC-681, quoted from the current official Final
  spec) plus `withCryptoPaymentDisplay` (reuses the existing `qrcode` server
  dependency already used by `two-factor.ts` — no new dependency). Wired into
  both crypto payment routes and rendered in `CruushPlusStore.tsx`.
  37 server tests and 7 client tests green, including new coverage for both.
  Server and client production builds both pass.
- Fixed a second, shipping-blocking bug: migration `097` was never registered
  in `server/src/migrate.ts`, so the constraint change that allows PYUSD and
  Ethereum never ran. Every PYUSD insert would have failed against a real
  database while the mocked tests passed. The repo's own drift guard
  (`migrate.test.ts`) was failing and catches it; 24/24 green now, and the
  constraint is confirmed applied on a live database.
- Ran an independent security review. One HIGH finding, in the local wallet
  tool: its agent/CI-session refusal check was bypassable with a
  pseudo-terminal (`script(1)`, `node-pty`, `expect`), defeating the promise
  that an agent can never observe real recovery words. Partly mitigated the
  same day — broader env markers including the real `CLAUDE_CODE_SESSION_ID`,
  remote-shell refusal, terminal-recorder parent detection, and a
  live-presence phrase that must be typed before any secret is written to the
  stream, all covered by a new `interactive.test.ts` (21 tool tests green),
  plus honest help text. **It is still not a security boundary and must not
  be described as one.** Blocker #1 stands.
- Brought a real local stack up after all: Docker still isn't running, but
  Homebrew `postgresql@16` is on 5432 (the repo only ever pointed at Docker's
  5433). Rendered and inspected `/store` at 1280x900 and 360x740 — both rails,
  disabled notice, disabled button, bug button clear, nothing clipped — and
  verified live that `/api/crypto/status` returns 200 with no wallet
  configuration leaked and that intent creation fails closed with 503 while
  disabled. The exact command to reproduce the stack is in the plan doc.
- Blocker #5 below is narrower now but not closed: the QR code and payment URI
  still have no rendered proof, because showing them needs an assigned address,
  which needs the processor enabled with an xpub — and the plan forbids
  enabling a test-vector xpub outside automated tests. Unit and route tests
  cover them; no one has seen them on screen.
- No wallet created, no commit, no push, no live anything. Same hard
  boundaries as below, unchanged.

## Settlement built 2026-08-30, all disabled by default

Slices 1 to 4 of the plan now exist. Nothing is enabled, no endpoint is
configured, no provider is selected, and no RPC call has ever been made.

- `server/sql/098_crypto_payment_settlement.sql` — observed transfers, watcher
  cursors, settlement columns, and the crypto intent reference on paid access
  records. The safety rules are database constraints, not comments.
- `server/src/crypto-chain-source.ts` — read-only JSON-RPC, shapes quoted from
  the current official docs. Injectable transport, so tests never hit a network.
- `server/src/crypto-settlement-policy.ts` — pure. What an amount means. **The
  values in it are engineering defaults standing in for product decisions and
  need your sign-off**; there is a table in the plan doc listing each one, what
  it currently is, and why.
- `server/src/crypto-watcher.ts` — reads Transfer logs for watched addresses,
  dedupes, counts confirmations, drops reorganized transfers, settles, grants.
- `server/src/crypto-watcher-runtime.ts` — scheduling. Starts only if the
  processor is enabled AND the watcher is enabled AND an endpoint is set, and
  logs which gate is closed otherwise.
- `server/src/crypto-reconciliation.ts` — support lookup by intent, member,
  address, or transaction hash, plus an exception report. Moderator-gated at
  `GET /api/crypto/support/payments` and `/api/crypto/support/reconciliation`.

The entitlement grant was extracted out of `completeFakeCheckoutSession` into
`grantCruushPlusPlan` in `server/src/billing.ts`, so the crypto path and the
existing checkout path are now the same code and cannot drift on what a plan
grants. Existing checkout behaviour is unchanged.

Proven against the live local database, by trying to break it rather than only
by mocks: paid-without-an-amount refused, entitlement-on-an-unpaid-intent
refused, the legitimate order allowed, and the same chain log inserted twice
refused. The reconciliation report correctly went from clean to reporting
`paid_without_entitlement` the moment a grant was removed.

134 server tests green across ten files. Two failures in `src/app.test.ts`
(`/api/cruush/:userId`, `/api/cruush/me`) were confirmed pre-existing by
restoring the baseline `billing.ts` and re-running.

## Decisions made 2026-08-30, on instruction to pick

Julien asked for research and a decision rather than options. All three are
cheap to reverse and all are written up with reasoning in the plan doc.

**RPC provider: Dwellir, and it costs nothing.** Free tier, 100k responses/day,
flat 1:1 pricing, no card. Cost today is zero regardless, because the watcher
is off. When it is on, the worst case (a checkout open 24/7) is about 11.5k
calls/day across both chains, roughly 9x inside the free tier. The deciding
factor between providers is that this workload is almost entirely
`eth_getLogs`, which compute-unit providers charge at 60x (Alchemy) to 255x
(Infura) a cheap call, so their larger-looking allowances buy fewer of the
requests actually made.

**Three changes made after you raised the budget, so the running cost is as
close to nothing as this can get:**

1. **Idle means zero requests.** A pass checks the database for watchable
   intents and returns before touching the chain if there are none. With no
   live intent there is no payment address in existence, so nothing on chain
   could concern us. It also drops the stale scan position, so resuming after a
   quiet spell starts near the head instead of grinding back through every
   block it slept past.
2. **Abandoned checkouts stop being watched after 7 days.** This was a real
   leak, not a tuning knob: accepting late payment with no bound meant every
   abandoned checkout was watched forever, so the watch set only grew and the
   watcher would poll for eternity on payments that will never arrive. Money
   arriving later is not lost, it still lands in a cruush-controlled wallet and
   reconciliation finds it by address or transaction hash; it just is not
   settled automatically.
3. **Poll is 60 seconds, not 30.** The confirmation wait dominates anyway
   (~60s Base, ~2.4 min Ethereum), so the faster poll bought nothing a member
   would notice and doubled the requests.

Worst case is now about 5,760 requests/day across both chains with a checkout
open continuously 24/7, which is under 6% of the free tier. Realistically it is
near zero, because it only spends anything while someone is actually paying.

If you would rather not create an account at all, `https://mainnet.base.org` is
Base's own public endpoint: no key, no signup, covers the USDC rail. No
availability guarantee, so a starting point rather than a permanent answer.
Chainstack is the other fallback. Switching is one env var.

Two caveats: the provider can see which addresses we query, which correlates to
paying members, and Dwellir's European status was **not** verified from a
primary source, so check that if it matters.

**Confirmation targets: 30 on Base, 12 on Ethereum, per rail.** This fixed a
real bug rather than just filling in a placeholder. There was one global
confirmation target across two chains whose block times differ by 6x, so the
old `1` bought about 2 seconds of protection on Base for a grant that has no
revoke path. `CRYPTO_PROCESSOR_CONFIRMATION_TARGET` still exists but is now a
floor: it can demand more, never fewer.

**Underpayment tolerance: 50 bps, capped at $0.25.** Was zero. An ERC-20
transfer pays gas separately, so self-custody senders pay exactly, but a
custodial sender (Venmo, PayPal, an exchange) can deduct its fee from the
amount. At zero tolerance that member pays, receives nothing, and has to
contact support while we hold their money. The absolute cap stops the $999
plan forgiving $5 where the $9.99 plan forgives $0.05.

**Contract addresses: verified, both already correct.** USDC on Base against
Circle's own documentation, PYUSD on Ethereum against PayPal's. Both 6
decimals, now recorded in the rail so the assumption is checkable. Noting
without acting: PYUSD is issued by Paxos Trust Company, a US entity, so the
Venmo-compatible rail is the least European part of this design.

**What still needs you, before any real money:**

1. Sign up for Dwellir and set `CRYPTO_PROCESSOR_BASE_RPC_URL`. Nothing is
   watched until then. Requires an account, so it is yours to create.
2. The wallet: create it, back it up, hand over only the public xpub.
3. Resolve the wallet-tool security finding above and get the independent
   review the plan requires.
4. The checkout consent flow that the no-refunds position depends on. See
   below.

## No refunds, decided 2026-08-30

cruush does not refund cruush+; it is a digital good delivered immediately.
Recorded as invariant **G7** in the standing rules doc under `docs/`, so it
applies beyond this branch.

Refund tooling is no longer outstanding work; it will not be built. Code and
docs were swept to match rather than left contradicting the decision:

- Overpayment is still recorded, but as support visibility, not as a "refund
  decision". A member who sends $500 for a $9.99 plan should surface in the
  reconciliation report rather than vanish into the treasury; what happens next
  is your call, not the processor's.
- The `refunded` payment state stays in the schema and transition table, and
  **no code path reaches it**. It is not a feature. It exists so an exceptional
  hand-made refund can be recorded truthfully instead of the ledger disagreeing
  with reality. Left in place deliberately rather than deleted.
- The plan's refund-procedure gate and refund-signing item are gone.

**One thing this needs that is not built.** In the EU a consumer buying digital
content normally has a 14-day withdrawal right. The digital-goods exemption is
real but conditional: it needs the consumer's **prior express consent** to
performance beginning immediately **and their acknowledgement** that this loses
the withdrawal right, both captured at checkout and kept as evidence. A line in
the terms is generally not enough on its own. `/store` captures neither today.

Not implemented here on purpose: it is customer-facing copy and a consent
record, and you write cruush's copy. It is also worth a qualified opinion
rather than an agent's reading of the directive. It is now a listed
payment-launch gate. Flagging it plainly rather than shipping a no-refunds
position with nothing behind it, because the exposure lands on cruush.

Refund tooling is still not built; refunds remain a manual operator action.

NEW ENV VARS — all server-only, all optional, all inert by default:

- `CRYPTO_PROCESSOR_BASE_RPC_URL` — URL, empty default. **May embed an API key,
  so treat as a secret.** Set in the server runtime only.
- `CRYPTO_PROCESSOR_ETHEREUM_RPC_URL` — same, for the PYUSD rail.
- `CRYPTO_PROCESSOR_WATCHER_ENABLED` — boolean, `false`. Turning this on starts
  granting cruush+ from chain reads. Configuration refuses it unless the
  processor is enabled and an endpoint is set.
- `CRYPTO_PROCESSOR_WATCHER_INTERVAL_SECONDS` — integer, `30`.

`server/.env.example` and `docs/env-matrix.md` are both updated.

## Hard boundaries

No commit, push, merge, deployment, production activation, live payment, live
RPC, chain watcher, signing endpoint, card form, third-party provider API, or
secret-bearing wallet command was run.
