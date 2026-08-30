# cruush v2 crypto processor plan

Last updated 2026-08-28. This revision records the current product decisions:
direct USDC payment on Base, a seamless account-linked checkout, no voucher or
promo-code issuance step, and a zero-cost software-only operator wallet.

This is an engineering plan. It does not establish licensing, tax, sanctions,
consumer-protection, banking, or payment-provider conclusions. Those questions
require current professional review before real payments are enabled.

## Product outcome

The `/store` page sells fixed terms of cruush+ through one payment. A signed-in
member chooses a term, receives one unique Base address, sends the exact USDC
amount, and sees status updates on the same page. Nothing renews automatically.

Checkout stays linked to the member account so confirmed payment can grant the
selected term without a voucher, code, or second redemption step.

Card payment is a separate future integration. No card processor, approval,
timeline, API contract, or commercial term is assumed in this plan. cruush must
never collect raw card numbers or CVVs.

## Hard safety boundaries

- The cruush browser application, API server, database, deployment environment,
  logs, and support tools must never accept, request, store, or transmit a seed
  phrase, private key, extended private key, or wallet signing credential.
- A separate local operator tool is the only component permitted to handle
  recovery words. It accepts them only through a hidden interactive terminal,
  keeps them only for the current process, and never accepts them through a
  command argument, environment variable, file, pipe, or agent session.
- The local operator tool never stores a recovery phrase, private key, xprv, or
  signing credential. The operator keeps the recovery words physically.
- No model, agent, screen share, support session, issue, log, screenshot, or
  source file may observe real recovery words, a private key, or an xprv.
- Server configuration may contain only a watch-only receive-chain xpub.
- Treat the xpub as privacy-sensitive server configuration. It reveals a branch
  of public addresses even though it cannot sign transactions.
- Derive a unique receiving address for every payment intent.
- Never reuse an address after it has been assigned to an intent.
- Browser input and browser redirects are display-only. They never mark a
  payment confirmed and never grant cruush+.
- Keep `CRYPTO_PROCESSOR_ENABLED=false` until every real-money gate in this
  document passes.
- Never enable a test-vector xpub outside automated tests.
- Until an explicit later review enables mainnet, the local tool may sign only
  Base Sepolia transactions and may never broadcast them.

An xpub alone cannot authorize a spend. That does not make a compromised server
harmless: an attacker controlling the application could redirect future
checkout addresses or falsify display state. Address verification, chain-source
validation, reconciliation, and deployment integrity remain required.

## Current local implementation

Worktree: `/Volumes/good/Cruushv2-crypto-processor-20260822`

Branch: `feature/v2-crypto-processor-20260822`

Baseline: `5a77cb504d23bea71867cf0558bd10ede40e2248`

Nothing in this worktree is committed, pushed, deployed, or enabled in
production.

Implemented locally:

- `server/sql/096_crypto_payment_intents.sql` defines payment intents and an
  event intake table. Each intent receives a database identity
  index, an xpub fingerprint, and a unique payment address.
- `server/src/crypto-wallet.ts` validates a depth-4 public receive-chain xpub,
  rejects xprv-shaped input, derives non-hardened public children, converts them
  to checksummed Ethereum addresses, fingerprints the configured xpub, and
  quotes USD cents as six-decimal USDC atomic units.
- Server wallet derivation uses `@scure/bip32` and `@noble/hashes`. The server
  includes no mnemonic, private-key, transaction-signing, RPC, or broadcast
  dependency.
- `server/src/crypto-payments.ts` reserves the database derivation index before
  deriving the address, binds idempotency keys to one purchase, and moves a new
  intent from `pending` to `awaiting_payment` inside one transaction.
- `server/src/routes/crypto-payments.ts` exposes authenticated status, intent
  creation, and ownership-scoped intent lookup. Pricing always comes from the
  existing server billing catalog.
- `src/app/components/CruushPlusStore.tsx` renders the account-linked `/store`
  flow. It has no voucher step, no asset picker, and no network picker. The only
  configured rails are USDC on Base and PYUSD on Ethereum. PYUSD is the
  Venmo-compatible receiving option. The server maps rail IDs to fixed token
  and network metadata.
- The existing `/upgrade` route keeps its prior destination. `/store` is added
  without replacing the existing rewards checkout flow.
- `tools/cruush-wallet` is an isolated local operator package. It can generate
  and verify the public wallet descriptor in a direct non-agent terminal, and
  it can sign only bounded Base Sepolia gas-funding and Circle USDC sweep plans.
  It has no RPC client or broadcast command and refuses secret-bearing commands
  in agent, CI, piped, or redirected sessions.

Verification recorded 2026-08-28:

