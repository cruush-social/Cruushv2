# Current processor handoff: September 12, 2026

Worktree: `/Volumes/good/cruush-processor-security-handoff`. Branch: `security/crypto-processor-review-20260908`. This section supersedes the historical records below. Current scope is processor code for cruush+ and Pulse, native Bitcoin, six-confirmation progress, two-amount checkout guidance and automatic forwarding to ELLIPAL. Blog work is deferred. Julien explicitly requested code completion first and his Bitcoin setup afterward; no production deployment has occurred.

## Delivered implementation

- Shared `/store` and `/store/pulse` checkouts, with the requested links from the cruush+ page and between both checkouts. Existing styles and unrelated behavior remain intact.
- Cash App USDC/Arbitrum, PayPal PYUSD/Arbitrum, Venmo PYUSD/Ethereum and generic USDC/Base remain. Native Bitcoin serves all three named apps, including Cash App where stablecoins are unavailable.
- New orders default to 24 hours through `CRYPTO_PROCESSOR_INTENT_TTL_MINUTES=1440`. Migration 125 preserves existing deadlines. Changing method cancels an unpaid order before creating a new order/address/deadline; confirming orders remain protected.
- Every addressed order locks the product plus collection fee in atomic units. Bitcoin has a fixed BTC quote and requires six confirmations. Server polling supplies actual progress, never a simulated timer.
- Checkout shows the exact recipient amount separately from an estimated available balance for the named app. Unused sending allowance stays with the customer. Generic wallets receive no sender-fee estimate. Provider minimums are disclosed before sending.
- A separate real signing/broadcast service automatically forwards paid addresses to ELLIPAL. It persists signed transactions before broadcast, retries the same bytes, and serializes each wallet/network. No per-order manual collection. Customer-funded collection budget includes network costs; the app's sending fee is separate.
- Migrations 126 and 127 add native Bitcoin evidence and durable collection jobs. The API uses public derivation keys; private receive-chain keys remain with the forwarding service.

## Validation

- Server and wallet TypeScript builds pass; the current client production build passes. The forwarding Docker image also builds successfully.
- Focused server suites passed 101 existing assertions covering watcher, atomicity, Bitcoin helpers and reconciliation. Twelve formerly skipped PostgreSQL cases ran against disposable databases. The added native PostgreSQL suite passed both product cases plus four helper cases, including five-confirmation waiting, reorganization evidence removal, six-confirmation grant-once behavior and confirmation after expiry for an on-time payment.
- Wallet signing/forwarding and RPC tests pass 11 assertions with public, unfunded fixture keys. The forwarding recovery case verifies that a failed pass retains the signed bundle and the next pass reuses it without preparing another transfer. All 30 focused checkout/API assertions pass. No owner keys were handled and no mainnet collection was broadcast.
- Local authenticated checkout created real Arbitrum quotes for both products. Changing Cash App to PayPal created a distinct address and deadline. Pulse returned $2.99 + $0.02 collection: 3.01 USDC to send versus $8.01 suggested Cash App balance. Both checkouts rendered at 375px mobile and 1280px desktop; mobile had no horizontal overflow. Screenshots are in the ignored session evidence directory.
- Bitcoin settlement uses controlled chain evidence in database tests. Actual owner Bitcoin receipt and ELLIPAL forwarding remain unverified until the deferred one-time wallet setup. The implementation is real; these are runtime evidence limits.

## Next owner setup

Follow [Automatic forwarding to ELLIPAL](tools/cruush-wallet/AUTOMATIC_FORWARDING.md). Enable Bitcoin in ELLIPAL, verify its public receiving address, run the private one-time setup, configure the API's public Bitcoin xpub and Esplora endpoint, and start the supplied forwarding service with its private file. Stablecoin collection needs a native ETH working balance on each used EVM network; the service funds individual receiving addresses itself. No ELLIPAL recovery words go into the service.

The application enable/watcher flags are existing configuration, and must be true in the intended live service. This branch does not silently modify production environment variables. The owner explicitly deferred wallet setup; do not invent a destination or repeat the setup question before finishing independent code work.

[Fee policy and every-item table](docs/crypto-checkout-fees.md) · [Current architecture](PROCESSOR_WHITE_PAPER.md). `SECURITY_REVIEW.md` and `THREAT_MODEL.md` describe the prior review baseline; the new automatic signer and Bitcoin paths need the owner's review of this actual implementation.

---

## Historical records below

The following status, disabled/manual workflow and launch-gate statements describe earlier checkpoints only. Current owner scope and the section above govern this revision.

# Current processor security handoff: 8 September 2026