- Local wallet TypeScript build passed. Its 11 public-vector tests passed and
  `npm audit --omit=dev` reported 0 vulnerabilities.
- The 33 focused server wallet, payment-core, route, and configuration tests
  passed before the treasury-index review. The updated payment-core suite then
  passed 7 tests, including rejection of treasury index `0`. The server build
  passed.
- All 24 migration tests passed, including discovery of migration `096`.
- The 6 focused checkout API and store component tests passed. The client
  production build passed with one pre-existing duplicate JSX attribute
  warning in `PulseEffectPreview.tsx`, outside this task.
- The disabled `/store` checkout was rendered through the real application at
  desktop size and at 360x740. Top, middle, and bottom states were inspected.
  The accordion and plan selection worked, the payment button remained
  disabled, no content or controls were clipped or blocked, and the final
  clean render produced no browser console warnings or errors.
- A broader client test invocation unintentionally ran the existing full suite
  and exposed unrelated `MapMarkerPin` mock failures. This task did not modify
  those tests. The correctly scoped checkout tests passed afterward.

No real wallet was initialized. No recovery words, funds, RPC endpoint,
transaction broadcast, commit, push, deployment, or production setting was
used for this verification.

Verification recorded 2026-08-30 (continuing this branch, one commit still
unpushed at `5a77cb5`):

- Found and fixed a real, pre-existing build break: `CryptoPaymentIntentRow`
  declared `rail`/`chainId`/`tokenAddress` as if they were columns returned by
  the intent SQL query. No query ever selects them (they don't exist in the
  schema; `mapCryptoPaymentIntent` derives them from `asset`/`network` via the
  `CRYPTO_PAYMENT_RAILS` lookup), so `server/src/crypto-payments.test.ts`'s row
  fixture — which correctly omitted them — failed `tsc -p tsconfig.json` with
  TS2322/TS2353. Moved those three fields to the `CryptoPaymentIntent` output
  type instead, where the client (`src/app/lib/cryptoCheckoutApi.ts`) already
  expected them. `pnpm exec tsc --noEmit` in `server/` is clean after the fix;
  it was not clean before it.
- Added the payment-URI/QR checkout-completion slice described above.
- 37 focused server tests pass (`crypto-payments`, `crypto-payment-routes`,
  `crypto-wallet`, `config`), including 3 new tests for
  `buildCryptoPaymentUri`/`withCryptoPaymentDisplay`. 7 focused client tests
  pass (`CruushPlusStore`, `cryptoCheckoutApi`), including 1 new test for the
  QR image. Server build (`tsc -p tsconfig.json`) and client build (`vite
  build`) both pass.
- Ran an independent security review (a fresh agent, not the one that wrote
  this code) over every file in this slice, scoped to concrete exploitability
  only. One HIGH finding, in the local wallet tool's session-safety check —
  see "Zero-cost software wallet contract" below. Everything else it checked
  came back clean: payment-route ownership (`user_id` always comes from the
  authenticated session, never the client), the derivation-index/address
  uniqueness (enforced by real DB constraints in migration `096`, not just
  application logic), idempotency-key scoping, server-fixed pricing/rail
  metadata (a client can request a rail, never a price or contract), and no
  xpub/fingerprint/derivation-index leakage to any response.
- Found and fixed a second real bug, this one shipping-blocking: migration
  `097_crypto_payment_intents_multi_asset.sql` was never added to the ordered
  `migrationFiles` list in `server/src/migrate.ts`, so it never ran. Without
  it the `096` constraints stay `check (asset in ('USDC'))` and
  `check (network in ('base'))`, and every PYUSD/Ethereum intent insert would
  have failed against a real database while every mocked test passed. The
  repo already has a guard for exactly this drift —
  `migrate.test.ts` asserts the list equals the `sql/` directory — and it was
  failing; the 2026-08-28 verification predates `097` (created 2026-08-29), so
  nobody re-ran it. Registered `097`, and `migrate.test.ts` is 24/24 green.
  Confirmed applied against a live database:
  `crypto_payment_intents_asset_check` now reads
  `CHECK ((asset = ANY (ARRAY['USDC'::text, 'PYUSD'::text])))` and the network
  check likewise allows `base` and `ethereum`.