This section supersedes older workspace, Git and readiness instructions below. Historical logs remain as evidence, not as authorization to deploy or move funds.

## Open this checkout

- Worktree: `/Volumes/good/cruush-processor-security-handoff`
- Backing repository: `/Volumes/good/Cruushv2-1`
- Branch: `security/crypto-processor-review-20260908`
- Comparison base: `cad6048f3d85b3662317ef473e68a0d9962a08d6`
- Scope: processor, operator wallet, checkout and direct billing integration only. Accessibility belongs to another agent.

The previous security worktree's Git link pointed to the unavailable archive volume. Its intact source was recovered into this good-volume repository on the original base. The old local commit was not available in the good repository; use the current branch history here. No remote push, deployment, activation, signing or broadcasting is part of this handoff.

## Review packet

1. [Security review](SECURITY_REVIEW.md): source map, test evidence, reproduction commands and launch gates.
2. [Threat model](THREAT_MODEL.md): 19 threat scenarios, trust boundaries, implemented controls and residual risks.
3. [Technical white paper](PROCESSOR_WHITE_PAPER.md): construction, purchase lifecycle, fee model, custody and design rationale.

## Completed scope

- Mandatory live estimated collection fee is included in new purchase totals and persisted with the quote. Fee-bearing orders require the full amount.
- Checkout fee explanation supports hover, focus and tap. Prior rendered evidence and the isolated-page limitation are recorded in the review packet.
- Operator fee reserves and receipt-aware retry handling are included.
- Processor-only review source is isolated from unrelated feature and accessibility work.
- Threat model and architecture white paper are written and linked.

## Evidence boundaries

The recovered snapshot has recorded evidence of 197 processor assertions, 47 wallet assertions and 31 checkout/API-client assertions, with config, migration and pack checks also passing. Thirteen real PostgreSQL integration cases ran against disposable schema-only databases. Server, client and wallet builds passed before this documentation/repository recovery.

These are historical results for the recovered source, not a claim that all tests were rerun during documentation work. Source-integrity and scope checks accompany recovery. No new fee-inclusive on-chain payment was executed for this handoff. Earlier testnet transfers do not prove mainnet readiness.

## Next work

1. Have the security reviewer assess this branch against the fixed base, beginning with the threat model's Critical and High items.
2. Complete fresh dependency installation, migration/upgrade and restore rehearsals in disposable environments.
3. Rehearse the complete new fee-inclusive testnet payment through issuance, chain observation, entitlement and collection. Operator signing stays outside agent tooling.
4. Resolve custody, finality, fee cap/variance, gas replenishment, refund and incident-handling decisions.
5. Obtain explicit deployment and activation approval before enabling real-money processing. Preserve disabled defaults.

Do not ask for recovery words, import signer secrets into the server, or confuse a pinned ELLIPAL recipient with implemented hardware-device signing. Do not merge this older-base snapshot wholesale onto current production without a separate integration review.

---

## Historical handoff record

# Security review branch

Continue from `SECURITY_REVIEW.md` on `security/crypto-processor-review-20260908`.
The original worktree remains unchanged. The records below describe earlier work,
not deployment authorization or the current review branch identity.

# Current continuation: 2026-09-08

This section supersedes the historical operational state below. Work remains local
on `feat/crypto-only`; nothing from this session was committed, pushed, or deployed.

## Verified in this session

- Faucet funded the software treasury with 0.001 Base Sepolia ETH.
- Payment index 13 swept 20 test USDC into the software treasury:
  `0x2d4a599f07121d05dbaf6e8308f7ae078622a89d57534d53eb297a110af6003b`.
- Software treasury sent those 20 test USDC to the public address Julien supplied
  from ELLIPAL, `0x929dbb0E43D1CfD62632c21387f1a248c4c85501`:
  `0x7b0395da35978dd543d65f8aeab485894f41fd8569fd0a0d8455d45eb773ebc5`.
  Receipt status was successful and the destination token balance was 20000000
  atomic units. The software treasury token balance was zero.
- ELLIPAL app does not display these test assets in the user's current view.
  Device spending, Base Sepolia app support, and real-money receipt are NOT proven.
- Julien performed all real-wallet signing and broadcasting in his own Terminal.
  Never read recovery phrases or bypass `assertSafeSecretSession()`.

## Local changes

- `plan-sweep ... --ellipal` selects only the pinned approved destination; omitting
  the flag preserves child-to-treasury sweeps. Explicit ELLIPAL mode supports
  treasury index 0. Signed payload validation checks destination and actual calldata.