- Brought a real local stack up after all, which the 2026-08-28 session could
  not. Docker is still not running on this machine, but Homebrew
  `postgresql@16` is, on port 5432 — the repo's default only ever pointed at
  Docker's 5433. Created a dedicated database `cruush_crypto_20260830` for
  this worktree rather than reusing any existing one, and ran the frontend on
  5180 / API on 3011 to avoid the ports other sessions are using.
  `server/.env.local` holds the server side (gitignored, so nothing entered
  the tree). The frontend side is passed inline rather than through a root
  `.env.local`, because vitest also loads `.env.local` and a
  `VITE_API_BASE_URL` in it makes `cryptoCheckoutApi.test.ts` fail on absolute
  URLs — a trap worth not leaving behind. To bring the same stack back up:

  ```
  VITE_DEV_PORT=5180 VITE_API_BASE_URL=http://localhost:3011 VITE_DEV_HTTPS=0 pnpm dev:local
  ```

  Use `localhost` on both sides, not `127.0.0.1` on one: the session cookie is
  host-scoped, so a `127.0.0.1` API with a `localhost` frontend logs in over
  curl but leaves the browser at 401.
- Verified against that running stack, not a mock:
  - The development administrator login `admin@cruush.local` /
    `admin-password` works on this exact frontend/API pair.
  - `GET /api/crypto/status` returns 200 with both rails, correct chain IDs
    (8453, 1) and token contracts, and no xpub, fingerprint, or derivation
    index anywhere in the response.
  - `POST /api/crypto/payment-intents` fails closed with 503
    `CRYPTO_PROCESSOR_NOT_READY` while the processor is disabled.
  - `/store` rendered and inspected at 1280x900 desktop and 360x740 mobile,
    top and bottom. Both rails show with their own descriptions, the
    unavailable notice shows, the Pay button is disabled, the bug-report
    button stays top-right clear of everything (D1), and nothing clips or
    overlaps at either size. `/api/crypto/status` returns 200 on the page's
    own network log.
- Still unverified, and deliberately so: the QR code and payment URI have no
  rendered proof, because displaying them requires an assigned payment
  address, which requires enabling the processor with an xpub. This document
  forbids enabling a test-vector xpub outside automated tests, so that was not
  done. The QR path is covered by unit tests at both layers and by the route
  test asserting the exact ERC-681 string and a `data:image/png;base64,` QR,
  but nobody has looked at it on screen. That belongs to the same gate as the
  other configured payment states.
- No real wallet was initialized. No recovery words, funds, RPC endpoint,
  transaction broadcast, commit, push, deployment, or production setting was
  used for this verification either.

Verification recorded 2026-08-30, second pass (settlement slices 1 to 4):

- Migration `098_crypto_payment_settlement.sql` adds `crypto_payment_transfers`,
  `crypto_chain_watch_cursors`, settlement columns on the intent, and the
  crypto intent reference on paid access records. Applied against the live
  local database.
- The database guards were proven by trying to violate them on that live
  database, not only in mocked tests:
  - `update ... set status='paid'` with no confirmed amount was refused by
    `crypto_payment_intents_paid_has_amount_check`.
  - `update ... set entitlement_granted_at=now()` on an `awaiting_payment`
    intent was refused by `crypto_payment_intents_grant_requires_paid_check`.
  - The legitimate order (set paid with an amount, then grant) was allowed.
  - Inserting the same `(chain_id, transaction_hash, log_index)` twice was
    refused, leaving exactly one row.
  Test rows were deleted afterwards.
- The reconciliation queries were run against that live database: lookup by
  transaction hash and by payment address each returned the seeded intent, and
  the exception report correctly reported nothing while the intent was paid and
  granted, then reported `paid_without_entitlement` as soon as the grant was
  removed.
- 134 focused server tests pass across ten files, including 30 new watcher
  tests (reorganization, double-count, partial payment, late payment, split
  payment, concurrent grant claim, malformed logs, unowned addresses), 18
  chain-source tests, 12 settlement-policy tests, and 12 watcher-runtime tests.
  Server `tsc` and `tsc -p tsconfig.json` both clean.
- Two failures exist in `src/app.test.ts` (`GET /api/cruush/:userId` and
  `GET /api/cruush/me`). They were confirmed pre-existing by restoring the
  baseline `billing.ts` from git and re-running: they fail identically without
  any change from this session. They are unrelated to billing or crypto.
- The watcher has never made a real RPC call. No endpoint is configured, no
  provider is selected, `CRYPTO_PROCESSOR_WATCHER_ENABLED` defaults to false,
  and configuration refuses to start the watcher unless the processor is
  enabled and an endpoint is set. Every test injects a fake source.

## Watch-only wallet contract

Current code expects `CRYPTO_PROCESSOR_WALLET_XPUB` to be the public
receive-chain node at `m/44'/60'/0'/0`, which is depth 4. The server derives one
non-hardened child index below that node for each intent.

Before any real address is shown to a customer:

1. Export the receive-chain xpub directly into server configuration. Do not send
   it through chat, issue text, logs, or screenshots.
2. Derive several indexed addresses in the application and independently on the
   selected wallet.
3. Confirm every address matches exactly, including checksum casing.
4. Confirm the wallet can locate and spend from those child paths without
   importing signing material into the server.