- The unsigned-plan serializer now writes nonce strings accepted by the signer.
- RPC rejection diagnostics retain sanitized error messages instead of hiding them.
- Receipt-aware broadcast retries skip already successful funding transactions and
  return without sending anything if the sweep itself is already successful.

## Processor fee work: 2026-09-08

- Julien requested a mandatory purchase fee calculated from live estimated collection
  cost, plus a circled info icon explaining gas on hover. Both are implemented locally.
- New quotes add the fee in stablecoin, round upward to cents, and store the fee,
  ETH/USD price, estimated wei and sample time in intent metadata. Existing addressed
  quotes are reused unchanged. A source failure prevents creation rather than charging zero.
- Collection covers a native funding transaction and a token sweep. Base oracle
  estimates include Layer 1 and operator fees. Arbitrum eth_estimateGas includes its
  Layer 1 component. Coinbase public ETH/USD spot supplies conversion; no key required.
- The fee is an estimate locked for the order, not exact reimbursement. It does not
  automatically convert stablecoin to ETH: the treasury still needs native gas.
- Fee-bearing quotes use zero underpayment tolerance in settlement and reconciliation.
- Wallet planning now reserves Base Layer 1/operator fees for both legs. CLI preview
  labels distinguish execution fee maxima from additional network fees.
- Read-only live quotes succeeded on Base Sepolia (1 cent) and Arbitrum (2 cents).
  A local database quote for 18.99 USD persisted 2 cents of fee and 19.01 USDC total;
  reuse and browser reload retained the same amount. No payment was sent.
- Actual authenticated checkout rendered at 412px and desktop. Hover, tap/click and
  focus displayed the explanation. Screenshots: `.dev/processor-fee-review/`.
- Existing support receipt ingestion already exists at `/api/crypto/support/payment-receipts`.
  It validates chain evidence and can grant for qualifying on-time payments. The older
  claim that an evidence-only recovery endpoint still needed building was inaccurate;
  no duplicate endpoint or new late-payment policy was added.

## Validation

- 107 focused server tests passed; 3 database integration tests skipped.
- 26 checkout tests and 28 wallet tests passed.
- Server, client and wallet builds, casing check and diff whitespace check passed.
- Local review quotes were cancelled after verification; their audit records remain.
- Spawned frontend/API processes were stopped after review.

## Remaining boundaries

- Production deployment, mainnet activation, mainnet spending and independent security
  review remain unverified and unauthorized. This is local review work, not launch clearance.
- The local watcher stayed disabled during fee verification. Local test quotes were
  created through the core function; the full enabled checkout-to-payment-to-grant
  flow with the new fee still needs a separate testnet rehearsal.
- Base Sepolia has no checkout network label in this frontend. Testnet quotes are
  supported by the backend but that member-facing testnet UI is not launch proof.
- Earlier generic RPC rejection was never definitively diagnosed. Do not attribute it
  to fees or propagation without transaction-specific evidence.
- Accessibility menu work belongs to Julien's other agent, explicitly out of this task.

---

## Historical handoff (superseded where noted above)

# Codex handoff: crypto wallet operations (practice sweep + ELLIPAL X Card)

Written 2026-09-08 by the Claude session "FABLE handoff documentation" continuation.
Read the canonical rules file referenced at the top of `CLAUDE.md` first, then
`HANDOFF.md` (branch context), then `FABLE_HANDOFF.md` (full processor state).
This file covers only the two live operational threads on top of them.

## Where things stand

- Worktree: `/Volumes/good/Cruushv2-crypto-release`, branch `feat/crypto-only`,
  HEAD `dced416a`, never pushed. Crypto work must not reach production main.
- Settlement is proven end to end on Base Sepolia (see `HANDOFF.md`): intent
  `896c8580-0c60-48e2-b9da-103d5d23cc60` settled and granted from a real 20 USDC
  faucet transfer.
- The operator wallet tool is `tools/cruush-wallet` (run `node dist/cli.js` there).
  Descriptor fingerprint `5400279c…11d2` matches the server's recorded
  `wallet_xpub_fingerprint`. Derivation path `m/44'/60'/0'/0` (`src/constants.ts`).
- Treasury (index 0): `0x9e374Cf4A9e41784FA2FEE33dDDfEC8b8fbb366A`.
  The settled order's address is derivation index 13 and holds 20 test USDC.
- Verified live 2026-09-08: treasury holds 0 ETH on Base Sepolia
  (`eth_getBalance` via `https://sepolia.base.org`). Nothing has moved since 09-03.

## Thread 1: practice sweep on Base Sepolia (blocked on gas)