5. Record the verified wallet software, export path, and recovery procedure in
   a private operational document.

If the selected wallet cannot export or later spend from this receive-chain
structure reliably, stop. Change the address-allocation design before enabling
payments. Do not work around it by importing an xprv or seed phrase.

## Zero-cost software wallet contract

**Finding 2026-08-30, HIGH, partly mitigated 2026-08-30, still not a
boundary.** What was changed in response: the environment denylist now also
covers `CLAUDE_CODE_SESSION_ID` (the real Claude Code variable, which the
original list missed by name), `CLAUDE_CODE_ENTRYPOINT`, `CURSOR_TRACE_ID`,
and the common CI markers; remote shells are refused outright via `SSH_TTY` /
`SSH_CONNECTION` / `SSH_CLIENT`, because recovery words must never cross a
network link; the parent process is checked against known terminal recorders
and multiplexers (`script`, `expect`, `unbuffer`, `socat`, `screen`, `tmux`,
`asciinema`), which catches the literal exploit below; and
`showRecoveryWordsOnce` now demands an unpredictable three-word phrase be
typed back **before** anything secret is written to the stream, so recovery
words are never emitted into a session nobody is sitting at.
`tools/cruush-wallet/src/interactive.test.ts` covers all of it (21 tool tests
green). The help text no longer claims the tool "refuses Codex, Claude, CI"
outright; it now says these are heuristics that stop accidents and names the
real control. **None of this makes the check a security boundary**, and it
must not be described as one. The original finding stands as written below
and still gates the recovery drill.

Original finding as reported: the session-safety check
that is supposed to refuse secret-bearing commands (`init`, `verify`,
`sign-gas`, `sign-sweep`) in an agent/CI session is bypassable. It gates only
on `stdin.isTTY && stdout.isTTY` plus the absence of 5 named env vars
(`CODEX_SESSION_ID`, `CODEX_THREAD_ID`, `CLAUDECODE`, `CLAUDE_SESSION_ID`,
`CI`). An independent review agent confirmed, by running a `tty-check`
harness under `env -u ... script -q captured.log node tty-check.js` in a
sandbox (not the real wallet — no real initialization was run), that both
signals report exactly what a normal interactive terminal would report even
when the actual driver is a fully automated, non-interactive process wrapped
in a pseudo-terminal. `showRecoveryWordsOnce` writes the words to stdout
before the operator confirms having written them down, so they land in
whatever is capturing that pty's byte stream — the alternate-screen-buffer
trick only clears a real terminal emulator's rendered scrollback, not a
`script(1)`-style capture. Separately, `CLAUDE_SESSION_ID` doesn't match the
real Claude Code environment variable (`CLAUDE_CODE_SESSION_ID`), though
fixing that alone would not close the underlying gap. Net effect: this check
is a speed bump against accidentally running the tool from an agent, not a
boundary that can stop a deliberate one — which is exactly the actor this
tool's own threat model names as forbidden from ever observing a recovery
phrase. This must be resolved, and independently reviewed again, before a
recovery drill or any real wallet initialization — items 1 and "the
cybersecurity reviewer approves the local signing tool and operator
procedure" under "Gates before accepting real money" below.

The approved wallet is a local operator tool under `tools/cruush-wallet`. It is
not part of the cruush client, server, container image, or deployment. No
hardware wallet or paid custody provider is required for this development
slice.

The operator tool uses the standard Ethereum derivation layout:

- Receive-chain public node: `m/44'/60'/0'/0`
- Treasury address: `m/44'/60'/0'/0/0`
- Payment-intent addresses: `m/44'/60'/0'/0/i`, where `i` starts at `1`

The database identity sequence starts at `1`, reserving child index `0` for the
treasury address. The server receives only the depth-4 receive-chain xpub and
continues deriving payment addresses without signing capability.

Initial setup generates recovery words locally and displays them only in an
interactive terminal. The operator writes them down physically. The tool emits
only the public xpub, its fingerprint, and public addresses after the recovery
words are no longer displayed. The agent must build and test this path only
with public deterministic vectors and must never execute real initialization.

Signing is deliberately manual. An online process prepares a bounded unsigned
transaction plan. The operator disconnects the signing computer from the
network, enters the recovery words through hidden terminal input, verifies the
displayed source, destination, amount, fee ceiling, chain, and USDC contract,
and signs. The signed transaction returns to an online process for a separate
broadcast step. This first slice supports Base Sepolia only and does not include
broadcast.

Software custody cannot remove host-compromise risk. Malware present while the
recovery words are entered can steal them. Minimum operating controls before a
recovery drill are FileVault, an isolated macOS account, current operating
system patches, no cloud-synced wallet files, no remote-control or screen-share
session, and a disconnected network during secret entry. A separate offline
computer would reduce risk but is not required by the zero-dollar build scope.

Every derived payment address needs Base ETH before it can send its USDC to the
treasury. Gas funding, batch sweeping, and fee policy remain explicit
pre-production gates. Customer checkout can remain seamless while those
operator actions remain manual. Refund signing is not among them: cruush does
not refund cruush+.

## Payment lifecycle

Current states:

1. `pending`: database intent reserved; no address returned yet.
2. `awaiting_payment`: unique address and exact USDC amount assigned.
3. `confirming`: matching Base transfer observed; confirmation target not yet
   reached.
4. `paid`: configured confirmation target reached and settlement checks passed.
5. `expired`, `failed`, or `cancelled`: no entitlement grant.
6. `refunded`: **not reachable, and not a product feature.** cruush does not
   refund cruush+. This state exists only so that an exceptional refund an
   operator makes by hand can be recorded truthfully. No code path sets it.

Allowed transitions are explicit and forward-only. `expired` cannot become
`paid` under current code. Late-payment policy must be implemented before the
watcher is enabled.

The current intent-creation path ends at `awaiting_payment`. No chain watcher or
entitlement grant exists yet.

## Next implementation slices

### 0. Local software wallet

- Generate recovery words from operating-system cryptographic randomness only.
- Refuse secret input unless both input and output are interactive terminals.
- Refuse secret-bearing commands inside detected Codex, Claude, or CI sessions.
- Never accept recovery words through arguments, environment variables, files,
  pipes, or redirected input.
- Derive the depth-4 receive-chain xpub and independently match public addresses
  at indices `0`, `1`, and multiple nontrivial test indices.
- Sign only strictly validated Base Sepolia gas-funding and USDC sweep plans.
- Never include an RPC client or broadcast command in the signing package.
- Keep signing dependencies outside the production server package and image.
- Require independent cybersecurity review before a recovery drill or testnet
  transaction.

### 1. Chain source and watcher

Built 2026-08-30, disabled by default. `server/src/crypto-chain-source.ts` is a
read-only JSON-RPC client, `server/src/crypto-watcher.ts` is the watcher, and
`server/src/crypto-watcher-runtime.ts` schedules it.

Request and response shapes were taken from the current official Ethereum
JSON-RPC documentation, which Base implements, and are quoted in the header of
`crypto-chain-source.ts`:

- `eth_blockNumber` request `{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":83}`,
  response `{"id":83,"jsonrpc":"2.0","result":"0x4b7"}`.
- `eth_getLogs` takes a filter object with `fromBlock`, `toBlock`, `address`,
  and `topics`; each returned log carries `address`, `topics`, `data`,
  `blockNumber`, `transactionHash`, `transactionIndex`, `blockHash`,
  `logIndex`, and `removed`, where `removed` is documented as "true when the log
  was removed, due to a chain reorganization".

Status of each item:

- Select and document the JSON-RPC source. **Chosen 2026-08-30: Dwellir.**
  Julien asked for a pick rather than options, so this is a decision, not a
  recommendation, and it is cheap to reverse: the code is plain JSON-RPC with
  nothing provider-specific in it, so switching is one environment variable.

  **This costs nothing to run, and that is enforced in code rather than hoped
  for.** Three things do the work:

  1. **No payment in progress means no request at all**, not even a head read.
     A pass checks the database for watchable intents and returns before
     touching the chain if there are none. With no live intent there is no
     payment address in existence, so nothing on chain could concern us. Cost
     scales with actual checkouts, not with uptime.
  2. **Abandoned checkouts stop being watched** seven days after they expire.
     This closes the largest long-run leak in the design: accepting late
     payment without a bound means every abandoned checkout is watched forever,
     so the watch set only ever grows and the watcher polls for eternity on
     payments that will never arrive. Money arriving after the window is not
     lost, it still reaches a wallet cruush controls and reconciliation can
     still find it by address or transaction hash; it just is not settled
     automatically.
  3. **The poll is 60 seconds, not 30.** The confirmation target dominates the
     member's wait anyway (about 60 seconds on Base, about 2.4 minutes on
     Ethereum), so polling twice as often would halve nothing anyone would
     notice while doubling requests.

  Worst case, with a checkout open continuously 24 hours a day: two calls per
  pass per chain (`eth_blockNumber` and `eth_getLogs`) at a 60-second poll, so
  2,880 calls per chain per day, about 5,760 per day for both chains. That is
  under 6% of the free tier below. No subscription, no card, no bill.

  | Provider | Free tier | Charges eth_getLogs at | Notes |
  | --- | --- | --- | --- |
  | **Dwellir** | 100k responses/day | 1:1, flat | Base and Ethereum mainnet with archive. Paid tier starts at $49/mo. |
  | Chainstack | 3M requests/month | 1:1, flat | Largest free allowance. Singapore-headquartered. |
  | Alchemy | 30M compute units/mo | 60 CU | Effectively ~500k getLogs calls. US. |
  | Infura | 100k/day | 255 credits | The multiplier bites hardest on a log-heavy workload. US, ConsenSys. |
  | `mainnet.base.org` | public, no key | n/a | Base's own endpoint. No availability guarantee. Base only. |

  Dwellir wins on the axis that actually matters here: this watcher is almost
  entirely `eth_getLogs`, and providers that price by compute unit charge that
  one call at 60x to 255x a cheap call, so a nominally larger allowance buys
  far fewer of the requests we actually make. Flat 1:1 pricing also means the
  bill stays predictable if the poll interval ever drops.

  If creating an account is itself unwanted, `https://mainnet.base.org` is
  Base's own public endpoint: no key, no signup, no card, and it covers the
  USDC rail. It carries no availability guarantee, so it is a reasonable place
  to start rather than a permanent answer. The PYUSD rail would stay unwatched
  until an Ethereum endpoint exists, which is fine, because a rail nobody can
  settle should not be offered at checkout.

  Two caveats stated plainly. First, the provider sees which addresses we
  query, which correlates to paying members; that is a real privacy leak to a
  third party, and the only way to remove it entirely is self-hosting a node,
  which is not free in storage or operations and is out of scope here.
  Second, Dwellir presents as a European company but **this was not verified**
  from a primary source; if EU-vendor status matters for this, it is worth one
  check before signing up. Chainstack is the fallback if it does not hold up.