Goal: rehearse collecting settled funds before mainnet. The order address
(index 13) holds 20 USDC but zero ETH; the treasury holds zero ETH. The wallet
planner correctly refuses: "Treasury needs more native gas on Base Sepolia
before this sweep." Gas must land in the treasury first.

Faucet routes, all exercised (09-03 and 09-08):

| Faucet | Result |
| --- | --- |
| Alchemy | requires 0.001 ETH held on Ethereum mainnet |
| faucet.trade | requires a public tweet plus CAPTCHA |
| QuickNode | requires a connected browser wallet |
| ethereum-ecosystem.com | deployment paused (dead) |
| Google Cloud Web3 faucet | no Base Sepolia network offered |
| Triangle / Bware / Stakely | HTTP 503 / 530 / 500 (dead) |
| Coinbase CDP | requires Coinbase sign-in (no session in ego lite) |
| **Superchain (console.optimism.io/faucet)** | **live, 0.01 ETH/24h, needs email-OTP sign-in** |

The Superchain sign-in is a Privy email-plus-code flow. First-time sign-in
creates an account under Julien's email, so it is his step, not an agent's.
The previous ego lite task space for this was cleaned up; recreate one, open
`https://console.optimism.io/faucet`, click Sign in, and hand the space to
Julien for the email and code. After he says continue: take the space back,
select the Base Sepolia network, paste the treasury address, claim.

Once the treasury has ETH:

1. `node dist/cli.js plan-sweep usdc_base_sepolia 13 <unsigned-bundle.json>`
   (unguarded, agent may run it).
2. `sign-bundle` and `broadcast-bundle` are Julien-only. They require his seed
   words in a normal interactive Terminal, and `assertSafeSecretSession()`
   deliberately refuses agent, CI, pipe, and recorded sessions. Do not bypass
   that guard, do not wrap the tool in a pseudo-terminal, and never accept seed
   words through chat, files, arguments, or the environment. Hand Julien the
   exact two command lines and stop there.

## Thread 2: ELLIPAL X Card (arrived, setup with Julien)

Julien received an ELLIPAL X Card (NFC card wallet, no display; seed generated
offline on the bundled X Card Starter). He was given the full setup ceremony on
2026-09-03 and has not yet reported back an address. Setup guide source:
`https://support.ellipal.com/x-card/create-a-new-wallet` (docs index:
`https://support.ellipal.com/llms.txt`).

Findings that change the plan (verified against ELLIPAL docs and coin list on
2026-09-03):

- ELLIPAL exposes no xpub export anywhere: no mention of xpub, derivation, or
  address indexes in the entire docs index. The app shows one address per
  network, derived on the card.
- Therefore the `HANDOFF.md` line "regenerate on the hardware device and swap
  `CRYPTO_PROCESSOR_WALLET_XPUB`" cannot be satisfied by this device. The
  processor needs an account xpub at `m/44'/60'/0'/0` and a signer that reaches
  arbitrary indexes; the X Card offers neither.
- The X Card's workable role is cold sweep destination: per-intent receiving
  addresses stay on the software xpub, sweeps send settled funds to the X Card
  address. Note the current sweep tooling targets the derived index-0 treasury;
  a configurable sweep destination would be a code change nobody has authorized
  yet.
- Device support (ellipal.com/pages/coin-list, X Card column): ETH on Ethereum,
  Arbitrum, BASE, Optimism; USDC on Arbitrum and Ethereum but not listed on
  Base; custom tokens addable by contract address in the app.

Waiting on Julien: his X Card ETH address (public, safe in chat). When it
arrives: sanity-check the format, then record the cold-destination decision in
the repo docs. Do not configure anything with it until Julien names that scope.

## Boundaries (restating the ones that bite)

- Never receive, request, or transport seed words, private keys, or an xprv, in
  any channel. `FABLE_HANDOFF.md` "Wallet boundary" is the authority.
- Never bypass or patch `assertSafeSecretSession()`.
- `CRYPTO_PROCESSOR_TESTNET_ENABLED` is refused in production; keep it that way.
- No mainnet enablement, no EU/EEA unblock, no push of this branch, no deploy.
- Ego lite is the browser for anything with a login; hand back only at a
  credential form. Current spaces list has unrelated work (card corners,
  carousel card, zodiac icons, public pages); do not touch those.

## Quick state re-checks for the next session

```bash
# treasury gas (expect 0x0 until the faucet claim happens)
curl -s -X POST https://sepolia.base.org -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getBalance","params":["0x9e374Cf4A9e41784FA2FEE33dDDfEC8b8fbb366A","latest"]}'

# wallet tool status
cd /Volumes/good/Cruushv2-crypto-release/tools/cruush-wallet && node dist/cli.js status
```