- Read current official documentation before adding any chain ID, contract
  address, RPC request, or event shape. Done for the JSON-RPC shapes and the
  ERC-20 `Transfer` topic above. **Token addresses verified 2026-08-30 and both
  already matched the code exactly:**
  - USDC on Base `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, from Circle's
    own contract-address documentation. Circle lists a single native USDC on
    Base, so there is no bridged-USDbC ambiguity to resolve.
  - PYUSD on Ethereum `0x6c3ea9036406852006290770BEdFcAbA0e23A0e8`, from
    PayPal's own material and Etherscan's verified token page.
  Both use 6 decimals, which is what `quoteUsdCentsAsStablecoinAtomic` assumes;
  `decimals` is now recorded in the rail so the assumption is checkable.

  Worth knowing rather than acting on: PYUSD is issued by **Paxos Trust
  Company, a US entity**. Given the standing preference for European payment
  rails, the Venmo-compatible rail is the least European part of this design.
  It is still only a token transfer, not a processor relationship, so nothing
  is changed here, but it should not come as a surprise later.
- Poll ERC-20 `Transfer` logs for assigned addresses. Done. The filter narrows
  by token contract and by recipient topic, so the endpoint does the work
  rather than shipping every transfer on the chain.
- Pin the expected chain ID and token contract. Done, server-side, in
  `CRYPTO_PAYMENT_RAILS`. A client can name a rail, never a contract.
- Deduplicate by chain ID, transaction hash, and log index. Done, and enforced
  by a unique constraint in migration `098`, not only in code.
- Persist observed block number, amount, sender, receiver, transaction hash.
  Done, in `crypto_payment_transfers`.
- Handle timeouts, duplicate logs, and chain reorganization. Done: bounded
  scan ranges, a re-read window behind the cursor, `removed` logs ignored, and
  a sweep that marks vanished transfers `reorganized` without deleting them so
  support can still see them. **RPC disagreement between two providers is not
  handled; there is only one endpoint per chain.**
- Never trust an unverified browser transaction hash as settlement evidence.
  Done. No route accepts a transaction hash as input to settlement; the only
  writer is the watcher.

### 2. Amount, timing, and confirmation policy

The mechanism is in `server/src/crypto-settlement-policy.ts`, which is pure: no
database, no clock, no configuration beyond the policy passed in. Every value
lives in one object, so changing the policy never means touching the watcher.

**Decided 2026-08-30**, on Julien's instruction to pick rather than present
options. These are now the defaults, not placeholders.

| Decision | Value | Reasoning |
| --- | --- | --- |
| Confirmation target, Base | `30` (~60s) | Per rail, not global: this was the bug. Base builds an L2 block about every 2 seconds, so the original `1` bought about 2 seconds of protection on a grant with no revoke path. Base's own finality documentation puts reorg risk at "near 0%" once a transaction is in an L2 block and "effectively 0%" once the batch reaches L1 about 2 minutes later; 30 blocks sits well past the first and heads toward the second, for a minute of member waiting. |
| Confirmation target, Ethereum | `12` (~2.4m) | Ethereum blocks are ~12 seconds and finality is 2 epochs, 64 blocks, about 12.8 minutes. 12 is the ordinary exchange-grade bar for crediting a stablecoin deposit. |
| Underpayment tolerance | `50` bps, capped at `250000` atomic ($0.25) | Not zero, which was wrong. An ERC-20 transfer pays gas separately, so a self-custody sender pays the exact amount, but a custodial sender (Venmo, PayPal, an exchange) can deduct its withdrawal fee from the amount. With zero tolerance that member pays, gets nothing, and has to contact support while cruush holds the money. The absolute cap exists so the $999 lifetime plan does not forgive $5 where the $9.99 weekly plan forgives $0.05. |
| Overpayment flag | `100` bps (1%) | Grant anyway and record it, rather than letting it pass silently. cruush does not refund, so this is support visibility: someone who sends $500 for a $9.99 plan by mistake should appear in the reconciliation report, not vanish into the treasury unnoticed. What happens then is a human's call. |
| Late payment | accepted | A transfer cannot be undone. Refusing it means keeping the money and giving nothing. |

`CRYPTO_PROCESSOR_CONFIRMATION_TARGET` is kept, but now acts as a **floor**: an
operator can demand more confirmations than a rail asks for, never fewer. That
preserves the existing knob without letting it reintroduce the one-number bug.

| Late-arrival watch window | `7` days past expiry | Closed the one remaining open question here, and the largest long-run cost leak: without a bound, every abandoned checkout is watched forever and the watch set only grows. Seven days covers someone who started a checkout, got distracted, and came back days later. Money arriving later is not lost, it still reaches a cruush-controlled wallet and reconciliation can find it by address or transaction hash; it just is not settled automatically. |

Still open: how support safely resumes an intent that fell outside the
late-arrival window. Today that is a manual lookup plus a hand-made grant, and
nothing in the product does it.

### 3. Entitlement grant

Built 2026-08-30.

- Grant only after the watcher moves the intent to `paid`. Done. `settleIntent`
  is the only caller, and it grants only in the same pass that successfully
  claimed the `paid` transition.
- Use the existing cruush+ billing catalog. Done, and more strongly than
  before: the grant body was extracted out of `completeFakeCheckoutSession`
  into `grantCruushPlusPlan` in `server/src/billing.ts`, so the test checkout
  path and the crypto path are now literally the same code and cannot drift on
  what a plan grants. The existing checkout behaviour is unchanged.
- Idempotent at the database boundary. Done, three ways: the claiming update
  matches only a row that is not already paid and not already granted; unique
  partial indexes on `crypto_payment_intent_id` stop a second subscription or
  lifetime record; and a check constraint refuses `entitlement_granted_at` on
  any intent that is not `paid` or `refunded`.
- Record the payment intent ID on the paid access record. Done, via new
  `crypto_payment_intent_id` columns. The existing `checkout_session_id` is
  untouched and stays null for crypto.
- Never grant from a client poll, copied address, member-supplied transaction
  hash, or intent creation. Done. No route can reach the grant.

### 4. Reconciliation and support

Built 2026-08-30 in `server/src/crypto-reconciliation.ts`, read-only, exposed
at `GET /api/crypto/support/payments` and
`GET /api/crypto/support/reconciliation`, both moderator-gated.

- Look up by intent ID, member ID, payment address, and transaction hash. Done.
  Address and transaction hash matter most, because they are the only two
  things a member can actually produce.
- Reconcile assigned addresses against observed transfers and granted
  entitlements. Done. The exception report covers paid-without-entitlement,
  entitlement-without-paid, confirmed-money-that-never-settled, transfers with
  no intent, and anything settlement flagged on the way through.
- The reconciliation endpoint also reports whether the watcher is actually
  running and, if not, which gate is closed. A silent watcher is the failure
  mode that would otherwise go unnoticed until someone complains.
- **Refunds: none. Decided by Julien 2026-08-30.** cruush+ is a digital good
  delivered immediately, and cruush does not refund it. No refund tooling will
  be built, and this is no longer open work.

  What that changed in code: an overpayment is still recorded, but as support
  visibility, not as "flagged for a refund decision". The `refunded` payment
  status stays in the schema and the transition table, and **no code path
  reaches it**; it exists only so an exceptional hand-made refund can be
  recorded truthfully rather than leaving the ledger disagreeing with reality.
  It is not a feature and nothing should be built onto it without Julien
  saying so.

  **One thing this needs to hold up, and it is not built.** In the EU, a
  consumer buying digital content or a digital service normally has a 14-day
  right of withdrawal. The exemption Julien is relying on is real, but it is
  conditional: it applies where the consumer has given **prior express consent**
  to performance beginning immediately **and acknowledged** that doing so loses
  the withdrawal right. Both parts have to be captured at checkout and kept as
  evidence; a line in the terms is generally not enough on its own. Today the
  `/store` checkout captures neither.

  This was deliberately not implemented here, because it is customer-facing
  copy and a consent record, and Julien writes cruush's copy. It is also the
  kind of thing that should be confirmed by someone qualified rather than by
  an agent reading the directive: the existing "legal, tax, sanctions,
  consumer-protection, privacy, refund, and terms review" gate below already
  covers it, and this is now the most concrete item in it. Flagging it plainly
  rather than quietly shipping a no-refunds policy with nothing behind it,
  because the exposure lands on cruush, not on the code.

### 5. Checkout completion

- Done 2026-08-30: payment URIs and QR codes. `buildCryptoPaymentUri` in
  `server/src/crypto-payments.ts` builds an ERC-681 (Final status,
  https://eips.ethereum.org/EIPS/eip-681) `transfer` request URI —
  `ethereum:<tokenContract>@<chainId>/transfer?address=<paymentAddress>&uint256=<atomicAmount>`
  — from metadata already in `CRYPTO_PAYMENT_RAILS`, and only once an address
  and quoted amount exist. `withCryptoPaymentDisplay` renders it to a QR with
  the existing `qrcode` server dependency (same call shape as
  `two-factor.ts`'s `QRCode.toDataURL`, so this is not a second QR
  implementation). Both crypto payment routes return `paymentUri` and
  `qrCodeDataUrl` alongside the intent; `CruushPlusStore.tsx` renders the QR
  image next to the existing copyable address when present. No new
  dependency, no live network call, no change to what is displayed today
  besides the QR image itself. PYUSD/Venmo note: Venmo's own send flow
  supports scanning a wallet-address QR (per Venmo's help docs), but there is
  no confirmed evidence it parses a full ERC-681 request URI rather than a
  bare address — the QR is still spec-correct and the full address stays
  visible/copyable as the reliable fallback either way.
- Keep the full address visible and copyable.
- Warn clearly that sending another asset or using another network may lose
  funds.
- Preserve one-page checkout and account-linked status polling.
- Exercise pending, confirming, paid, expired, failed, and mobile layouts in the
  real local application. Still not done: this needs a running local stack
  (Docker/Postgres), which was not available in this session (see Verification
  log below).

## Card track

Card acceptance remains separate from this direct crypto rail. Before any card
code is added:

- Select an actual processor through written commercial review.
- Read its current official API and webhook documentation.
- Confirm adult-category eligibility and the exact merchant, descriptor,
  chargeback, refund, reserve, settlement, data-retention, and geographic terms
  in writing.
- Use hosted checkout or hosted fields so cruush never receives raw card data.
- Keep card settlement evidence separate from browser redirects.

No card-provider name belongs in configuration, user copy, or code until that
selection and documentation exist.

## Gates before accepting real money

- The local wallet package is absent from the client and server runtime images.
- No real recovery words or signing material appear in Git history, files,
  shell history, environment variables, logs, screenshots, or agent transcripts.
- A recovery drill on a disposable software wallet reproduces the xpub,
  treasury address, and several payment child addresses without network access.
- The cybersecurity reviewer approves the local signing tool and operator
  procedure before any mainnet signing support is added.
- Wallet-path derivation independently matches at multiple indices.
- A small controlled receive reaches the wallet and is reconciled to the exact
  intent without exposing signing material to the server.
- Chain ID and USDC contract address come from current official documentation.
- Watcher tests cover confirmation counting, duplicates, reorganization,
  underpayment, overpayment, expiry, and late arrival.
- Entitlement is granted once and only once from confirmed chain evidence.
- Support lookup and reconciliation work before the first customer payment.
- Gas funding and sweeping are tested on Base Sepolia for multiple child
  addresses before any mainnet transaction is signed.
- Checkout copy accurately states asset, network, amount, expiry, and
  non-renewal behavior.
- Checkout captures the consumer's prior express consent to immediate
  performance and their acknowledgement of losing the EU withdrawal right,
  and stores that as evidence. This is what the no-refunds position rests on
  for a digital good; without it the position is asserted rather than held.
- Desktop and 360x740 mobile disabled-checkout states are rendered and
  inspected. Configured payment states remain a separate gate.
- Production environment variables are set directly in the server runtime and
  independently verified without exposing values.
- One controlled end-to-end payment passes from intent creation through
  entitlement and reconciliation.
- Legal, tax, sanctions, consumer-protection, privacy, and terms review is
  complete for the intended launch jurisdictions, including confirmation that
  the no-refunds position for a digital good holds in each of them.

Until every gate passes, the processor stays disabled and the worktree must not
be described as production-ready.
